import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.module';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../push/push.service';
import { toDateOnlyIsoBd } from '../common/utils/bd-time.util';
import {
  CancelCholbePrescriptionDto,
  CreateCholbePrescriptionDto,
  ListCholbePrescriptionsQuery,
} from './dto/cholbe-prescription.dto';
import { PrescriptionFilesService } from './prescription-files.service';
import { planReminder } from './prescription-reminders.util';

const INACTIVE_APPOINTMENT_STATUSES = ['cancelled', 'no_show'];

const withItems = {
  items: { orderBy: { position: 'asc' } },
  patient: { select: { id: true, fullName: true, avatarUrl: true } },
  doctor: { select: { signaturePath: true } },
} satisfies Prisma.CholbePrescriptionInclude;

type PrescriptionWithItems = Prisma.CholbePrescriptionGetPayload<{ include: typeof withItems }>;

const trimOrNull = (value?: string | null) => {
  const t = value?.trim();
  return t ? t : null;
};
const cleanList = (values?: string[]) => (values ?? []).map((v) => v.trim()).filter(Boolean);

@Injectable()
export class CholbePrescriptionsService {
  constructor(
    private prisma: PrismaService,
    private files: PrescriptionFilesService,
    private notifications: NotificationsService,
    private push: PushService,
  ) {}

  // ─── Shared ──────────────────────────────────────────────────────────────

  /** Never expose private file paths; tell the client whether a PDF exists instead. */
  private present(rx: PrescriptionWithItems) {
    const { pdfPath, serial, signaturePath, doctor, ...rest } = rx;
    return { ...rest, hasPdf: !!pdfPath };
  }

  /**
   * The signature the prescription was issued with, as a data: URI. Prescriptions
   * issued before signatures were frozen per prescription fall back to the
   * doctor's current signature.
   */
  private signatureDataUri(rx: PrescriptionWithItems): string | null {
    const path = rx.signaturePath ?? rx.doctor.signaturePath;
    if (!path) return null;
    try {
      return this.files.imageDataUri(path);
    } catch {
      return null;
    }
  }

  /** Full detail for one prescription, including its signature. */
  private presentDetail(rx: PrescriptionWithItems) {
    return { ...this.present(rx), signatureDataUri: this.signatureDataUri(rx) };
  }

