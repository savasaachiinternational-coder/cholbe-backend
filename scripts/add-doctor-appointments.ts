/**
 * Adds upcoming appointments for a doctor, placed in their free weekly-availability slots
 * (Bangladesh time). Safe to run repeatedly — taken and past slots are skipped.
 *
 *   npm run db:doctor-appts                         # doctor@cholbe.com, 7 days, ~3 per day
 *   npm run db:doctor-appts -- dr.kamal@cholbe.com 14 5
 */
import { ConsultationType, PaymentMethod, PrismaClient, UserRole } from '@prisma/client';
import { generateTimeSlots } from '../src/common/utils/availability.util';
import {
  appointmentStartsAtBd,
  dayOfWeekBd,
  parseAppointmentDateOnly,
  toDateOnlyIsoBd,
} from '../src/common/utils/bd-time.util';

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

const CHAT_OPENERS = [
  'Hello doctor, I have had a mild fever since yesterday.',
  'Doctor, my blood pressure readings have been high this week.',
  'Assalamu alaikum, I want to follow up on my last report.',
  'My child has a cough and runny nose for three days.',
];

async function main() {
  const [email = 'doctor@cholbe.com', daysArg = '7', perDayArg = '3'] = process.argv.slice(2);
  const days = Number(daysArg);
  const perDay = Number(perDayArg);

  const doctor = await prisma.doctorProfile.findFirst({
    where: { user: { email } },
    include: { user: true, weeklyAvailability: { where: { isActive: true } }, dateOverrides: true },
  });
  if (!doctor) throw new Error(`No doctor profile for ${email}`);
  if (!doctor.weeklyAvailability.length) throw new Error(`${email} has no active weekly availability`);

  const patients = await prisma.user.findMany({
    where: { role: UserRole.CUSTOMER, status: 'ACTIVE' },
    select: { id: true, fullName: true },
  });
  if (!patients.length) throw new Error('No active customers to book with — run a seed first');

  const existing = await prisma.appointment.findMany({
    where: { doctorId: doctor.id, scheduledDate: { gte: parseAppointmentDateOnly(toDateOnlyIsoBd()) } },
    select: { scheduledDate: true, timeSlot: true },
  });
  const taken = new Set(existing.map((a) => `${toDateOnlyIsoBd(a.scheduledDate)}|${a.timeSlot}`));
  const blockedDates = new Set(
    doctor.dateOverrides.filter((o) => !o.isAvailable).map((o) => o.date.toISOString().slice(0, 10)),
  );

  const now = Date.now();
  const created: string[] = [];
  for (let d = 0; d < days; d++) {
    const dateIso = toDateOnlyIsoBd(new Date(now + d * DAY));
    if (blockedDates.has(dateIso)) continue;
    const scheduledDate = parseAppointmentDateOnly(dateIso);
    const weekday = dayOfWeekBd(scheduledDate);

    const freeSlots = doctor.weeklyAvailability
      .filter((w) => w.dayOfWeek === weekday)
      .flatMap((w) => generateTimeSlots(w.startTime, w.endTime, w.slotMinutes).map((slot) => ({ slot, len: w.slotMinutes })))
      .filter(({ slot }) => !taken.has(`${dateIso}|${slot}`))
      .filter(({ slot }) => appointmentStartsAtBd(scheduledDate, slot).getTime() > now);

    // Spread picks across the day instead of taking the first N slots
    const step = Math.max(1, Math.floor(freeSlots.length / perDay));
    const chosen = freeSlots.filter((_, i) => i % step === 0).slice(0, perDay);

    for (const { slot, len } of chosen) {
      const patient = pick(patients);
      const type = pick([ConsultationType.VIDEO, ConsultationType.VIDEO, ConsultationType.AUDIO, ConsultationType.CHAT]);
      const appt = await prisma.appointment.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.id,
          scheduledDate,
          timeSlot: slot,
          durationMin: len,
          fee: doctor.fee,
          consultationType: type,
          status: pick(['confirmed', 'confirmed', 'scheduled']),
          paymentMethod: pick([PaymentMethod.BKASH, PaymentMethod.NAGAD, PaymentMethod.CARD]),
          agoraChannel:
            type === ConsultationType.CHAT ? null : `cholbe_${doctor.id.slice(0, 8)}_${dateIso.replace(/-/g, '')}_${slot.replace(/\W/g, '')}`,
        },
      });
      if (type === ConsultationType.CHAT) {
        await prisma.consultationMessage.create({
          data: { appointmentId: appt.id, senderId: patient.id, content: pick(CHAT_OPENERS) },
        });
      }
      await prisma.notification.create({
        data: {
          userId: doctor.userId,
          category: 'appointment',
          title: 'New Appointment',
          body: `${patient.fullName} booked a ${type.toLowerCase()} consultation on ${dateIso} at ${slot}.`,
        },
      });
      taken.add(`${dateIso}|${slot}`);
      created.push(`${dateIso}  ${slot.padStart(8)}  ${type.padEnd(5)}  ${patient.fullName}`);
    }
  }

  console.log(`Added ${created.length} appointments for ${doctor.user.fullName} (${email}):`);
  created.forEach((line) => console.log(`  ${line}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
