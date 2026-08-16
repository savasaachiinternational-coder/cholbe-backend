/**
 * Refreshes a live video appointment for calling tests.
 * Run before each test session so the slot is always "now" (Bangladesh time).
 *
 *   npm run db:live-call
 */
import {
  DoctorProfileStatus,
  PrismaClient,
  UserRole,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  liveCallTimeSlotBd,
  todayAppointmentDateBd,
} from '../src/common/utils/bd-time.util';

const prisma = new PrismaClient();

const PATIENT_EMAIL = 'pino@gmail.com';
const DOCTOR_EMAIL = 'doctor@cholbe.com';
const PASSWORD = 'Password123!';
const LIVE_AGORA_CHANNEL = 'cholbe_live_call_test';

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const patient = await prisma.user.upsert({
    where: { email: PATIENT_EMAIL },
    update: { fullName: 'Pino Test', status: UserStatus.ACTIVE },
    create: {
      email: PATIENT_EMAIL,
      fullName: 'Pino Test',
      passwordHash,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      patientProfile: { create: { age: 30, gender: 'Male' } },
      cart: { create: {} },
    },
  });

  await prisma.cart.upsert({
    where: { userId: patient.id },
    update: {},
    create: { userId: patient.id },
  });

  const doctorUser = await prisma.user.upsert({
    where: { email: DOCTOR_EMAIL },
    update: {
      fullName: 'Dr. Sarah Ahmed',
      status: UserStatus.ACTIVE,
      role: UserRole.DOCTOR,
    },
    create: {
      email: DOCTOR_EMAIL,
      fullName: 'Dr. Sarah Ahmed',
      passwordHash,
      role: UserRole.DOCTOR,
      status: UserStatus.ACTIVE,
    },
    include: { doctorProfile: true },
  });

  let doctor = doctorUser.doctorProfile;
  if (!doctor) {
    const specialty = await prisma.specialty.findFirst({
      where: { slug: 'general-physician' },
    });
    doctor = await prisma.doctorProfile.create({
      data: {
        userId: doctorUser.id,
        specialty: 'General Physician',
        specialtyId: specialty?.id,
        degree: 'MBBS, FCPS',
        fee: 500,
        categories: ['General', 'Physician'],
        isOnline: true,
        status: DoctorProfileStatus.ACTIVE,
      },
    });
  } else {
    doctor = await prisma.doctorProfile.update({
      where: { id: doctor.id },
      data: {
        isOnline: true,
        status: DoctorProfileStatus.ACTIVE,
      },
    });
  }

  const timeSlot = liveCallTimeSlotBd(2);

  await prisma.appointment.deleteMany({
    where: { agoraChannel: LIVE_AGORA_CHANNEL },
  });

  const appointment = await prisma.appointment.create({
    data: {
      patientId: patient.id,
      doctorId: doctor.id,
      scheduledDate: todayAppointmentDateBd(),
      timeSlot,
      durationMin: 30,
      fee: doctor.fee,
      status: 'in_progress',
      consultationType: 'VIDEO',
      agoraChannel: LIVE_AGORA_CHANNEL,
      paymentMethod: 'BKASH',
    },
  });

  console.log('\nLive call test data ready (Bangladesh time):\n');
  console.log(`  Patient:  ${PATIENT_EMAIL} / ${PASSWORD}`);
  console.log(`  Doctor:   ${DOCTOR_EMAIL} / ${PASSWORD}`);
  console.log(`  Appointment id: ${appointment.id}`);
  console.log(`  Time slot: ${timeSlot} (BD — started ~2 min ago, join now)`);
  console.log(`  Agora channel: ${LIVE_AGORA_CHANNEL}`);
  console.log(`  Doctor status: ACTIVE, online: true\n`);
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