  private async doctorFor(userId: string) {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      include: { user: { select: { fullName: true, phone: true } } },
    });
    if (!doctor) throw new NotFoundException('Doctor profile not found');
    return doctor;
  }

  /** The user's own id plus every family account they manage. */
  private async viewablePatientIds(userId: string): Promise<string[]> {
    const managed = await this.prisma.patientProfile.findMany({
      where: { managedByUserId: userId },
      select: { userId: true },
    });
    return [userId, ...managed.map((m) => m.userId)];
  }

  /** Unique, human-readable id backed by the table's sequence, e.g. RX-260924-000123. */
  private async nextRxNumber(): Promise<{ serial: number; rxNumber: string }> {
    const [{ n }] = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT nextval(pg_get_serial_sequence('"CholbePrescription"', 'serial'))::int AS n`;
    const datePart = toDateOnlyIsoBd().slice(2).replace(/-/g, '');
    return { serial: n, rxNumber: `RX-${datePart}-${String(n).padStart(6, '0')}` };
  }

  private async notifyPatient(rx: { id: string; patientId: string; rxNumber: string }, title: string, body: string) {
    const guardian = await this.prisma.patientProfile.findUnique({
      where: { userId: rx.patientId },
      select: { managedByUserId: true },
    });
    const recipients = [rx.patientId, guardian?.managedByUserId].filter((id): id is string => !!id);
    await Promise.all(recipients.map((id) => this.notifications.create(id, 'prescription', title, body)));
    await this.push
      .sendToUsers(recipients, { title, body, data: { type: 'prescription', prescriptionId: rx.id } })
      .catch(() => undefined);
  }

  // ─── Doctor ──────────────────────────────────────────────────────────────

  async issue(userId: string, dto: CreateCholbePrescriptionDto) {
    const doctor = await this.doctorFor(userId);
    if (!doctor.signaturePath) {
      throw new BadRequestException('Add your signature before issuing prescriptions');
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: { id: dto.appointmentId, doctorId: doctor.id },
      include: { patient: { select: { id: true, fullName: true } } },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (INACTIVE_APPOINTMENT_STATUSES.includes(appointment.status.toLowerCase())) {
      throw new BadRequestException(`Cannot prescribe for a ${appointment.status.replace('_', '-')} appointment`);
    }

    const medicineIds = dto.items.map((i) => i.medicineId).filter((id): id is string => !!id);
    const knownMedicines = new Set(
      medicineIds.length
        ? (await this.prisma.medicine.findMany({ where: { id: { in: medicineIds } }, select: { id: true } })).map(
            (m) => m.id,
          )
        : [],
    );

    const { serial, rxNumber } = await this.nextRxNumber();
    const id = randomUUID();
    let signaturePath: string;
    try {
      signaturePath = this.files.copySignatureForPrescription(doctor.signaturePath, id);
    } catch {
      // The record points at a file that no longer exists (e.g. storage was wiped).
      throw new BadRequestException('Add your signature before issuing prescriptions');
    }
    const rx = await this.prisma.cholbePrescription.create({
      data: {
        id,
        serial,
        signaturePath,
        rxNumber,
        appointmentId: appointment.id,
        doctorId: doctor.id,
        patientId: appointment.patientId,
        patientName: appointment.patient.fullName,
        patientAge: trimOrNull(dto.patient?.age),
        patientSex: trimOrNull(dto.patient?.sex),
        patientWeight: trimOrNull(dto.patient?.weight),
        patientBloodGroup: trimOrNull(dto.patient?.bloodGroup),
        allergies: trimOrNull(dto.patient?.allergies),
        doctorName: doctor.user.fullName,
        doctorDegree: doctor.degree,
        doctorSpecialty: doctor.specialty,
        registrationNumber: doctor.registrationNumber,
        chamberAddress: doctor.chamberAddress,
        doctorPhone: doctor.user.phone,
        chiefComplaints: cleanList(dto.chiefComplaints),
        temperature: trimOrNull(dto.vitals?.temperature),
        bloodPressure: trimOrNull(dto.vitals?.bloodPressure),
        pulse: trimOrNull(dto.vitals?.pulse),
        spo2: trimOrNull(dto.vitals?.spo2),
        diagnosis: trimOrNull(dto.diagnosis),
        investigations: cleanList(dto.investigations),
        advice: cleanList(dto.advice),
        followUpDate: dto.followUpDate ? new Date(`${dto.followUpDate}T00:00:00.000Z`) : null,
        items: {
          create: dto.items.map((item, position) => ({
            position,
            medicineId: item.medicineId && knownMedicines.has(item.medicineId) ? item.medicineId : null,
            name: item.name.trim(),
            genericName: trimOrNull(item.genericName),
            dose: trimOrNull(item.dose),
            frequency: trimOrNull(item.frequency),
            duration: trimOrNull(item.duration),
            instruction: trimOrNull(item.instruction),
          })),
        },
      },
      include: withItems,
    });

    await this.notifyPatient(
      rx,
      'New prescription',
      `${doctor.user.fullName} issued prescription ${rx.rxNumber} for ${rx.patientName}.`,
    );
    return this.presentDetail(rx);
  }

  async listForDoctor(userId: string, query: ListCholbePrescriptionsQuery) {
    const doctor = await this.doctorFor(userId);
    const q = query.q?.trim();
    const rows = await this.prisma.cholbePrescription.findMany({
      where: {
        doctorId: doctor.id,
        patientId: query.patientId,
        appointmentId: query.appointmentId,
        status: query.status,
        ...(q && {
          OR: [
            { rxNumber: { contains: q, mode: 'insensitive' } },
            { patientName: { contains: q, mode: 'insensitive' } },
            { diagnosis: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
      include: withItems,
      orderBy: { issuedAt: 'desc' },
      take: 200,
    });
    return rows.map((rx) => this.present(rx));
  }

  private async ownForDoctor(userId: string, id: string) {
    const doctor = await this.doctorFor(userId);
    const rx = await this.prisma.cholbePrescription.findFirst({
      where: { id, doctorId: doctor.id },
      include: withItems,
    });
    if (!rx) throw new NotFoundException('Prescription not found');
    return rx;
  }

  async getForDoctor(userId: string, id: string) {
    return this.presentDetail(await this.ownForDoctor(userId, id));
  }

  async doctorPdfPath(userId: string, id: string) {
    const rx = await this.ownForDoctor(userId, id);
    if (!rx.pdfPath) throw new NotFoundException('PDF has not been uploaded yet');
    return { path: this.files.absolute(rx.pdfPath), rxNumber: rx.rxNumber };
  }

  /** The issued PDF is attached once and can never be replaced. */
  async attachPdf(userId: string, id: string, file?: Express.Multer.File) {
    const rx = await this.ownForDoctor(userId, id);
    if (rx.status !== 'ISSUED') throw new BadRequestException('This prescription was cancelled');
    if (rx.pdfPath) throw new ConflictException('The PDF for this prescription is already attached');
    if (!file?.buffer) throw new BadRequestException('A "file" field with the PDF is required');

    const saved = this.files.savePdf(rx.id, file.buffer);
    const updated = await this.prisma.cholbePrescription.update({
      where: { id: rx.id },
      data: { pdfPath: saved.path, pdfSize: saved.size },
      include: withItems,
    });
    return this.presentDetail(updated);
  }

  async cancel(userId: string, id: string, dto: CancelCholbePrescriptionDto) {
    const rx = await this.ownForDoctor(userId, id);
    if (rx.status === 'CANCELLED') throw new BadRequestException('Already cancelled');
    const updated = await this.prisma.cholbePrescription.update({
      where: { id: rx.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: trimOrNull(dto.reason) },
      include: withItems,
    });
    await this.notifyPatient(
      updated,
      'Prescription cancelled',
      `Prescription ${updated.rxNumber} from ${updated.doctorName} was cancelled${
        updated.cancelReason ? `: ${updated.cancelReason}` : '.'
      }`,
    );
    return this.present(updated);
  }

  async getSignature(userId: string) {
    const doctor = await this.doctorFor(userId);
    return {
      dataUri: doctor.signaturePath ? this.files.imageDataUri(doctor.signaturePath) : null,
      updatedAt: doctor.signatureUpdatedAt,
    };
  }

  async setSignature(userId: string, file?: Express.Multer.File) {
    const doctor = await this.doctorFor(userId);
    if (!file?.buffer) throw new BadRequestException('A "file" field with the signature image is required');
    const path = this.files.saveSignature(doctor.id, file.buffer);
    await this.prisma.doctorProfile.update({
      where: { id: doctor.id },
      data: { signaturePath: path, signatureUpdatedAt: new Date() },
    });
    return this.getSignature(userId);
  }

  // ─── Patient (and guardians of managed family accounts) ──────────────────

  async listForPatient(userId: string) {
    const patientIds = await this.viewablePatientIds(userId);
    const rows = await this.prisma.cholbePrescription.findMany({
      where: { patientId: { in: patientIds } },
      include: withItems,
      orderBy: { issuedAt: 'desc' },
    });
    return rows.map((rx) => this.present(rx));
  }

  private async ownForPatient(userId: string, id: string) {
    const patientIds = await this.viewablePatientIds(userId);
    const rx = await this.prisma.cholbePrescription.findFirst({
      where: { id, patientId: { in: patientIds } },
      include: withItems,
    });
    if (!rx) throw new NotFoundException('Prescription not found');
    return rx;
  }

  async getForPatient(userId: string, id: string) {
    const rx = await this.ownForPatient(userId, id);
    const reminders = await this.prisma.medicationSchedule.findMany({
      where: { cholbePrescriptionItemId: { in: rx.items.map((i) => i.id) }, isActive: true },
      select: { cholbePrescriptionItemId: true },
    });
    return {
      ...this.presentDetail(rx),
      reminderItemIds: reminders.map((r) => r.cholbePrescriptionItemId),
    };
  }

  async patientPdfPath(userId: string, id: string) {
    const rx = await this.ownForPatient(userId, id);
    if (!rx.pdfPath) throw new NotFoundException('The PDF is not available yet');
    return { path: this.files.absolute(rx.pdfPath), rxNumber: rx.rxNumber };
  }

  /**
   * One tap: a medication reminder for every Rx line that doesn't have one yet.
   * Reminders belong to the prescription's patient (a guardian can set them up for a child).
   * Safe to repeat — lines that already have a reminder are skipped.
   */
  async createReminders(userId: string, id: string) {
    const rx = await this.ownForPatient(userId, id);
    if (rx.status !== 'ISSUED') throw new BadRequestException('This prescription was cancelled');

    const existing = new Set(
      (
        await this.prisma.medicationSchedule.findMany({
          where: { cholbePrescriptionItemId: { in: rx.items.map((i) => i.id) }, isActive: true },
          select: { cholbePrescriptionItemId: true },
        })
      ).map((s) => s.cholbePrescriptionItemId),
    );

    const start = new Date(`${toDateOnlyIsoBd()}T00:00:00.000Z`);
    const created: { itemId: string; scheduleId: string; name: string }[] = [];
    const skipped: { itemId: string; name: string; reason: string }[] = [];

    for (const item of rx.items) {
      if (existing.has(item.id)) {
        skipped.push({ itemId: item.id, name: item.name, reason: 'Reminder already added' });
        continue;
      }
      const plan = planReminder(item, start);
      if (!plan.ok) {
        skipped.push({ itemId: item.id, name: item.name, reason: plan.reason });
        continue;
      }
      const schedule = await this.prisma.medicationSchedule.create({
        data: {
          patientId: rx.patientId,
          cholbePrescriptionItemId: item.id,
          medicineName: item.name,
          dose: item.dose,
          instruction: item.instruction,
          mealTiming: plan.mealTiming,
          times: plan.times,
          frequency: plan.frequency,
          startDate: start,
          endDate: plan.endDate,
          reminderEnabled: true,
          reminderBeforeMinutes: 10,
        },
      });
      created.push({ itemId: item.id, scheduleId: schedule.id, name: item.name });
    }

    return { created, skipped };
  }
}
