import { Injectable, OnModuleInit } from '@nestjs/common';
import { DoctorProfileStatus, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.module';

const TEST_DOCTOR_EMAIL = 'doctor@cholbe.com';
const TEST_DOCTOR_PASSWORD = 'Password123!';

@Injectable()
export class DoctorsBootstrapService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureTestDoctorActive();
  }

  private async ensureTestDoctorActive() {
    const activeCount = await this.prisma.doctorProfile.count({
      where: { status: DoctorProfileStatus.ACTIVE },
    });
    if (activeCount > 0) return;

    const passwordHash = await bcrypt.hash(TEST_DOCTOR_PASSWORD, 10);
    const specialty = await this.prisma.specialty.findFirst({
      where: { slug: 'general-physician' },
    });

    const user = await this.prisma.user.upsert({
      where: { email: TEST_DOCTOR_EMAIL },
      update: {
        fullName: 'Dr. Sarah Ahmed',
        status: UserStatus.ACTIVE,
        role: UserRole.DOCTOR,
      },
      create: {
        email: TEST_DOCTOR_EMAIL,
        fullName: 'Dr. Sarah Ahmed',
        passwordHash,
        role: UserRole.DOCTOR,
        status: UserStatus.ACTIVE,
      },
      include: { doctorProfile: true },
    });

    const doctor =
      user.doctorProfile ??
      (await this.prisma.doctorProfile.create({
        data: {
          userId: user.id,
          specialty: 'General Physician',
          specialtyId: specialty?.id,
          degree: 'MBBS, FCPS',
          fee: 500,
          categories: ['General', 'Physician'],
          isOnline: true,
          status: DoctorProfileStatus.ACTIVE,
        },
      }));

    await this.prisma.doctorProfile.update({
      where: { id: doctor.id },
      data: {
        specialty: 'General Physician',
        specialtyId: specialty?.id,
        degree: 'MBBS, FCPS',
        fee: 500,
        categories: ['General', 'Physician'],
        isOnline: true,
        status: DoctorProfileStatus.ACTIVE,
      },
    });

    const weekly = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek,
      startTime: '09:00',
      endTime: '17:00',
      slotMinutes: 30,
      isActive: true,
    }));

    await this.prisma.doctorWeeklyAvailability.deleteMany({ where: { doctorId: doctor.id } });
    await this.prisma.doctorWeeklyAvailability.createMany({
      data: weekly.map((slot) => ({ doctorId: doctor.id, ...slot })),
    });
  }
}
