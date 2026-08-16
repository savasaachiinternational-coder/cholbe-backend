import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DoctorProfileStatus, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.module';
import { DoctorAvailabilityService } from '../doctors/doctor-availability.service';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  isAppointmentUpcoming,
  startOfDayBd,
} from '../common/utils/bd-time.util';

function calcDuration(startDate: Date, endDate?: Date | null, isPresent?: boolean): string {
  const end = isPresent || !endDate ? new Date() : endDate;
  const diffMs = end.getTime() - startDate.getTime();
  const months = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years === 0) return `${remMonths} month${remMonths !== 1 ? 's' : ''}`;
  if (remMonths === 0) return `${years} year${years !== 1 ? 's' : ''}`;
  return `${years} yr${years !== 1 ? 's' : ''} ${remMonths} mo`;
}

@Injectable()
export class AdminDoctorsService {
  constructor(
    private prisma: PrismaService,
    private availability: DoctorAvailabilityService,
  ) {}

  list(status?: DoctorProfileStatus) {
    return this.prisma.doctorProfile.findMany({
      where: status ? { status } : {},
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true, status: true } },
        specialtyRef: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(body: {
    fullName: string;
    email: string;
    phone?: string;
    password?: string;
    specialty: string;
    specialtyId?: string;
    degree?: string;
    fee?: number;
    categories?: string[];
    imageUrl?: string;
    bio?: string;
    registrationNumber?: string;
    chamberAddress?: string;
    languages?: string[];
    status?: DoctorProfileStatus;
    weeklyAvailability?: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      slotMinutes?: number;
      isActive?: boolean;
    }>;
  }) {
    const existing = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new ConflictException('Email already registered');

    let specialtyName = body.specialty;
    if (body.specialtyId) {
      const spec = await this.prisma.specialty.findUnique({ where: { id: body.specialtyId } });
      if (!spec) throw new NotFoundException('Specialty not found');
      specialtyName = spec.name;
    }

    const passwordHash = await bcrypt.hash(body.password ?? 'Password123!', 10);
    const doctor = await this.prisma.user.create({
      data: {
        email: body.email,
        phone: body.phone,
        fullName: body.fullName,
        passwordHash,
        role: UserRole.DOCTOR,
        status: UserStatus.ACTIVE,
        doctorProfile: {
          create: {
            specialty: specialtyName,
            specialtyId: body.specialtyId,
            degree: body.degree,
            fee: body.fee ?? 500,
            categories: body.categories ?? [],
            imageUrl: body.imageUrl,
            bio: body.bio,
            registrationNumber: body.registrationNumber,
            chamberAddress: body.chamberAddress,
            languages: body.languages ?? [],
            status: body.status ?? DoctorProfileStatus.PENDING,
            isOnline: false,
          },
        },
      },
      include: { doctorProfile: true },
    });

    if (body.weeklyAvailability?.length && doctor.doctorProfile) {
      await this.availability.setWeeklyAvailability(doctor.doctorProfile.id, body.weeklyAvailability);
    }

    return this.findOne(doctor.doctorProfile!.id);
  }

