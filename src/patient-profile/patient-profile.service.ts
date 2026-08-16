import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import {
  EmergencyContactDto,
  FamilyMemberDto,
  UpdateHealthVitalsDto,
  UpdatePatientProfileDto,
} from './dto/patient-profile.dto';
import {
  pickNextUpcomingAppointment,
  startOfDayBd,
} from '../common/utils/bd-time.util';

@Injectable()
export class PatientProfileService {
  constructor(private prisma: PrismaService) {}

  private async getProfile(userId: string) {
    const profile = await this.prisma.patientProfile.findUnique({ where: { userId } });
    if (!profile) throw new BadRequestException('Patient profile not found');
    return profile;
  }

  async updateProfile(userId: string, dto: UpdatePatientProfileDto) {
    return this.prisma.patientProfile.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
  }

  async listFamily(userId: string) {
    const profile = await this.getProfile(userId);
    if (profile.managedByUserId) {
      return [];
    }
    return this.prisma.familyMember.findMany({
      where: { patientId: profile.id },
      include: {
        memberUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            patientProfile: {
              select: { age: true, gender: true, bloodGroup: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addFamily(userId: string, dto: FamilyMemberDto) {
    const profile = await this.getProfile(userId);
    if (profile.managedByUserId) {
      throw new BadRequestException('Family accounts cannot add other members');
    }

    const email = dto.email?.trim() || undefined;
    const phone = dto.phone?.trim() || undefined;
    if (!email && !phone) {
      throw new BadRequestException('Email or phone is required for the family member login');
    }
    if (!dto.password || dto.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    if (email) {
      const existingEmail = await this.prisma.user.findUnique({ where: { email } });
      if (existingEmail) throw new ConflictException('Email already registered');
    }
    if (phone) {
      const existingPhone = await this.prisma.user.findUnique({ where: { phone } });
      if (existingPhone) throw new ConflictException('Phone already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.$transaction(async (tx) => {
      const memberUser = await tx.user.create({
        data: {
          fullName: dto.name,
          email: email ?? null,
          phone: phone ?? null,
          passwordHash,
          role: UserRole.CUSTOMER,
          status: UserStatus.ACTIVE,
          avatarUrl: dto.avatarUrl ?? null,
          patientProfile: {
            create: {
              age: dto.age,
              gender: dto.gender,
              managedByUserId: userId,
            },
          },
          cart: { create: {} },
        },
      });

      return tx.familyMember.create({
        data: {
          patientId: profile.id,
          memberUserId: memberUser.id,
          name: dto.name,
          age: dto.age,
          gender: dto.gender,
          relationship: dto.relationship,
          phone: phone ?? null,
          email: email ?? null,
          avatarUrl: dto.avatarUrl,
        },
        include: {
          memberUser: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              avatarUrl: true,
              patientProfile: {
                select: { age: true, gender: true, bloodGroup: true },
              },
            },
          },
        },
      });
    });
  }

  async updateFamily(userId: string, id: string, dto: FamilyMemberDto) {
    const profile = await this.getProfile(userId);
    const member = await this.prisma.familyMember.findFirst({
      where: { id, patientId: profile.id },
    });
    if (!member) throw new NotFoundException('Family member not found');

    const { password: _password, ...memberData } = dto;

    if (member.memberUserId) {
      await this.prisma.user.update({
        where: { id: member.memberUserId },
        data: {
          fullName: dto.name,
          phone: dto.phone?.trim() || undefined,
          email: dto.email?.trim() || undefined,
          avatarUrl: dto.avatarUrl ?? undefined,
          patientProfile: {
            update: {
              age: dto.age,
              gender: dto.gender,
            },
          },
        },
      });
    }

    return this.prisma.familyMember.update({
      where: { id },
      data: {
        name: memberData.name,
        age: memberData.age,
        gender: memberData.gender,
        relationship: memberData.relationship,
        phone: memberData.phone,
        email: memberData.email,
        avatarUrl: memberData.avatarUrl,
      },
      include: {
        memberUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            patientProfile: {
              select: { age: true, gender: true, bloodGroup: true },
            },
          },
        },
      },
    });
  }

  async removeFamily(userId: string, id: string) {
    const profile = await this.getProfile(userId);
    const member = await this.prisma.familyMember.findFirst({
      where: { id, patientId: profile.id },
    });
    if (!member) throw new NotFoundException('Family member not found');

    await this.prisma.$transaction(async (tx) => {
      if (member.memberUserId) {
        await tx.user.delete({ where: { id: member.memberUserId } });
      } else {
        await tx.familyMember.delete({ where: { id } });
      }
    });

    return { deleted: true };
  }

  async listEmergency(userId: string) {
    const profile = await this.getProfile(userId);
    return this.prisma.emergencyContact.findMany({
      where: { patientId: profile.id },
      orderBy: { name: 'asc' },
    });
  }

  async addEmergency(userId: string, dto: EmergencyContactDto) {
    const profile = await this.getProfile(userId);
    return this.prisma.emergencyContact.create({
      data: { patientId: profile.id, ...dto },
    });
  }

  async removeEmergency(userId: string, id: string) {
    const profile = await this.getProfile(userId);
    const contact = await this.prisma.emergencyContact.findFirst({
      where: { id, patientId: profile.id },
    });
    if (!contact) throw new NotFoundException('Emergency contact not found');
    await this.prisma.emergencyContact.delete({ where: { id } });
    return { deleted: true };
  }

  private formatAgo(date: Date): string {
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
  }

  private async getLatestVitals(userId: string) {
    const vitals = await this.prisma.healthVital.findMany({
      where: { patientId: userId },
      orderBy: { recordedAt: 'desc' },
      take: 10,
    });
    const bp = vitals.find((v) => v.vitalType === 'blood_pressure');
    const oxygen = vitals.find((v) => v.vitalType === 'oxygen');
    return {
      bloodPressure: bp
        ? { value: bp.value, checkedAgo: this.formatAgo(bp.recordedAt), recordedAt: bp.recordedAt }
        : null,
      oxygen: oxygen
        ? { value: oxygen.value, checkedAgo: this.formatAgo(oxygen.recordedAt), recordedAt: oxygen.recordedAt }
        : null,
    };
  }

  async updateVitals(userId: string, dto: UpdateHealthVitalsDto) {
    const now = new Date();
    const entries = [];
    if (dto.bloodPressure?.trim()) {
      entries.push({
        patientId: userId,
        vitalType: 'blood_pressure',
        value: dto.bloodPressure.trim(),
        recordedAt: now,
      });
    }
    if (dto.oxygen?.trim()) {
      const value = dto.oxygen.trim();
      entries.push({
        patientId: userId,
        vitalType: 'oxygen',
        value: value.includes('%') ? value : `${value}%`,
        recordedAt: now,
      });
    }
    if (!entries.length) {
      throw new BadRequestException('Provide blood pressure and/or oxygen value');
    }
    await this.prisma.healthVital.createMany({ data: entries });
    return this.getLatestVitals(userId);
  }

  async getOverview(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        patientProfile: {
          include: {
            emergencyContacts: true,
            managedBy: { select: { id: true, fullName: true, email: true, phone: true } },
          },
        },
        addresses: { where: { isDefault: true }, take: 1 },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const isFamilyDependent = Boolean(user.patientProfile?.managedByUserId);
    let familyMembers: Awaited<ReturnType<typeof this.listFamily>> = [];

    if (!isFamilyDependent && user.patientProfile) {
      familyMembers = await this.prisma.familyMember.findMany({
        where: { patientId: user.patientProfile.id },
        include: {
          memberUser: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              avatarUrl: true,
              patientProfile: {
                select: { age: true, gender: true, bloodGroup: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    const [medicationCount, nextAppointment, latestReport, latestDoctorAppointment] =
      await Promise.all([
      this.prisma.medicationSchedule.count({
        where: { patientId: userId, isActive: true },
      }),
      this.prisma.appointment
        .findMany({
          where: {
            patientId: userId,
            status: { in: ['scheduled', 'confirmed', 'in_progress'] },
            scheduledDate: { gte: startOfDayBd(new Date()) },
          },
          include: {
            doctor: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
          },
        })
        .then((rows) => pickNextUpcomingAppointment(rows)),
      this.prisma.healthReport.findFirst({
        where: { patientId: userId },
        orderBy: { reportDate: 'desc' },
      }),
      this.prisma.appointment.findFirst({
        where: { patientId: userId },
        orderBy: { scheduledDate: 'desc' },
        include: {
          doctor: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
        },
      }),
    ]);

    const assignedDoctor =
      nextAppointment?.doctor ?? latestDoctorAppointment?.doctor ?? null;

    const { passwordHash: _, ...safeUser } = user;
    const healthVitals = await this.getLatestVitals(userId);
    const safePatientProfile = user.patientProfile
      ? {
          age: user.patientProfile.age,
          gender: user.patientProfile.gender,
          bloodGroup: user.patientProfile.bloodGroup,
          conditions: user.patientProfile.conditions,
          emergencyContacts: user.patientProfile.emergencyContacts,
          familyMembers,
        }
      : null;

    return {
      user: { ...safeUser, patientProfile: safePatientProfile },
      isFamilyDependent,
      guardian: user.patientProfile?.managedBy ?? null,
      medicationCount,
      nextAppointment,
      assignedDoctor,
      latestReport,
      defaultAddress: user.addresses[0] ?? null,
      healthVitals,
    };
  }

  async getFamilyMemberDetails(parentUserId: string, familyMemberId: string) {
    const parentProfile = await this.getProfile(parentUserId);
    if (parentProfile.managedByUserId) {
      throw new BadRequestException('Only the primary account can view family member details');
    }

    const member = await this.prisma.familyMember.findFirst({
      where: { id: familyMemberId, patientId: parentProfile.id },
      include: {
        memberUser: {
          include: {
            patientProfile: true,
            addresses: { where: { isDefault: true }, take: 1 },
          },
        },
      },
    });

    if (!member?.memberUserId || !member.memberUser) {
      throw new NotFoundException('Family member account not found');
    }

    const memberUserId = member.memberUserId;

    const [medicationCount, medications, reports, appointments, healthVitals, nextAppointment] =
      await Promise.all([
        this.prisma.medicationSchedule.count({
          where: { patientId: memberUserId, isActive: true },
        }),
        this.prisma.medicationSchedule.findMany({
          where: { patientId: memberUserId },
          orderBy: { updatedAt: 'desc' },
          take: 15,
        }),
        this.prisma.healthReport.findMany({
          where: { patientId: memberUserId },
          orderBy: { reportDate: 'desc' },
          take: 15,
        }),
        this.prisma.appointment.findMany({
          where: { patientId: memberUserId },
          orderBy: { scheduledDate: 'desc' },
          take: 8,
          include: {
            doctor: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
          },
        }),
        this.getLatestVitals(memberUserId),
        this.prisma.appointment
          .findMany({
            where: {
              patientId: memberUserId,
              status: { in: ['scheduled', 'confirmed', 'in_progress'] },
              scheduledDate: { gte: startOfDayBd(new Date()) },
            },
            include: {
              doctor: { include: { user: { select: { fullName: true } } } },
            },
          })
          .then((rows) => pickNextUpcomingAppointment(rows)),
      ]);

    const { passwordHash: _, ...safeUser } = member.memberUser;

    return {
      familyMember: {
        id: member.id,
        name: member.name,
        relationship: member.relationship,
        age: member.age,
        gender: member.gender,
        phone: member.phone,
        email: member.email,
        avatarUrl: member.avatarUrl,
      },
      user: safeUser,
      medicationCount,
      medications,
      reports,
      appointments,
      nextAppointment,
      healthVitals,
      defaultAddress: member.memberUser.addresses[0] ?? null,
    };
  }
}
