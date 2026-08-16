import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import {
  endOfDay,
  generateTimeSlots,
  parseTimeToMinutes,
  startOfDay,
  toDateOnlyIso,
} from '../common/utils/availability.util';
import {
  dayOfWeekBd,
  parseAppointmentDateOnly,
  toDateOnlyIsoBd,
} from '../common/utils/bd-time.util';

@Injectable()
export class DoctorAvailabilityService {
  constructor(private prisma: PrismaService) {}

  private async getDoctor(doctorId: string) {
    const doctor = await this.prisma.doctorProfile.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('Doctor not found');
    return doctor;
  }

  async getSlotsForDate(doctorId: string, dateIso: string) {
    await this.getDoctor(doctorId);
    const date = parseAppointmentDateOnly(dateIso);
    if (Number.isNaN(date.getTime())) {
      return { date: dateIso, available: false, slots: [] as string[] };
    }

    const override = await this.prisma.doctorDateOverride.findUnique({
      where: {
        doctorId_date: { doctorId, date },
      },
    });
    if (override && !override.isAvailable) {
      return { date: toDateOnlyIso(date), available: false, slots: [] as string[] };
    }

    const weeklySlots = await this.prisma.doctorWeeklyAvailability.findMany({
      where: { doctorId, dayOfWeek: dayOfWeekBd(date), isActive: true },
      orderBy: { startTime: 'asc' },
    });
    if (!weeklySlots.length) {
      return { date: toDateOnlyIso(date), available: false, slots: [] as string[] };
    }

    const allSlots = [
      ...new Set(
        weeklySlots.flatMap((weekly) =>
          generateTimeSlots(weekly.startTime, weekly.endTime, weekly.slotMinutes),
        ),
      ),
    ].sort((a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b));
    const booked = await this.prisma.appointment.findMany({
      where: {
        doctorId,
        scheduledDate: { gte: startOfDay(date), lte: endOfDay(date) },
        status: { notIn: ['cancelled', 'CANCELLED', 'no_show', 'NO_SHOW'] },
      },
      select: { timeSlot: true },
    });
    const taken = new Set(booked.map((b) => b.timeSlot));
    const slots = allSlots.filter((slot) => !taken.has(slot));

    return { date: toDateOnlyIso(date), available: slots.length > 0, slots };
  }

  async getAvailableDates(doctorId: string, fromIso: string, days = 14) {
    await this.getDoctor(doctorId);
    const from = startOfDay(parseAppointmentDateOnly(fromIso));
    const weekly = await this.prisma.doctorWeeklyAvailability.findMany({
      where: { doctorId, isActive: true },
    });
    const activeDays = new Set(weekly.map((w) => w.dayOfWeek));

    const overrides = await this.prisma.doctorDateOverride.findMany({
      where: {
        doctorId,
        date: {
          gte: from,
          lte: new Date(from.getTime() + days * 24 * 60 * 60 * 1000),
        },
      },
    });
    const blackout = new Set(
      overrides.filter((o) => !o.isAvailable).map((o) => toDateOnlyIso(o.date)),
    );

    const dates: { date: string; available: boolean }[] = [];
    for (let i = 0; i < days; i++) {
      const dayStart = new Date(from.getTime() + i * 24 * 60 * 60 * 1000);
      const iso = toDateOnlyIsoBd(dayStart);
      const dayEnabled =
        activeDays.has(dayOfWeekBd(parseAppointmentDateOnly(iso))) && !blackout.has(iso);
      if (!dayEnabled) {
        dates.push({ date: iso, available: false });
        continue;
      }
      const { available } = await this.getSlotsForDate(doctorId, iso);
      dates.push({ date: iso, available });
    }
    return dates;
  }

  async setWeeklyAvailability(
    doctorId: string,
    slots: Array<{
      id?: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      slotMinutes?: number;
      isActive?: boolean;
    }>,
  ) {
    await this.getDoctor(doctorId);
    await this.prisma.$transaction(async (tx) => {
      await tx.doctorWeeklyAvailability.deleteMany({ where: { doctorId } });
      if (slots.length) {
        await tx.doctorWeeklyAvailability.createMany({
          data: slots.map((slot) => ({
            doctorId,
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
            slotMinutes: slot.slotMinutes ?? 30,
            isActive: slot.isActive ?? true,
          })),
        });
      }
    });
    return this.listWeekly(doctorId);
  }

  async createWeeklySlot(
    doctorId: string,
    body: {
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      slotMinutes?: number;
      isActive?: boolean;
    },
  ) {
    await this.getDoctor(doctorId);
    return this.prisma.doctorWeeklyAvailability.create({
      data: {
        doctorId,
        dayOfWeek: body.dayOfWeek,
        startTime: body.startTime,
        endTime: body.endTime,
        slotMinutes: body.slotMinutes ?? 30,
        isActive: body.isActive ?? true,
      },
    });
  }

  async updateWeeklySlot(
    doctorId: string,
    slotId: string,
    body: {
      dayOfWeek?: number;
      startTime?: string;
      endTime?: string;
      slotMinutes?: number;
      isActive?: boolean;
    },
  ) {
    const slot = await this.prisma.doctorWeeklyAvailability.findFirst({
      where: { id: slotId, doctorId },
    });
    if (!slot) throw new NotFoundException('Schedule slot not found');
    return this.prisma.doctorWeeklyAvailability.update({
      where: { id: slotId },
      data: body,
    });
  }

  async deleteWeeklySlot(doctorId: string, slotId: string) {
    const slot = await this.prisma.doctorWeeklyAvailability.findFirst({
      where: { id: slotId, doctorId },
    });
    if (!slot) throw new NotFoundException('Schedule slot not found');
    await this.prisma.doctorWeeklyAvailability.delete({ where: { id: slotId } });
    return { deleted: true };
  }

  async setDateOverride(doctorId: string, dateIso: string, isAvailable: boolean) {
    await this.getDoctor(doctorId);
    const date = parseAppointmentDateOnly(dateIso);
    return this.prisma.doctorDateOverride.upsert({
      where: { doctorId_date: { doctorId, date } },
      create: { doctorId, date, isAvailable },
      update: { isAvailable },
    });
  }

  listWeekly(doctorId: string) {
    return this.prisma.doctorWeeklyAvailability.findMany({
      where: { doctorId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  listOverrides(doctorId: string) {
    return this.prisma.doctorDateOverride.findMany({
      where: { doctorId },
      orderBy: { date: 'asc' },
    });
  }
}
