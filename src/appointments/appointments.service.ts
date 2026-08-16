import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConsultationType, PaymentMethod, UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.module';
import { AgoraService } from '../agora/agora.service';
import { DoctorAvailabilityService } from '../doctors/doctor-availability.service';
import { NotificationsService } from '../notifications/notifications.service';
import { endOfDay, startOfDay } from '../common/utils/availability.util';
import {
  formatAppointmentDateBd,
  parseAppointmentDateOnly,
} from '../common/utils/bd-time.util';

function normalizePaymentMethod(value?: string): PaymentMethod | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if ((Object.values(PaymentMethod) as string[]).includes(upper)) {
    return upper as PaymentMethod;
  }
  return undefined;
}

@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    private agora: AgoraService,
    private availability: DoctorAvailabilityService,
    private notifications: NotificationsService,
  ) {}

  private readonly appointmentInclude = {
    doctor: {
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
    },
    patient: {
      select: { id: true, fullName: true, avatarUrl: true, phone: true, email: true },
    },
  };

  private async findOneForUser(userId: string, id: string) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id },
      include: this.appointmentInclude,
    });
    if (!appt) throw new NotFoundException('Appointment not found');
    const isPatient = appt.patientId === userId;
    const isDoctor = appt.doctor.user.id === userId;
    if (!isPatient && !isDoctor) throw new ForbiddenException('Not allowed');
    return appt;
  }

  async findMine(userId: string, role?: string) {
    if (role?.toUpperCase() === UserRole.DOCTOR) {
      const doctor = await this.prisma.doctorProfile.findUnique({ where: { userId } });
      if (!doctor) throw new NotFoundException('Doctor profile not found');
      return this.prisma.appointment.findMany({
        where: { doctorId: doctor.id },
        include: this.appointmentInclude,
        orderBy: { scheduledDate: 'desc' },
      });
    }

    return this.prisma.appointment.findMany({
      where: { patientId: userId },
      include: {
        doctor: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
      },
      orderBy: { scheduledDate: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    return this.findOneForUser(userId, id);
  }

  async updateStatus(userId: string, id: string, status: string) {
    const appt = await this.findOneForUser(userId, id);
    await this.prisma.appointment.update({
      where: { id },
      data: { status },
    });

    const isDoctor = appt.doctor.user.id === userId;
    const notifyUserId = isDoctor ? appt.patientId : appt.doctor.user.id;
    void this.notifications.create(
      notifyUserId,
      'appointment',
      'Appointment Status Updated',
      `Your appointment has been ${status}.`,
    );

    return this.prisma.appointment.findUnique({
      where: { id },
      include: this.appointmentInclude,
    });
  }

  async getAgoraToken(userId: string, id: string) {
    const appt = await this.findOneForUser(userId, id);
    if (!appt.agoraChannel) {
      throw new NotFoundException('Video channel not ready for this appointment');
    }
    return this.agora.buildRtcToken(appt.agoraChannel);
  }

  async book(
    patientId: string,
    body: {
      doctorId: string;
      scheduledDate: string;
      timeSlot: string;
      durationMin?: number;
      paymentMethod?: string;
      consultationType?: ConsultationType;
    },
  ) {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { id: body.doctorId },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');

    const dateOnly = body.scheduledDate.slice(0, 10);
    const { available, slots } = await this.availability.getSlotsForDate(body.doctorId, dateOnly);
    if (!available || !slots.includes(body.timeSlot)) {
      throw new BadRequestException('Selected time slot is not available');
    }

    const scheduledDate = parseAppointmentDateOnly(dateOnly);
    const dayStart = startOfDay(scheduledDate);
    const dayEnd = endOfDay(scheduledDate);
    const duplicate = await this.prisma.appointment.findFirst({
      where: {
        doctorId: body.doctorId,
        scheduledDate: { gte: dayStart, lte: dayEnd },
        timeSlot: body.timeSlot,
        status: { notIn: ['cancelled', 'CANCELLED', 'no_show', 'NO_SHOW'] },
      },
    });
    if (duplicate) throw new ConflictException('Time slot already booked');

    const consultationType = body.consultationType ?? ConsultationType.VIDEO;
    const channel =
      consultationType === ConsultationType.CHAT
        ? null
        : `cholbe_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const appointment = await this.prisma.appointment.create({
      data: {
        patientId,
        doctorId: doctor.id,
        scheduledDate,
        timeSlot: body.timeSlot,
        durationMin: body.durationMin ?? 15,
        fee: doctor.fee,
        paymentMethod: normalizePaymentMethod(body.paymentMethod),
        agoraChannel: channel,
        consultationType,
        status: 'scheduled',
      },
      include: {
        doctor: { include: { user: { select: { fullName: true, avatarUrl: true, id: true } } } },
      },
    });

    // Notify patient
    void this.notifications.create(
      patientId,
      'appointment',
      'Appointment Booked',
      `Your appointment with Dr. ${appointment.doctor.user.fullName} on ${formatAppointmentDateBd(appointment.scheduledDate)} at ${appointment.timeSlot} is confirmed.`,
    );

    // Notify doctor
    void this.notifications.create(
      appointment.doctor.user.id,
      'appointment',
      'New Appointment',
      `A patient booked an appointment on ${formatAppointmentDateBd(appointment.scheduledDate)} at ${appointment.timeSlot}.`,
    );

    // Notify admins
    void this.notifications.notifyAdmins(
      'appointment',
      'New Appointment Booked',
      `A new appointment has been scheduled.`,
    );

    return appointment;
  }
}
