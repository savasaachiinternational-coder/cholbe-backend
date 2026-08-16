import { Injectable, NotFoundException } from '@nestjs/common';
import { DoctorProfileStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';

function calcDuration(startDate: Date, endDate?: Date | null, isPresent?: boolean): string {
  const end = isPresent || !endDate ? new Date() : endDate;
  const months = Math.floor((end.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem} mo`;
  if (rem === 0) return `${years} yr${years !== 1 ? 's' : ''}`;
  return `${years} yr${years !== 1 ? 's' : ''} ${rem} mo`;
}

@Injectable()
export class DoctorsService {
  constructor(private prisma: PrismaService) {}

  async findAll(search?: string, category?: string, specialtyId?: string) {
    const doctors = await this.prisma.doctorProfile.findMany({
      where: {
        status: DoctorProfileStatus.ACTIVE,
        ...(search
          ? {
              OR: [
                { user: { fullName: { contains: search, mode: 'insensitive' } } },
                { specialty: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(category ? { categories: { has: category } } : {}),
        ...(specialtyId ? { specialtyId } : {}),
      },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
        specialtyRef: true,
      },
    });

    const withRatings = await Promise.all(
      doctors.map(async (d) => {
        const stats = await this.prisma.consultationFeedback.aggregate({
          where: { doctorId: d.id },
          _avg: { rating: true },
          _count: { rating: true },
        });
        return {
          ...d,
          reviewAverage: stats._avg.rating ?? 0,
          reviewCount: stats._count.rating,
        };
      }),
    );

    return withRatings;
  }

  async findOne(id: string) {
    const doctor = await this.prisma.doctorProfile.findFirst({
      where: { id, status: DoctorProfileStatus.ACTIVE },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
        specialtyRef: true,
        qualifications: { orderBy: { createdAt: 'asc' } },
        experiences: { orderBy: { startDate: 'desc' } },
        instructions: { orderBy: { startDate: 'desc' } },
      },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');

    const stats = await this.prisma.consultationFeedback.aggregate({
      where: { doctorId: id },
      _avg: { rating: true },
      _count: { rating: true },
    });

    return {
      ...doctor,
      experiences: doctor.experiences.map((e) => ({
        ...e,
        duration: calcDuration(e.startDate, e.endDate, e.isPresent),
      })),
      instructions: doctor.instructions.map((i) => ({
        ...i,
        duration: calcDuration(i.startDate, i.endDate, i.isPresent),
      })),
      reviewAverage: stats._avg.rating ?? 0,
      reviewCount: stats._count.rating,
    };
  }

  async getReviews(id: string, limit = 20) {
    const doctor = await this.prisma.doctorProfile.findUnique({ where: { id } });
    if (!doctor) throw new NotFoundException('Doctor not found');

    const [reviews, stats] = await Promise.all([
      this.prisma.consultationFeedback.findMany({
        where: { doctorId: id },
        include: {
          appointment: {
            include: {
              patient: { select: { fullName: true, avatarUrl: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.consultationFeedback.aggregate({
        where: { doctorId: id },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);

    return {
      averageRating: stats._avg.rating ?? 0,
      totalReviews: stats._count.rating,
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        patient: {
          fullName: r.appointment.patient.fullName,
          avatarUrl: r.appointment.patient.avatarUrl,
        },
      })),
    };
  }
}