  async findOne(id: string) {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true, status: true } },
        specialtyRef: true,
        weeklyAvailability: { orderBy: { dayOfWeek: 'asc' } },
        dateOverrides: { orderBy: { date: 'asc' } },
        qualifications: { orderBy: { createdAt: 'asc' } },
        experiences: { orderBy: { startDate: 'desc' } },
        instructions: { orderBy: { startDate: 'desc' } },
      },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');

    const reviewStats = await this.prisma.consultationFeedback.aggregate({
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
      reviewAverage: reviewStats._avg.rating ?? 0,
      reviewCount: reviewStats._count.rating,
    };
  }

  async update(
    id: string,
    body: {
      fullName?: string;
      phone?: string;
      specialty?: string;
      specialtyId?: string;
      degree?: string;
      fee?: number;
      categories?: string[];
      imageUrl?: string;
      bio?: string;
      registrationNumber?: string;
      chamberAddress?: string;
      languages?: string[];
      status?: DoctorProfileStatus;
      isOnline?: boolean;
    },
  ) {
    const doctor = await this.findOne(id);
    let specialtyName = body.specialty;
    if (body.specialtyId) {
      const spec = await this.prisma.specialty.findUnique({ where: { id: body.specialtyId } });
      if (!spec) throw new NotFoundException('Specialty not found');
      specialtyName = spec.name;
    }

    if (body.fullName || body.phone) {
      await this.prisma.user.update({
        where: { id: doctor.userId },
        data: { fullName: body.fullName, phone: body.phone },
      });
    }

    return this.prisma.doctorProfile.update({
      where: { id },
      data: {
        specialty: specialtyName ?? undefined,
        specialtyId: body.specialtyId,
        degree: body.degree,
        fee: body.fee,
        categories: body.categories,
        imageUrl: body.imageUrl,
        bio: body.bio,
        registrationNumber: body.registrationNumber,
        chamberAddress: body.chamberAddress,
        languages: body.languages,
        status: body.status,
        isOnline: body.isOnline,
      },
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true, status: true } },
        specialtyRef: true,
      },
    });
  }

  async remove(id: string) {
    const doctor = await this.findOne(id);
    const upcomingCandidates = await this.prisma.appointment.findMany({
      where: {
        doctorId: id,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        scheduledDate: { gte: startOfDayBd(new Date()) },
      },
    });
    const activeAppointments = upcomingCandidates.filter((appt) =>
      isAppointmentUpcoming(appt.scheduledDate, appt.timeSlot, appt.status, appt.durationMin),
    ).length;
    if (activeAppointments > 0) throw new BadRequestException('Doctor has upcoming appointments');
    await this.prisma.user.delete({ where: { id: doctor.userId } });
    return { deleted: true };
  }

  // ─── Qualifications ──────────────────────────────────────────────────────────

  async addQualification(
    doctorId: string,
    body: { degree: string; institution: string; fieldOfStudy?: string; yearFrom?: number; yearTo?: number },
  ) {
    await this.findOne(doctorId);
    return this.prisma.doctorQualification.create({ data: { doctorId, ...body } });
  }

  async updateQualification(
    doctorId: string,
    qualId: string,
    body: { degree?: string; institution?: string; fieldOfStudy?: string; yearFrom?: number; yearTo?: number },
  ) {
    const q = await this.prisma.doctorQualification.findFirst({ where: { id: qualId, doctorId } });
    if (!q) throw new NotFoundException('Qualification not found');
    return this.prisma.doctorQualification.update({ where: { id: qualId }, data: body });
  }

  async removeQualification(doctorId: string, qualId: string) {
    const q = await this.prisma.doctorQualification.findFirst({ where: { id: qualId, doctorId } });
    if (!q) throw new NotFoundException('Qualification not found');
    await this.prisma.doctorQualification.delete({ where: { id: qualId } });
    return { deleted: true };
  }

  // ─── Experiences ─────────────────────────────────────────────────────────────

  async addExperience(
    doctorId: string,
    body: { title: string; institution: string; startDate: string; endDate?: string; isPresent?: boolean },
  ) {
    await this.findOne(doctorId);
    const start = new Date(body.startDate);
    const end = body.isPresent ? null : body.endDate ? new Date(body.endDate) : null;
    const exp = await this.prisma.doctorExperience.create({
      data: { doctorId, title: body.title, institution: body.institution, startDate: start, endDate: end, isPresent: body.isPresent ?? false },
    });
    return { ...exp, duration: calcDuration(exp.startDate, exp.endDate, exp.isPresent) };
  }

  async updateExperience(
    doctorId: string,
    expId: string,
    body: { title?: string; institution?: string; startDate?: string; endDate?: string; isPresent?: boolean },
  ) {
    const exp = await this.prisma.doctorExperience.findFirst({ where: { id: expId, doctorId } });
    if (!exp) throw new NotFoundException('Experience not found');
    const updated = await this.prisma.doctorExperience.update({
      where: { id: expId },
      data: {
        title: body.title,
        institution: body.institution,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.isPresent ? null : body.endDate ? new Date(body.endDate) : undefined,
        isPresent: body.isPresent,
      },
    });
    return { ...updated, duration: calcDuration(updated.startDate, updated.endDate, updated.isPresent) };
  }

  async removeExperience(doctorId: string, expId: string) {
    const exp = await this.prisma.doctorExperience.findFirst({ where: { id: expId, doctorId } });
    if (!exp) throw new NotFoundException('Experience not found');
    await this.prisma.doctorExperience.delete({ where: { id: expId } });
    return { deleted: true };
  }

  // ─── Instructions ────────────────────────────────────────────────────────────

  async addInstruction(
    doctorId: string,
    body: { name: string; startDate: string; endDate?: string; isPresent?: boolean },
  ) {
    await this.findOne(doctorId);
    const start = new Date(body.startDate);
    const end = body.isPresent ? null : body.endDate ? new Date(body.endDate) : null;
    const instr = await this.prisma.doctorInstruction.create({
      data: { doctorId, name: body.name, startDate: start, endDate: end, isPresent: body.isPresent ?? false },
    });
    return { ...instr, duration: calcDuration(instr.startDate, instr.endDate, instr.isPresent) };
  }

  async updateInstruction(
    doctorId: string,
    instrId: string,
    body: { name?: string; startDate?: string; endDate?: string; isPresent?: boolean },
  ) {
    const instr = await this.prisma.doctorInstruction.findFirst({ where: { id: instrId, doctorId } });
    if (!instr) throw new NotFoundException('Instruction not found');
    const updated = await this.prisma.doctorInstruction.update({
      where: { id: instrId },
      data: {
        name: body.name,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.isPresent ? null : body.endDate ? new Date(body.endDate) : undefined,
        isPresent: body.isPresent,
      },
    });
    return { ...updated, duration: calcDuration(updated.startDate, updated.endDate, updated.isPresent) };
  }

  async removeInstruction(doctorId: string, instrId: string) {
    const instr = await this.prisma.doctorInstruction.findFirst({ where: { id: instrId, doctorId } });
    if (!instr) throw new NotFoundException('Instruction not found');
    await this.prisma.doctorInstruction.delete({ where: { id: instrId } });
    return { deleted: true };
  }

  // ─── Availability ────────────────────────────────────────────────────────────

  setWeeklyAvailability(
    id: string,
    slots: Array<{ dayOfWeek: number; startTime: string; endTime: string; slotMinutes?: number; isActive?: boolean }>,
  ) {
    return this.availability.setWeeklyAvailability(id, slots);
  }

  createWeeklySlot(
    id: string,
    body: { dayOfWeek: number; startTime: string; endTime: string; slotMinutes?: number; isActive?: boolean },
  ) {
    return this.availability.createWeeklySlot(id, body);
  }

  updateWeeklySlot(
    id: string,
    slotId: string,
    body: {
      dayOfWeek?: number;
      startTime?: string;
      endTime?: string;
      slotMinutes?: number;
      isActive?: boolean;
    },
  ) {
    return this.availability.updateWeeklySlot(id, slotId, body);
  }

  deleteWeeklySlot(id: string, slotId: string) {
    return this.availability.deleteWeeklySlot(id, slotId);
  }

  setDateOverride(id: string, date: string, isAvailable: boolean) {
    return this.availability.setDateOverride(id, date, isAvailable);
  }
}
