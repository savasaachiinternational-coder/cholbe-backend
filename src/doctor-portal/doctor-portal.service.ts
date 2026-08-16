import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { NotificationsService } from '../notifications/notifications.service';
import { DoctorAvailabilityService } from '../doctors/doctor-availability.service';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  isAppointmentUpcoming,
  pickNextUpcomingAppointment,
  startOfDayBd,
  endOfDayBd,
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
export class DoctorPortalService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private availability: DoctorAvailabilityService,
  ) {}

  private appointmentInclude = {
    patient: { select: { id: true, fullName: true, phone: true, email: true, avatarUrl: true } },
    doctor: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
    _count: { select: { messages: true } },
  };

  private async requireDoctor(userId: string) {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true } },
      },
    });
    if (!doctor) throw new NotFoundException('Doctor profile not found');
    return doctor;
  }

  private async getDoctorId(userId: string) {
    const doctor = await this.requireDoctor(userId);
    return doctor.id;
  }

  async getProfile(userId: string) {
    const doctor = await this.requireDoctor(userId);
    const full = await this.prisma.doctorProfile.findUnique({
      where: { id: doctor.id },
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true } },
        specialtyRef: true,
        weeklyAvailability: { orderBy: { dayOfWeek: 'asc' } },
        dateOverrides: { orderBy: { date: 'asc' } },
        qualifications: { orderBy: { createdAt: 'asc' } },
        experiences: { orderBy: { startDate: 'desc' } },
        instructions: { orderBy: { startDate: 'desc' } },
        payoutMethods: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!full) throw new NotFoundException('Doctor profile not found');

    const [reviewStats, wallet] = await Promise.all([
      this.prisma.consultationFeedback.aggregate({
        where: { doctorId: doctor.id },
        _avg: { rating: true },
        _count: { rating: true },
      }),
      this.getWalletSummary(doctor.id),
    ]);

    return {
      ...full,
      experiences: full.experiences.map(e => ({
        ...e,
        duration: calcDuration(e.startDate, e.endDate, e.isPresent),
      })),
      instructions: full.instructions.map(i => ({
        ...i,
        duration: calcDuration(i.startDate, i.endDate, i.isPresent),
      })),
      reviewAverage: reviewStats._avg.rating ?? 0,
      reviewCount: reviewStats._count.rating,
      earnings: {
        total: wallet.totalEarnings,
        availableBalance: wallet.availableBalance,
        pendingWithdrawal: wallet.pendingWithdrawal,
        completedAppointments: wallet.completedConsultations,
      },
    };
  }

  async getDashboard(userId: string) {
    const profile = await this.getProfile(userId);
    const now = new Date();
    const todayStart = startOfDayBd(now);
    const todayEnd = endOfDayBd(now);
    const baseWhere = { doctorId: profile.id };

    const [todayAppointments, upcomingCandidates, totalAppointments, patients, recentAppointments, consultationCount] =
      await Promise.all([
        this.prisma.appointment.findMany({
          where: {
            ...baseWhere,
            scheduledDate: { gte: todayStart, lte: todayEnd },
            status: { notIn: ['cancelled', 'CANCELLED', 'no_show', 'NO_SHOW'] },
          },
        }),
        this.prisma.appointment.findMany({
          where: {
            ...baseWhere,
            scheduledDate: { gte: todayStart },
            status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
          },
        }),
        this.prisma.appointment.count({ where: baseWhere }),
        this.prisma.appointment.findMany({
          where: baseWhere,
          distinct: ['patientId'],
          select: { patientId: true },
        }),
        this.prisma.appointment.findMany({
          where: baseWhere,
          orderBy: { scheduledDate: 'desc' },
          take: 5,
          include: this.appointmentInclude,
        }),
        this.prisma.appointment.count({
          where: {
            ...baseWhere,
            OR: [{ consultationType: 'CHAT' }, { messages: { some: {} } }],
            status: { notIn: ['cancelled', 'CANCELLED', 'no_show', 'NO_SHOW'] },
          },
        }),
      ]);

    const todayCount = todayAppointments.length;
    const upcomingAppointments = upcomingCandidates.filter((appt) =>
      isAppointmentUpcoming(appt.scheduledDate, appt.timeSlot, appt.status, appt.durationMin),
    );
    const nextAppointment = pickNextUpcomingAppointment(
      await this.prisma.appointment.findMany({
        where: {
          ...baseWhere,
          scheduledDate: { gte: todayStart },
          status: { notIn: ['cancelled', 'CANCELLED', 'completed', 'COMPLETED', 'no_show', 'NO_SHOW'] },
        },
        include: this.appointmentInclude,
      }),
    );

    return {
      doctor: profile,
      stats: {
        todayAppointments: todayCount,
        upcomingAppointments: upcomingAppointments.length,
        totalPatients: patients.length,
        totalAppointments,
        activeConsultations: consultationCount,
      },
      nextAppointment,
      recentAppointments,
    };
  }

  async listAppointments(userId: string, status?: string) {
    const doctorId = await this.getDoctorId(userId);
    return this.prisma.appointment.findMany({
      where: {
        doctorId,
        ...(status && status !== 'all' ? { status } : {}),
      },
      include: this.appointmentInclude,
      orderBy: { scheduledDate: 'desc' },
    });
  }

  async listPatients(userId: string) {
    const doctorId = await this.getDoctorId(userId);
    const appointments = await this.prisma.appointment.findMany({
      where: { doctorId },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            avatarUrl: true,
            patientProfile: { select: { age: true, gender: true, bloodGroup: true } },
          },
        },
      },
      orderBy: { scheduledDate: 'desc' },
    });

    const map = new Map<
      string,
      {
        patient: (typeof appointments)[0]['patient'];
        appointmentCount: number;
        lastAppointmentDate: Date;
        lastStatus: string;
      }
    >();

    for (const appt of appointments) {
      const existing = map.get(appt.patientId);
      if (!existing) {
        map.set(appt.patientId, {
          patient: appt.patient,
          appointmentCount: 1,
          lastAppointmentDate: appt.scheduledDate,
          lastStatus: appt.status,
        });
      } else {
        existing.appointmentCount += 1;
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => b.lastAppointmentDate.getTime() - a.lastAppointmentDate.getTime(),
    );
  }

  async listConsultations(userId: string) {
    const doctorId = await this.getDoctorId(userId);
    return this.prisma.appointment.findMany({
      where: {
        doctorId,
        OR: [
          { consultationType: 'CHAT' },
          { consultationType: 'VIDEO' },
          { messages: { some: {} } },
        ],
        status: { notIn: ['cancelled', 'CANCELLED', 'no_show', 'NO_SHOW'] },
      },
      include: this.appointmentInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async updateProfile(
    userId: string,
    body: {
      fullName?: string;
      phone?: string;
      specialty?: string;
      specialtyId?: string;
      degree?: string;
      fee?: number;
      bio?: string;
      imageUrl?: string;
      registrationNumber?: string;
      chamberAddress?: string;
      languages?: string[];
      categories?: string[];
      isOnline?: boolean;
    },
  ) {
    const doctor = await this.requireDoctor(userId);
    let specialtyName = body.specialty;
    if (body.specialtyId) {
      const spec = await this.prisma.specialty.findUnique({ where: { id: body.specialtyId } });
      if (!spec) throw new NotFoundException('Specialty not found');
      specialtyName = spec.name;
    }

    if (body.fullName !== undefined || body.phone !== undefined) {
      await this.prisma.user.update({
        where: { id: doctor.userId },
        data: {
          fullName: body.fullName,
          phone: body.phone,
        },
      });
    }

    return this.prisma.doctorProfile.update({
      where: { id: doctor.id },
      data: {
        specialty: specialtyName,
        specialtyId: body.specialtyId,
        degree: body.degree,
        fee: body.fee,
        bio: body.bio,
        imageUrl: body.imageUrl,
        registrationNumber: body.registrationNumber,
        chamberAddress: body.chamberAddress,
        languages: body.languages,
        categories: body.categories,
        isOnline: body.isOnline,
      },
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true } },
        specialtyRef: true,
      },
    });
  }

  async addQualification(
    userId: string,
    body: { degree: string; institution: string; fieldOfStudy?: string; yearFrom?: number; yearTo?: number },
  ) {
    const doctorId = await this.getDoctorId(userId);
    return this.prisma.doctorQualification.create({ data: { doctorId, ...body } });
  }

  async updateQualification(
    userId: string,
    qualId: string,
    body: { degree?: string; institution?: string; fieldOfStudy?: string; yearFrom?: number; yearTo?: number },
  ) {
    const doctorId = await this.getDoctorId(userId);
    const q = await this.prisma.doctorQualification.findFirst({ where: { id: qualId, doctorId } });
    if (!q) throw new NotFoundException('Qualification not found');
    return this.prisma.doctorQualification.update({ where: { id: qualId }, data: body });
  }

  async removeQualification(userId: string, qualId: string) {
    const doctorId = await this.getDoctorId(userId);
    const q = await this.prisma.doctorQualification.findFirst({ where: { id: qualId, doctorId } });
    if (!q) throw new NotFoundException('Qualification not found');
    await this.prisma.doctorQualification.delete({ where: { id: qualId } });
    return { deleted: true };
  }

  async addExperience(
    userId: string,
    body: { title: string; institution: string; startDate: string; endDate?: string; isPresent?: boolean },
  ) {
    const doctorId = await this.getDoctorId(userId);
    const exp = await this.prisma.doctorExperience.create({
      data: {
        doctorId,
        title: body.title,
        institution: body.institution,
        startDate: new Date(body.startDate),
        endDate: body.isPresent ? null : body.endDate ? new Date(body.endDate) : null,
        isPresent: body.isPresent ?? false,
      },
    });
    return { ...exp, duration: calcDuration(exp.startDate, exp.endDate, exp.isPresent) };
  }

  async updateExperience(
    userId: string,
    expId: string,
    body: { title?: string; institution?: string; startDate?: string; endDate?: string; isPresent?: boolean },
  ) {
    const doctorId = await this.getDoctorId(userId);
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

  async removeExperience(userId: string, expId: string) {
    const doctorId = await this.getDoctorId(userId);
    const exp = await this.prisma.doctorExperience.findFirst({ where: { id: expId, doctorId } });
    if (!exp) throw new NotFoundException('Experience not found');
    await this.prisma.doctorExperience.delete({ where: { id: expId } });
    return { deleted: true };
  }

  async addInstruction(
    userId: string,
    body: { name: string; startDate: string; endDate?: string; isPresent?: boolean },
  ) {
    const doctorId = await this.getDoctorId(userId);
    const instr = await this.prisma.doctorInstruction.create({
      data: {
        doctorId,
        name: body.name,
        startDate: new Date(body.startDate),
        endDate: body.isPresent ? null : body.endDate ? new Date(body.endDate) : null,
        isPresent: body.isPresent ?? false,
      },
    });
    return { ...instr, duration: calcDuration(instr.startDate, instr.endDate, instr.isPresent) };
  }

  async updateInstruction(
    userId: string,
    instrId: string,
    body: { name?: string; startDate?: string; endDate?: string; isPresent?: boolean },
  ) {
    const doctorId = await this.getDoctorId(userId);
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

  async removeInstruction(userId: string, instrId: string) {
    const doctorId = await this.getDoctorId(userId);
    const instr = await this.prisma.doctorInstruction.findFirst({ where: { id: instrId, doctorId } });
    if (!instr) throw new NotFoundException('Instruction not found');
    await this.prisma.doctorInstruction.delete({ where: { id: instrId } });
    return { deleted: true };
  }

  async createWeeklySlot(
    userId: string,
    body: { dayOfWeek: number; startTime: string; endTime: string; slotMinutes?: number; isActive?: boolean },
  ) {
    const doctorId = await this.getDoctorId(userId);
    return this.availability.createWeeklySlot(doctorId, body);
  }

  async updateWeeklySlot(
    userId: string,
    slotId: string,
    body: {
      dayOfWeek?: number;
      startTime?: string;
      endTime?: string;
      slotMinutes?: number;
      isActive?: boolean;
    },
  ) {
    const doctorId = await this.getDoctorId(userId);
    return this.availability.updateWeeklySlot(doctorId, slotId, body);
  }

  async deleteWeeklySlot(userId: string, slotId: string) {
    const doctorId = await this.getDoctorId(userId);
    return this.availability.deleteWeeklySlot(doctorId, slotId);
  }

  async setDateOverride(userId: string, date: string, isAvailable: boolean) {
    const doctorId = await this.getDoctorId(userId);
    return this.availability.setDateOverride(doctorId, date, isAvailable);
  }

  async upsertPayoutMethod(
    userId: string,
    body: {
      id?: string;
      label: string;
      methodType: 'BANK' | 'BKASH' | 'NAGAD';
      accountMasked: string;
      isPrimary?: boolean;
    },
  ) {
    const doctorId = await this.getDoctorId(userId);
    if (body.isPrimary) {
      await this.prisma.doctorPayoutMethod.updateMany({
        where: { doctorId },
        data: { isPrimary: false },
      });
    }

    if (body.id) {
      const existing = await this.prisma.doctorPayoutMethod.findFirst({
        where: { id: body.id, doctorId },
      });
      if (!existing) throw new NotFoundException('Payout method not found');
      return this.prisma.doctorPayoutMethod.update({
        where: { id: body.id },
        data: {
          label: body.label,
          methodType: body.methodType,
          accountMasked: body.accountMasked,
          isPrimary: body.isPrimary ?? existing.isPrimary,
        },
      });
    }

    const count = await this.prisma.doctorPayoutMethod.count({ where: { doctorId } });
    return this.prisma.doctorPayoutMethod.create({
      data: {
        doctorId,
        label: body.label,
        methodType: body.methodType,
        accountMasked: body.accountMasked,
        isPrimary: body.isPrimary ?? count === 0,
      },
    });
  }

  async removePayoutMethod(userId: string, methodId: string) {
    const doctorId = await this.getDoctorId(userId);
    const method = await this.prisma.doctorPayoutMethod.findFirst({
      where: { id: methodId, doctorId },
    });
    if (!method) throw new NotFoundException('Payout method not found');
    await this.prisma.doctorPayoutMethod.delete({ where: { id: methodId } });
    return { deleted: true };
  }

  async updateAppointmentStatus(userId: string, appointmentId: string, status: string) {
    const doctor = await this.requireDoctor(userId);
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, doctorId: doctor.id },
    });
    if (!appt) throw new NotFoundException('Appointment not found');

    const updated = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status },
      include: this.appointmentInclude,
    });

    void this.notifications.create(
      appt.patientId,
      'appointment',
      'Appointment Status Updated',
      `Your appointment has been ${status}.`,
    );

    return updated;
  }

  private async getWalletSummary(doctorId: string) {
    const [earningsAgg, withdrawnAgg, pendingAgg, recentAppointments, recentWithdrawals] =
      await Promise.all([
        this.prisma.appointment.aggregate({
          where: { doctorId, status: { in: ['completed', 'COMPLETED'] } },
          _sum: { fee: true },
          _count: { id: true },
        }),
        this.prisma.doctorWithdrawal.aggregate({
          where: { doctorId, status: { in: ['PAID', 'PROCESSING', 'PENDING'] } },
          _sum: { amount: true },
        }),
        this.prisma.doctorWithdrawal.aggregate({
          where: { doctorId, status: 'PENDING' },
          _sum: { amount: true },
        }),
        this.prisma.appointment.findMany({
          where: { doctorId, status: { in: ['completed', 'COMPLETED'] } },
          include: {
            patient: { select: { fullName: true } },
          },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        }),
        this.prisma.doctorWithdrawal.findMany({
          where: { doctorId },
          include: { payoutMethod: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);

    const totalEarnings = Number(earningsAgg._sum.fee ?? 0);
    const totalWithdrawn = Number(withdrawnAgg._sum.amount ?? 0);
    const pendingWithdrawal = Number(pendingAgg._sum.amount ?? 0);
    const availableBalance = Math.max(0, totalEarnings - totalWithdrawn);

    return {
      totalEarnings,
      availableBalance,
      pendingWithdrawal,
      completedConsultations: earningsAgg._count.id,
      recentEarnings: recentAppointments.map(a => ({
        id: a.id,
        patientName: a.patient.fullName,
        amount: a.fee,
        date: a.scheduledDate,
        consultationType: a.consultationType,
        timeSlot: a.timeSlot,
      })),
      recentWithdrawals,
    };
  }

  async getFinance(userId: string) {
    const doctorId = await this.getDoctorId(userId);
    const wallet = await this.getWalletSummary(doctorId);
    const payoutMethods = await this.prisma.doctorPayoutMethod.findMany({
      where: { doctorId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    return { wallet, payoutMethods };
  }

  async listWithdrawals(userId: string) {
    const doctorId = await this.getDoctorId(userId);
    return this.prisma.doctorWithdrawal.findMany({
      where: { doctorId },
      include: { payoutMethod: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async requestWithdrawal(userId: string, body: { amount: number; payoutMethodId?: string }) {
    const doctorId = await this.getDoctorId(userId);
    if (!body.amount || body.amount <= 0) {
      throw new BadRequestException('Withdrawal amount must be greater than zero');
    }

    const wallet = await this.getWalletSummary(doctorId);
    if (body.amount > wallet.availableBalance) {
      throw new BadRequestException('Insufficient available balance');
    }

    let payoutMethodId = body.payoutMethodId;
    if (!payoutMethodId) {
      const primary = await this.prisma.doctorPayoutMethod.findFirst({
        where: { doctorId, isPrimary: true },
      });
      if (!primary) {
        throw new NotFoundException('Add a payout method before withdrawing');
      }
      payoutMethodId = primary.id;
    } else {
      const method = await this.prisma.doctorPayoutMethod.findFirst({
        where: { id: payoutMethodId, doctorId },
      });
      if (!method) throw new NotFoundException('Payout method not found');
    }

    return this.prisma.doctorWithdrawal.create({
      data: {
        doctorId,
        payoutMethodId,
        amount: body.amount,
        status: 'PENDING',
      },
      include: { payoutMethod: true },
    });
  }
}
