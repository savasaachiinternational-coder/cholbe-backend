import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { pickNextUpcomingAppointment } from '../common/utils/bd-time.util';

@Injectable()
export class ConsultationsService {
  constructor(private prisma: PrismaService) {}

  private readonly doctorInclude = {
    user: { select: { id: true, fullName: true, avatarUrl: true } },
  };

  private async getAppointmentForUser(appointmentId: string, userId: string) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        doctor: { include: this.doctorInclude },
      },
    });
    if (!appt) throw new NotFoundException('Appointment not found');
    const isPatient = appt.patientId === userId;
    const isDoctor = appt.doctor.user.id === userId;
    if (!isPatient && !isDoctor) throw new ForbiddenException('Not allowed');
    return appt;
  }

  async findActiveAppointment(doctorId: string, userId: string) {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { id: doctorId },
      include: { user: { select: { id: true } } },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');

    const appointments = await this.prisma.appointment.findMany({
      where: {
        patientId: userId,
        doctorId,
        status: { notIn: ['cancelled', 'CANCELLED', 'no_show', 'NO_SHOW'] },
      },
      orderBy: [{ scheduledDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        doctor: { include: this.doctorInclude },
      },
    });

    return (
      pickNextUpcomingAppointment(appointments) ??
      appointments.find((appt) => appt.status === 'in_progress') ??
      appointments[0] ??
      null
    );
  }

  async listMessages(appointmentId: string, userId: string) {
    await this.getAppointmentForUser(appointmentId, userId);
    return this.prisma.consultationMessage.findMany({
      where: { appointmentId },
      include: {
        sender: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sendMessage(
    appointmentId: string,
    userId: string,
    body: { content: string; attachmentUrl?: string; attachmentType?: string },
  ) {
    await this.getAppointmentForUser(appointmentId, userId);
    return this.prisma.consultationMessage.create({
      data: {
        appointmentId,
        senderId: userId,
        content: body.content,
        attachmentUrl: body.attachmentUrl,
        attachmentType: body.attachmentType,
      },
      include: {
        sender: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
      },
    });
  }

  async getContext(appointmentId: string, userId: string) {
    const appt = await this.getAppointmentForUser(appointmentId, userId);
    const patient = await this.prisma.user.findUnique({
      where: { id: appt.patientId },
      select: { id: true, fullName: true, avatarUrl: true, phone: true, email: true },
    });
    const latestReport = await this.prisma.healthReport.findFirst({
      where: { patientId: appt.patientId },
      orderBy: { reportDate: 'desc' },
    });
    const { doctor, ...appointmentRest } = appt;
    return {
      appointment: {
        ...appointmentRest,
        patient,
        doctor: {
          id: doctor.id,
          specialty: doctor.specialty,
          isOnline: doctor.isOnline,
          imageUrl: doctor.imageUrl,
          user: doctor.user,
        },
      },
      sharedReport: latestReport
        ? {
            title: latestReport.title,
            provider: latestReport.provider,
            reportDate: latestReport.reportDate,
            fileUrl: latestReport.fileUrl,
          }
        : null,
    };
  }

  async submitFeedback(
    appointmentId: string,
    userId: string,
    body: { rating: number; comment?: string },
  ) {
    const appt = await this.getAppointmentForUser(appointmentId, userId);
    if (appt.patientId !== userId) throw new ForbiddenException('Only patient can rate');
    if (appt.status.toLowerCase() !== 'completed') {
      throw new BadRequestException('You can only review completed consultations');
    }
    if (!body.rating || body.rating < 1 || body.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }
    const existing = await this.prisma.consultationFeedback.findUnique({
      where: { appointmentId },
    });
    if (existing) {
      throw new BadRequestException('Review already submitted for this consultation');
    }
    return this.prisma.consultationFeedback.create({
      data: {
        appointmentId,
        doctorId: appt.doctorId,
        rating: body.rating,
        comment: body.comment,
      },
    });
  }

  async getFeedback(appointmentId: string, userId: string) {
    await this.getAppointmentForUser(appointmentId, userId);
    return this.prisma.consultationFeedback.findUnique({ where: { appointmentId } });
  }
}
