/**
 * Local test seed — wipes every table and fills it with a realistic, related dataset.
 *
 *   npm run db:seed:local
 *
 * All accounts use the password `Password123!`.
 * Refuses to run against a non-local DATABASE_URL unless SEED_ALLOW_REMOTE=1.
 */
import {
  PrismaClient,
  Prisma,
  UserRole,
  UserStatus,
  VendorApprovalStatus,
  MedicineSource,
  MedicineStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductVariant,
  ReportType,
  OtpChannel,
  DoctorProfileStatus,
  ConsultationType,
  VendorDocumentStatus,
  VendorPayoutType,
  DoctorWithdrawalStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  formatTimeSlotBd,
  liveCallTimeSlotBd,
  parseAppointmentDateOnly,
  toDateOnlyIsoBd,
  todayAppointmentDateBd,
} from '../src/common/utils/bd-time.util';

const prisma = new PrismaClient();

// ─── Deterministic helpers ───────────────────────────────────────────────────

let rngState = 20260923;
function rand(): number {
  // mulberry32 — same data on every run
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;
function sample<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
}

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (d: number, hour = int(8, 21)) => {
  const date = new Date(Date.now() - d * DAY);
  date.setHours(hour, int(0, 59), 0, 0);
  return date;
};
const daysFromNow = (d: number) => new Date(Date.now() + d * DAY);
const apptDate = (offsetDays: number) =>
  parseAppointmentDateOnly(toDateOnlyIsoBd(new Date(Date.now() + offsetDays * DAY)));
const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Reference data ──────────────────────────────────────────────────────────

const FIRST_NAMES_M = ['Rahim', 'Karim', 'Tanvir', 'Arif', 'Sabbir', 'Imran', 'Fahim', 'Nayeem', 'Rakib', 'Shakil', 'Mahmud', 'Jubayer'];
const FIRST_NAMES_F = ['Nusrat', 'Farzana', 'Tasnim', 'Sumaiya', 'Ayesha', 'Mim', 'Sadia', 'Jannat', 'Riya', 'Shirin', 'Lamia', 'Anika'];
const LAST_NAMES = ['Hossain', 'Rahman', 'Islam', 'Ahmed', 'Chowdhury', 'Khan', 'Uddin', 'Akter', 'Sarker', 'Talukder', 'Mia', 'Begum'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const CONDITIONS = ['Hypertension', 'Diabetes', 'Asthma', 'Arthritis', 'Thyroid', 'Migraine', 'Gastritis', 'High Cholesterol'];
const USAGE_PURPOSES = ['self', 'family', 'caregiver'];

const AREAS = [
  { region: 'Uttara Sector 12', road: 'Road 5, Uttara', lat: 23.8759, lng: 90.3795 },
  { region: 'Gulshan 2', road: 'Road 71, Gulshan', lat: 23.7925, lng: 90.4078 },
  { region: 'Dhanmondi', road: 'Road 27, Dhanmondi', lat: 23.7461, lng: 90.3742 },
  { region: 'Mirpur 10', road: 'Section 10, Mirpur', lat: 23.8069, lng: 90.3687 },
  { region: 'Banani', road: 'Road 11, Banani', lat: 23.7937, lng: 90.4043 },
  { region: 'Mohammadpur', road: 'Tajmahal Road, Mohammadpur', lat: 23.7662, lng: 90.3589 },
  { region: 'Bashundhara R/A', road: 'Block C, Bashundhara', lat: 23.8193, lng: 90.4526 },
  { region: 'Motijheel', road: 'DIT Avenue, Motijheel', lat: 23.733, lng: 90.4172 },
];

const SPECIALTIES = [
  { name: 'Physician', slug: 'physician', icon: 'stethoscope' },
  { name: 'Pediatric', slug: 'pediatric', icon: 'baby' },
  { name: 'Gynae & obs', slug: 'gynae-obs', icon: 'female' },
  { name: 'Dermatology', slug: 'dermatology', icon: 'skin' },
  { name: 'Endocrinology', slug: 'endocrinology', icon: 'activity' },
  { name: 'Cardiology', slug: 'cardiology', icon: 'heart' },
  { name: 'General Physician', slug: 'general-physician', icon: 'user-md' },
  { name: 'Neurology', slug: 'neurology', icon: 'brain' },
  { name: 'Orthopedics', slug: 'orthopedics', icon: 'bone' },
  { name: 'Psychiatry', slug: 'psychiatry', icon: 'smile', isActive: false },
];

const DOCTORS = [
  { email: 'doctor@cholbe.com', name: 'Dr. Sarah Ahmed', slug: 'general-physician', degree: 'MBBS, FCPS', fee: 500, online: true },
  { email: 'dr.kamal@cholbe.com', name: 'Dr. Kamal Hossain', slug: 'cardiology', degree: 'MBBS, MD (Cardiology)', fee: 1000, online: true },
  { email: 'dr.nabila@cholbe.com', name: 'Dr. Nabila Rahman', slug: 'gynae-obs', degree: 'MBBS, FCPS (Gynae)', fee: 800, online: false },
  { email: 'dr.tareq@cholbe.com', name: 'Dr. Tareq Islam', slug: 'pediatric', degree: 'MBBS, DCH', fee: 700, online: true },
  { email: 'dr.fariha@cholbe.com', name: 'Dr. Fariha Chowdhury', slug: 'dermatology', degree: 'MBBS, DDV', fee: 900, online: false },
  { email: 'dr.mahbub@cholbe.com', name: 'Dr. Mahbub Alam', slug: 'endocrinology', degree: 'MBBS, MD (Endocrinology)', fee: 1200, online: true },
  { email: 'dr.sultana@cholbe.com', name: 'Dr. Sultana Parvin', slug: 'neurology', degree: 'MBBS, FCPS (Neurology)', fee: 1100, online: false },
  { email: 'dr.rafiq@cholbe.com', name: 'Dr. Rafiqul Bari', slug: 'orthopedics', degree: 'MBBS, MS (Ortho)', fee: 900, online: false, pending: true },
];

const VENDORS = [
  { email: 'vendor@cholbe.com', pharmacy: 'Uttara Pharmacy', area: 0, approval: VendorApprovalStatus.APPROVED },
  { email: 'lazz@cholbe.com', pharmacy: 'Lazz Pharma Gulshan', area: 1, approval: VendorApprovalStatus.APPROVED },
  { email: 'tamanna@cholbe.com', pharmacy: 'Tamanna Pharmacy', area: 2, approval: VendorApprovalStatus.APPROVED },
  { email: 'wellcare@cholbe.com', pharmacy: 'Well Care Drug House', area: 3, approval: VendorApprovalStatus.APPROVED, closed: true },
  { email: 'newlife@cholbe.com', pharmacy: 'New Life Pharmacy', area: 4, approval: VendorApprovalStatus.PENDING },
  { email: 'medipoint@cholbe.com', pharmacy: 'Medi Point', area: 5, approval: VendorApprovalStatus.REJECTED },
];

type CatalogItem = {
  name: string; generic: string; category: string; brand: string; type: string;
  price: number; unit: string; rx?: boolean; temp?: string;
};
const CATALOG: CatalogItem[] = [
  { name: 'Napa Extend 500mg', generic: 'Paracetamol', category: 'Tablet', brand: 'Beximco', type: 'Tablet', price: 12, unit: 'Stripe' },
  { name: 'Ace Plus 500mg', generic: 'Paracetamol + Caffeine', category: 'Tablet', brand: 'Square', type: 'Tablet', price: 6, unit: 'PC' },
  { name: 'Sergel 20mg Capsule', generic: 'Esomeprazole', category: 'Capsule', brand: 'Healthcare', type: 'Capsule', price: 14, unit: 'Stripe' },
  { name: 'Seclo 20mg', generic: 'Omeprazole', category: 'Capsule', brand: 'Square', type: 'Capsule', price: 6, unit: 'Stripe' },
  { name: 'Cetirizine 10 mg', generic: 'Cetirizine Hydrochloride', category: 'Tablet', brand: 'Square', type: 'Tablet', price: 5, unit: 'Stripe' },
  { name: 'Fexo 120mg', generic: 'Fexofenadine', category: 'Tablet', brand: 'Square', type: 'Tablet', price: 9, unit: 'Stripe' },
  { name: 'Aamdocal Plus 50', generic: 'Amlodipine + Losartan', category: 'Tablet', brand: 'Square', type: 'Tablet', price: 250, unit: 'Box', rx: true },
  { name: 'Amlodipine 5mg', generic: 'Amlodipine', category: 'Tablet', brand: 'ACI', type: 'Tablet', price: 8, unit: 'Stripe', rx: true },
  { name: 'Losectil 20mg', generic: 'Omeprazole', category: 'Capsule', brand: 'Eskayef', type: 'Capsule', price: 5, unit: 'Stripe' },
  { name: 'Metformin 500mg', generic: 'Metformin HCl', category: 'Tablet', brand: 'Incepta', type: 'Tablet', price: 4, unit: 'Stripe', rx: true },
  { name: 'Comet 850mg', generic: 'Metformin HCl', category: 'Tablet', brand: 'Square', type: 'Tablet', price: 7, unit: 'Stripe', rx: true },
  { name: 'Thyrox 50mg Tablet', generic: 'Levothyroxine', category: 'Tablet', brand: 'GSK', type: 'Tablet', price: 10, unit: 'Stripe', rx: true },
  { name: 'Rosuva 10mg', generic: 'Rosuvastatin', category: 'Tablet', brand: 'Beximco', type: 'Tablet', price: 20, unit: 'Stripe', rx: true },
  { name: 'Azithrocin 500mg', generic: 'Azithromycin', category: 'Tablet', brand: 'Beximco', type: 'Tablet', price: 45, unit: 'Stripe', rx: true },
  { name: 'Monas 10mg', generic: 'Montelukast', category: 'Tablet', brand: 'ACME', type: 'Tablet', price: 16, unit: 'Stripe', rx: true },
  { name: 'Insulin Mixtard 30', generic: 'Human Insulin', category: 'Injection', brand: 'Novo Nordisk', type: 'Injection', price: 650, unit: 'Vial', rx: true, temp: '2-8°C' },
  { name: 'Ventolin Inhaler', generic: 'Salbutamol', category: 'Inhaler', brand: 'GSK', type: 'Inhaler', price: 320, unit: 'PC', rx: true },
  { name: 'Orsaline-N', generic: 'Oral Rehydration Salt', category: 'Powder', brand: 'SMC', type: 'Sachet', price: 6, unit: 'PC' },
  { name: 'Tofen Syrup', generic: 'Ketotifen', category: 'Syrup', brand: 'Beximco', type: 'Syrup', price: 85, unit: 'Bottle' },
  { name: 'Immunity Support', generic: 'Vitamin C + Zinc', category: "Women's Care", brand: 'HealthPlus', type: 'Tablet', price: 133, unit: 'Bottle' },
  { name: 'Calbo-D', generic: 'Calcium + Vitamin D3', category: 'Tablet', brand: 'Square', type: 'Tablet', price: 12, unit: 'Stripe' },
  { name: 'Johnson Baby Shampoo', generic: 'Gentle Baby Wash', category: 'Baby Products', brand: 'Johnson', type: 'Liquid', price: 350, unit: 'Bottle' },
  { name: 'Baby Diaper Rash Cream', generic: 'Zinc Oxide Cream', category: 'Baby Products', brand: 'Himalaya', type: 'Cream', price: 220, unit: 'Tube' },
  { name: 'Dove Body Wash', generic: 'Moisturizing Wash', category: 'Body Care', brand: 'Dove', type: 'Liquid', price: 420, unit: 'Bottle' },
  { name: 'Oral-B Mouthwash', generic: 'Antiseptic Rinse', category: 'Body Care', brand: 'Oral-B', type: 'Liquid', price: 290, unit: 'Bottle' },
  { name: 'Comfort Sanitary Pads', generic: 'Ultra Thin Pads', category: "Women's Care", brand: 'Comfort', type: 'Pad', price: 180, unit: 'Box' },
  { name: 'Savlon Antiseptic', generic: 'Chloroxylenol', category: 'First Aid', brand: 'ACI', type: 'Liquid', price: 110, unit: 'Bottle' },
  { name: 'Digital Thermometer', generic: 'Thermometer', category: 'Devices', brand: 'Omron', type: 'Device', price: 450, unit: 'PC' },
  { name: 'BP Monitor HEM-7120', generic: 'Blood Pressure Monitor', category: 'Devices', brand: 'Omron', type: 'Device', price: 3800, unit: 'PC' },
  { name: 'Hand Sanitizer 250ml', generic: 'Ethyl Alcohol 70%', category: 'First Aid', brand: 'Lifebuoy', type: 'Gel', price: 160, unit: 'Bottle' },
];

const HEALTH_REPORTS = [
  { title: 'Complete Blood Count (CBC)', type: ReportType.LAB, provider: 'Popular Diagnostic Centre', tip: 'Hemoglobin slightly low — include iron-rich foods.' },
  { title: 'Lipid Profile', type: ReportType.LAB, provider: 'Ibn Sina Diagnostic', tip: 'LDL is borderline high; reduce fried food.' },
  { title: 'HbA1c', type: ReportType.LAB, provider: 'Labaid Diagnostic', tip: 'Sugar control is fair; keep monitoring.' },
  { title: 'Chest X-Ray PA View', type: ReportType.IMAGING, provider: 'Square Hospital', tip: null },
  { title: 'Ultrasound Whole Abdomen', type: ReportType.IMAGING, provider: 'United Hospital', tip: 'No abnormality detected.' },
  { title: 'Thyroid Function Test', type: ReportType.LAB, provider: 'Praava Health', tip: 'TSH within normal range.' },
  { title: 'Discharge Summary', type: ReportType.OTHER, provider: 'Evercare Hospital', tip: null },
  { title: 'Cardiology Prescription', type: ReportType.PRESCRIPTION, provider: 'Dr. Kamal Hossain', tip: null },
];

const RX_MEDS = [
  { name: 'Amlodipine 5mg', dose: '1 tablet', instruction: 'Take with water', meal: 'after', freq: 'once_daily', times: ['08:00 AM'] },
  { name: 'Metformin 500mg', dose: '1 tablet', instruction: 'Take with meal', meal: 'after', freq: 'twice_daily', times: ['08:00 AM', '08:00 PM'] },
  { name: 'Sergel 20mg', dose: '1 capsule', instruction: 'Empty stomach', meal: 'before', freq: 'twice_daily', times: ['07:30 AM', '07:30 PM'] },
  { name: 'Rosuva 10mg', dose: '1 tablet', instruction: 'At bedtime', meal: 'after', freq: 'once_daily', times: ['10:00 PM'] },
  { name: 'Thyrox 50mg', dose: '1 tablet', instruction: 'Empty stomach, 30 min before breakfast', meal: 'before', freq: 'once_daily', times: ['07:00 AM'] },
  { name: 'Napa Extend 500mg', dose: '1 tablet', instruction: 'Only if fever', meal: 'after', freq: 'thrice_daily', times: ['08:00 AM', '02:00 PM', '08:00 PM'] },
  { name: 'Calbo-D', dose: '1 tablet', instruction: 'custom', meal: 'after', freq: 'once_daily', times: ['02:00 PM'] },
  { name: 'Monas 10mg', dose: '1 tablet', instruction: 'At night', meal: 'after', freq: 'once_daily', times: ['09:00 PM'] },
];

const CHAT_SCRIPT = [
  ['patient', 'Assalamu alaikum doctor, I have had a headache for two days.'],
  ['doctor', 'Walaikum assalam. Do you have fever, nausea or blurred vision?'],
  ['patient', 'No fever, but I feel tired in the afternoon.'],
  ['doctor', 'How many hours are you sleeping, and how much water do you drink?'],
  ['patient', 'Around 5 hours, and maybe 4 glasses of water.'],
  ['doctor', 'Please increase water intake and sleep. I am prescribing a mild painkiller; take it only if needed.'],
] as const;

const FEEDBACK_COMMENTS = [
  'Very patient and explained everything clearly.',
  'Good consultation, video quality was a bit laggy.',
  'Doctor was very helpful. Highly recommended.',
  'Quick and to the point.',
  null,
  'Prescription was clear and easy to follow.',
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? '';
  const host = url.match(/@([^:/?]+)/)?.[1] ?? '';
  const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres', 'db'].includes(host);
  if (!isLocal && process.env.SEED_ALLOW_REMOTE !== '1') {
    throw new Error(`Refusing to wipe non-local database host "${host}". Set SEED_ALLOW_REMOTE=1 to override.`);
  }
  console.log(`Seeding database on host "${host}" — all existing data will be wiped.`);
}

async function wipe() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  if (!tables.length) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

async function main() {
  await assertLocalDatabase();
  await wipe();

  const passwordHash = await bcrypt.hash('Password123!', 12);
  let phoneSeq = 1711000000;
  const nextPhone = () => `0${phoneSeq++}`;

  // ── Admins ────────────────────────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: { email: 'admin@cholbe.com', fullName: 'Super Administrator', passwordHash, role: UserRole.ADMIN },
  });
  await prisma.user.create({
    data: { email: 'ops@cholbe.com', fullName: 'Operations Manager', passwordHash, role: UserRole.ADMIN, phone: nextPhone() },
  });

  // ── Specialties ───────────────────────────────────────────────────────────
  const specialtyIds: Record<string, string> = {};
  for (const s of SPECIALTIES) {
    const row = await prisma.specialty.create({ data: { isActive: true, ...s } });
    specialtyIds[s.slug] = row.id;
  }

  // ── Customers / patients ──────────────────────────────────────────────────
  type Customer = { id: string; fullName: string; profileId: string; phone: string | null };
  const customers: Customer[] = [];

  async function createCustomer(opts: {
    email: string; fullName: string; phone?: string; gender: string; age: number;
    status?: UserStatus; managedByUserId?: string; conditions?: string[]; bloodGroup?: string;
  }): Promise<Customer> {
    const user = await prisma.user.create({
      data: {
        email: opts.email,
        phone: opts.phone ?? nextPhone(),
        fullName: opts.fullName,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: opts.status ?? UserStatus.ACTIVE,
        createdAt: daysAgo(int(10, 200)),
        patientProfile: {
          create: {
            age: opts.age,
            gender: opts.gender,
            bloodGroup: opts.bloodGroup ?? pick(BLOOD_GROUPS),
            usagePurpose: opts.managedByUserId ? 'family' : pick(USAGE_PURPOSES),
            conditions: opts.conditions ?? sample(CONDITIONS, int(0, 3)),
            mealBreakfast: pick(['07:30', '08:00', '08:30']),
            mealLunch: pick(['13:00', '13:30', '14:00']),
            mealDinner: pick(['20:00', '20:30', '21:00']),
            managedByUserId: opts.managedByUserId,
          },
        },
        cart: { create: {} },
      },
      include: { patientProfile: true },
    });
    const c = { id: user.id, fullName: user.fullName, profileId: user.patientProfile!.id, phone: user.phone };
    if (!opts.managedByUserId) customers.push(c);
    return c;
  }

  const rayhan = await createCustomer({
    email: 'rayhan@gmail.com', phone: '01677589448', fullName: 'Rahman Uddin', gender: 'Male', age: 32,
    bloodGroup: 'O-', conditions: ['Hypertension', 'Diabetes', 'Arthritis'],
  });
  const pino = await createCustomer({ email: 'pino@gmail.com', phone: '01677589452', fullName: 'Pino Test', gender: 'Male', age: 30 });

  for (let i = 0; i < 22; i++) {
    const female = i % 2 === 1;
    const first = female ? FIRST_NAMES_F[i % FIRST_NAMES_F.length] : FIRST_NAMES_M[i % FIRST_NAMES_M.length];
    const last = LAST_NAMES[(i * 5) % LAST_NAMES.length];
    await createCustomer({
      email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`,
      fullName: `${first} ${last}`,
      gender: female ? 'Female' : 'Male',
      age: int(19, 72),
      status: i === 20 ? UserStatus.BLOCKED : i === 21 ? UserStatus.PENDING : UserStatus.ACTIVE,
    });
  }

  // Family accounts managed by Rayhan (+ one managed by Pino)
  const mehidi = await createCustomer({
    email: 'mehidi.family@cholbe.com', phone: '01677589450', fullName: 'Mehidi Hasan', gender: 'Male', age: 12, managedByUserId: rayhan.id,
  });
  const rohima = await createCustomer({
    email: 'rohima.family@cholbe.com', phone: '01677589451', fullName: 'Rohima Akter', gender: 'Female', age: 8, managedByUserId: rayhan.id,
  });
  const pinoMother = await createCustomer({
    email: 'pino.mother@cholbe.com', fullName: 'Hasina Begum', gender: 'Female', age: 61, managedByUserId: pino.id,
    conditions: ['Hypertension', 'Diabetes'],
  });

  await prisma.familyMember.createMany({
    data: [
      { patientId: rayhan.profileId, memberUserId: mehidi.id, name: mehidi.fullName, relationship: 'Son', age: 12, gender: 'Male', phone: mehidi.phone, email: 'mehidi.family@cholbe.com' },
      { patientId: rayhan.profileId, memberUserId: rohima.id, name: rohima.fullName, relationship: 'Daughter', age: 8, gender: 'Female', phone: rohima.phone, email: 'rohima.family@cholbe.com' },
      { patientId: rayhan.profileId, name: 'Abdul Karim', relationship: 'Father', age: 67, gender: 'Male', phone: nextPhone() },
      { patientId: pino.profileId, memberUserId: pinoMother.id, name: pinoMother.fullName, relationship: 'Mother', age: 61, gender: 'Female', phone: pinoMother.phone, email: 'pino.mother@cholbe.com' },
      ...customers.slice(2, 8).map((c) => ({
        patientId: c.profileId, name: `${pick(FIRST_NAMES_F)} ${pick(LAST_NAMES)}`, relationship: pick(['Wife', 'Mother', 'Sister', 'Daughter']),
        age: int(5, 70), gender: 'Female', phone: nextPhone(),
      })),
    ],
  });

  await prisma.emergencyContact.createMany({
    data: customers.flatMap((c, i) =>
      Array.from({ length: i < 2 ? 2 : int(0, 2) }, (_, j) => ({
        patientId: c.profileId,
        name: `${j === 0 ? pick(FIRST_NAMES_M) : pick(FIRST_NAMES_F)} ${pick(LAST_NAMES)}`,
        relation: j === 0 ? pick(['Brother', 'Father', 'Husband']) : pick(['Sister', 'Mother', 'Wife']),
        phone: nextPhone(),
      })),
    ),
  });

  // Addresses — every active customer gets 1–3
  const addressesByUser: Record<string, Prisma.AddressGetPayload<object>[]> = {};
  for (const c of customers) {
    const count = c.id === rayhan.id ? 3 : int(1, 3);
    const areas = sample(AREAS, count);
    addressesByUser[c.id] = [];
    for (let j = 0; j < areas.length; j++) {
      const a = areas[j];
      addressesByUser[c.id].push(
        await prisma.address.create({
          data: {
            userId: c.id,
            label: ['Home', 'Office', 'Parents'][j],
            region: a.region,
            formattedAddress: `House ${int(1, 80)}, ${a.road}, Dhaka`,
            latitude: round2(a.lat + (rand() - 0.5) * 0.01),
            longitude: round2(a.lng + (rand() - 0.5) * 0.01),
            isDefault: j === 0,
          },
        }),
      );
    }
  }

  // ── Vendors ───────────────────────────────────────────────────────────────
  type Vendor = { id: string; userId: string; name: string; approved: boolean };
  const vendors: Vendor[] = [];
  for (const v of VENDORS) {
    const area = AREAS[v.area];
    const user = await prisma.user.create({
      data: {
        email: v.email,
        phone: v.email === 'vendor@cholbe.com' ? '01700000000' : nextPhone(),
        fullName: v.pharmacy,
        passwordHash,
        role: UserRole.VENDOR,
        status: v.approval === VendorApprovalStatus.APPROVED ? UserStatus.ACTIVE : UserStatus.PENDING,
        vendorProfile: {
          create: {
            pharmacyName: v.pharmacy,
            phone: nextPhone(),
            address: `${area.road}, Dhaka`,
            approvalStatus: v.approval,
            isStoreOpen: !v.closed,
          },
        },
      },
      include: { vendorProfile: true },
    });
    const vp = user.vendorProfile!;
    vendors.push({ id: vp.id, userId: user.id, name: v.pharmacy, approved: v.approval === VendorApprovalStatus.APPROVED });

    const docStatus = v.approval === VendorApprovalStatus.APPROVED ? VendorDocumentStatus.VERIFIED : VendorDocumentStatus.PENDING;
    await prisma.vendorDocument.createMany({
      data: [
        { vendorId: vp.id, fileName: 'Drug License_2024.pdf', fileUrl: '/uploads/vendor-docs/seed-drug-license.pdf', mimeType: 'application/pdf', status: docStatus },
        { vendorId: vp.id, fileName: 'Trade License.png', fileUrl: '/uploads/vendor-docs/seed-trade-license.png', mimeType: 'image/png', status: docStatus },
        { vendorId: vp.id, fileName: 'NID-Card.png', fileUrl: '/uploads/vendor-docs/seed-nid.png', mimeType: 'image/png', status: VendorDocumentStatus.PENDING },
      ],
    });
    await prisma.vendorPayoutMethod.createMany({
      data: [
        { vendorId: vp.id, label: pick(['Dutch Bangla Bank', 'BRAC Bank', 'City Bank']), methodType: VendorPayoutType.BANK, accountMasked: `xxx-xxx-${int(1000, 9999)}`, isPrimary: true },
        { vendorId: vp.id, label: 'bKash Merchant', methodType: VendorPayoutType.BKASH, accountMasked: `017xx-xxx${int(100, 999)}`, isPrimary: false },
        ...(chance(0.5) ? [{ vendorId: vp.id, label: 'Nagad Merchant', methodType: VendorPayoutType.NAGAD, accountMasked: `018xx-xxx${int(100, 999)}`, isPrimary: false }] : []),
      ],
    });
  }

  // ── Doctors ───────────────────────────────────────────────────────────────
  type Doctor = { id: string; userId: string; name: string; fee: number; active: boolean };
  const doctors: Doctor[] = [];
  for (const d of DOCTORS) {
    const specialty = SPECIALTIES.find((s) => s.slug === d.slug)!;
    const user = await prisma.user.create({
      data: {
        email: d.email,
        phone: nextPhone(),
        fullName: d.name,
        passwordHash,
        role: UserRole.DOCTOR,
        status: d.pending ? UserStatus.PENDING : UserStatus.ACTIVE,
        doctorProfile: {
          create: {
            specialty: specialty.name,
            specialtyId: specialtyIds[d.slug],
            degree: d.degree,
            fee: d.fee,
            categories: [specialty.name, 'General'],
            bio: `${d.name.replace('Dr. ', '')} is an experienced ${specialty.name.toLowerCase()} specialist offering in-person and online consultations.`,
            isOnline: d.online,
            status: d.pending ? DoctorProfileStatus.PENDING : DoctorProfileStatus.ACTIVE,
            registrationNumber: `BMDC-A-${int(20000, 99999)}`,
            chamberAddress: `${pick(AREAS).road}, Dhaka`,
            languages: chance(0.5) ? ['Bangla', 'English'] : ['Bangla', 'English', 'Hindi'],
          },
        },
      },
      include: { doctorProfile: true },
    });
    const dp = user.doctorProfile!;
    doctors.push({ id: dp.id, userId: user.id, name: d.name, fee: d.fee, active: !d.pending });

    // Weekly availability: Sun–Thu morning + evening split, some Saturdays
    const days = chance(0.5) ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 6];
    await prisma.doctorWeeklyAvailability.createMany({
      data: days.flatMap((dayOfWeek) => [
        { doctorId: dp.id, dayOfWeek, startTime: '09:00', endTime: '13:00', slotMinutes: 30, isActive: true },
        { doctorId: dp.id, dayOfWeek, startTime: '17:00', endTime: '21:00', slotMinutes: pick([15, 20, 30]), isActive: dayOfWeek !== 6 },
      ]),
    });
    await prisma.doctorDateOverride.createMany({
      data: [
        { doctorId: dp.id, date: apptDate(int(8, 12)), isAvailable: false },
        { doctorId: dp.id, date: apptDate(int(15, 20)), isAvailable: false },
        { doctorId: dp.id, date: apptDate(int(22, 28)), isAvailable: true },
      ],
    });

    const mbbsYear = int(2000, 2012);
    await prisma.doctorQualification.createMany({
      data: [
        { doctorId: dp.id, degree: 'MBBS', institution: pick(['Dhaka Medical College', 'Sir Salimullah Medical College', 'Chittagong Medical College']), fieldOfStudy: 'Medicine', yearFrom: mbbsYear - 5, yearTo: mbbsYear },
        { doctorId: dp.id, degree: d.degree.split(', ')[1] ?? 'FCPS', institution: pick(['Bangladesh College of Physicians and Surgeons', 'BSMMU']), fieldOfStudy: specialty.name, yearFrom: mbbsYear + 2, yearTo: mbbsYear + 6 },
      ],
    });
    await prisma.doctorExperience.createMany({
      data: [
        { doctorId: dp.id, title: 'Medical Officer', institution: pick(['Dhaka Medical College Hospital', 'Upazila Health Complex, Savar']), startDate: new Date(`${mbbsYear + 1}-01-01`), endDate: new Date(`${mbbsYear + 4}-12-31`) },
        { doctorId: dp.id, title: 'Consultant', institution: pick(['Square Hospital', 'United Hospital', 'Labaid Specialized Hospital', 'Evercare Hospital']), startDate: new Date(`${mbbsYear + 7}-03-01`), isPresent: true },
      ],
    });
    await prisma.doctorInstruction.createMany({
      data: [
        { doctorId: dp.id, name: pick(['Bangladesh Medical Association', 'Bangladesh Society of Medicine']), startDate: new Date(`${mbbsYear + 3}-06-01`), isPresent: true },
        { doctorId: dp.id, name: 'Assistant Professor, Medical College', startDate: new Date(`${mbbsYear + 8}-01-01`), endDate: new Date(`${mbbsYear + 11}-12-31`) },
      ],
    });

    const bkash = await prisma.doctorPayoutMethod.create({
      data: { doctorId: dp.id, label: 'Primary bKash', methodType: VendorPayoutType.BKASH, accountMasked: `01XX-XXX${int(100, 999)}`, isPrimary: true },
    });
    const bank = await prisma.doctorPayoutMethod.create({
      data: { doctorId: dp.id, label: 'City Bank Savings', methodType: VendorPayoutType.BANK, accountMasked: `xxx-xxx-${int(1000, 9999)}` },
    });
    if (!d.pending) {
      const statuses = [DoctorWithdrawalStatus.PAID, DoctorWithdrawalStatus.PAID, DoctorWithdrawalStatus.PROCESSING, DoctorWithdrawalStatus.PENDING, DoctorWithdrawalStatus.REJECTED];
      for (let k = 0; k < statuses.length; k++) {
        await prisma.doctorWithdrawal.create({
          data: {
            doctorId: dp.id,
            payoutMethodId: k % 2 === 0 ? bkash.id : bank.id,
            amount: int(1, 3) * 500, // kept small so the seeded balance stays positive
            status: statuses[k],
            note: statuses[k] === DoctorWithdrawalStatus.REJECTED ? 'Account details mismatch' : null,
            createdAt: daysAgo(60 - k * 12),
          },
        });
      }
    }
  }
  const activeDoctors = doctors.filter((d) => d.active);
  const mainDoctor = doctors[0];

  // ── Medicine catalog ──────────────────────────────────────────────────────
  const medicineIds: Record<string, string> = {};
  for (let i = 0; i < CATALOG.length; i++) {
    const m = CATALOG[i];
    const source = i % 7 === 3 ? MedicineSource.DOCTOR : i % 7 === 5 ? MedicineSource.VENDOR : MedicineSource.ADMIN;
    const createdByUserId =
      source === MedicineSource.DOCTOR ? pick(activeDoctors).userId : source === MedicineSource.VENDOR ? vendors[i % 3].userId : admin.id;
    const row = await prisma.medicine.create({
      data: {
        name: m.name,
        genericName: m.generic,
        category: m.category,
        brand: m.brand,
        medicineType: m.type,
        description: `${m.name} (${m.generic}) by ${m.brand}.`,
        prescriptionRequired: !!m.rx,
        source,
        status: i === 17 ? MedicineStatus.OUT_OF_STOCK : i === 28 ? MedicineStatus.INACTIVE : MedicineStatus.ACTIVE,
        createdByUserId,
      },
    });
    medicineIds[m.name] = row.id;
  }

  // ── Vendor inventory ──────────────────────────────────────────────────────
  type Product = { id: string; name: string; price: number; medicineId: string | null };
  const productsByVendor: Record<string, Product[]> = {};
  for (const v of vendors) {
    const items = v.userId === vendors[0].userId ? CATALOG : sample(CATALOG, v.approved ? int(15, 22) : int(5, 8));
    productsByVendor[v.id] = [];
    for (const m of items) {
      const price = round2(m.price * (0.95 + rand() * 0.15));
      const discount = chance(0.4) ? round2(price * 0.9) : null;
      const lowStock = chance(0.12);
      const p = await prisma.vendorProduct.create({
        data: {
          vendorId: v.id,
          ownerUserId: v.userId,
          medicineId: medicineIds[m.name],
          name: m.name,
          genericName: m.generic,
          category: m.category,
          brand: m.brand,
          unitPrice: price,
          discountPrice: discount,
          stockQuantity: lowStock ? int(0, 8) : int(40, 2500),
          minAlertLevel: 20,
          expiryDate: chance(0.1) ? daysFromNow(int(5, 25)) : daysFromNow(int(120, 720)),
          batchNumber: `B${int(10000, 99999)}`,
          unitType: m.unit,
          temperature: m.temp ?? 'Room temperature',
          prescriptionRequired: !!m.rx,
          reminderActive: chance(0.8),
          isActive: chance(0.93),
        },
      });
      productsByVendor[v.id].push({ id: p.id, name: p.name, price: Number(discount ?? price), medicineId: p.medicineId });
    }
  }
  const approvedVendors = vendors.filter((v) => v.approved);

  // ── Carts ─────────────────────────────────────────────────────────────────
  for (const c of customers.slice(0, 12)) {
    const vendor = c.id === rayhan.id ? approvedVendors[0] : pick(approvedVendors);
    const cart = await prisma.cart.update({ where: { userId: c.id }, data: { vendorId: vendor.id } });
    const items = sample(productsByVendor[vendor.id], int(1, 4));
    await prisma.cartItem.createMany({
      data: items.map((p) => ({
        cartId: cart.id,
        vendorProductId: p.id,
        medicineId: p.medicineId,
        name: p.name,
        variant: pick([ProductVariant.PC, ProductVariant.STRIPE, ProductVariant.BOX]),
        quantity: int(1, 3),
        unitPrice: p.price,
      })),
    });
  }

  // ── Orders ────────────────────────────────────────────────────────────────
  const FLOW: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.ON_THE_WAY, OrderStatus.DELIVERED];
  const STATUS_MIX: OrderStatus[] = [
    ...Array(14).fill(OrderStatus.DELIVERED),
    ...Array(3).fill(OrderStatus.PENDING),
    ...Array(3).fill(OrderStatus.CONFIRMED),
    ...Array(3).fill(OrderStatus.PREPARING),
    ...Array(3).fill(OrderStatus.ON_THE_WAY),
    ...Array(4).fill(OrderStatus.CANCELLED),
  ];
  const orderCustomers = customers.filter((c) => addressesByUser[c.id]?.length);
  let orderSeq = 10001;
  for (let i = 0; i < 80; i++) {
    const customer = i < 8 ? rayhan : pick(orderCustomers);
    const vendor = i < 8 ? approvedVendors[0] : pick(approvedVendors);
    const status = i < 6 ? FLOW[i % FLOW.length] : pick(STATUS_MIX);
    const createdAt = status === OrderStatus.DELIVERED || status === OrderStatus.CANCELLED ? daysAgo(int(2, 120)) : daysAgo(int(0, 2));
    const address = pick(addressesByUser[customer.id]);
    const method = pick([PaymentMethod.COD, PaymentMethod.COD, PaymentMethod.BKASH, PaymentMethod.NAGAD, PaymentMethod.CARD]);
    const lines = sample(productsByVendor[vendor.id], int(1, 5)).map((p) => {
      const quantity = int(1, 4);
      return { p, quantity, lineTotal: round2(p.price * quantity), variant: pick([ProductVariant.PC, ProductVariant.STRIPE, ProductVariant.BOX]) };
    });
    const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
    const deliveryCharge = subtotal > 1000 ? 0 : 60;
    const total = round2(subtotal + deliveryCharge);

    const paid = status === OrderStatus.DELIVERED || (method !== PaymentMethod.COD && status !== OrderStatus.PENDING && status !== OrderStatus.CANCELLED);
    const paymentStatus =
      status === OrderStatus.CANCELLED
        ? method === PaymentMethod.COD ? PaymentStatus.PENDING : PaymentStatus.REFUNDED
        : paid ? PaymentStatus.PAID : PaymentStatus.PENDING;

    const reached = status === OrderStatus.CANCELLED ? FLOW.slice(0, int(1, 2)) : FLOW.slice(0, FLOW.indexOf(status) + 1);
    if (status === OrderStatus.CANCELLED) reached.push(OrderStatus.CANCELLED);

    const orderNumber = `CHB-${orderSeq++}`;
    const order = await prisma.order.create({
      data: {
        orderNumber,
        customerId: customer.id,
        vendorId: vendor.id,
        addressId: address.id,
        addressSnapshot: { label: address.label, formattedAddress: address.formattedAddress, region: address.region, latitude: address.latitude, longitude: address.longitude },
        status,
        paymentMethod: method,
        paymentStatus,
        subtotal,
        deliveryCharge,
        total,
        prescriptionUrl: lines.some((l) => CATALOG.find((m) => m.name === l.p.name)?.rx) ? '/uploads/prescriptions/seed-prescription.jpg' : null,
        notes: chance(0.25) ? pick(['Please call before delivery', 'Leave at the gate', 'Deliver after 5 PM']) : null,
        createdAt,
        items: {
          create: lines.map((l) => ({
            vendorProductId: l.p.id,
            medicineId: l.p.medicineId,
            name: l.p.name,
            variant: l.variant,
            quantity: l.quantity,
            unitPrice: l.p.price,
            lineTotal: l.lineTotal,
          })),
        },
        statusEvents: {
          create: reached.map((s, k) => ({
            status: s,
            note: s === OrderStatus.CANCELLED ? pick(['Customer cancelled', 'Out of stock', 'Unable to reach customer']) : null,
            createdAt: new Date(createdAt.getTime() + k * int(20, 180) * 60 * 1000),
          })),
        },
      },
    });
    if (method !== PaymentMethod.COD || paymentStatus === PaymentStatus.PAID) {
      await prisma.paymentTransaction.create({
        data: {
          orderId: order.id,
          method,
          amount: total,
          status: paymentStatus === PaymentStatus.PENDING && chance(0.3) ? PaymentStatus.FAILED : paymentStatus,
          gatewayRef: `mock_${method.toLowerCase()}_${orderNumber}`,
          createdAt,
        },
      });
    }
  }

  // ── Appointments, chat & feedback ─────────────────────────────────────────
  const SLOTS = ['9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM', '5:00 PM', '5:30 PM', '6:00 PM', '7:00 PM', '8:00 PM'];
  const patientsForAppts = [...customers.filter((c) => c.id !== pino.id), mehidi, rohima, pinoMother];
  const usedSlots = new Set<string>();
  let channelSeq = 1;

  async function createAppointment(opts: {
    patientId: string; doctor: Doctor; date: Date; timeSlot: string; status: string;
    type?: ConsultationType; durationMin?: number; channel?: string;
  }) {
    const type = opts.type ?? pick([ConsultationType.VIDEO, ConsultationType.VIDEO, ConsultationType.AUDIO, ConsultationType.CHAT]);
    return prisma.appointment.create({
      data: {
        patientId: opts.patientId,
        doctorId: opts.doctor.id,
        scheduledDate: opts.date,
        timeSlot: opts.timeSlot,
        durationMin: opts.durationMin ?? pick([15, 20, 30]),
        fee: opts.doctor.fee,
        consultationType: type,
        status: opts.status,
        paymentMethod: pick([PaymentMethod.BKASH, PaymentMethod.NAGAD, PaymentMethod.CARD]),
        agoraChannel: opts.channel ?? (type === ConsultationType.CHAT ? null : `cholbe_seed_${String(channelSeq++).padStart(3, '0')}`),
      },
    });
  }

  async function addChat(appointmentId: string, patientId: string, doctorUserId: string, lines: number) {
    const start = Date.now() - int(1, 30) * 60 * 1000;
    await prisma.consultationMessage.createMany({
      data: CHAT_SCRIPT.slice(0, lines).map(([who, content], k) => ({
        appointmentId,
        senderId: who === 'patient' ? patientId : doctorUserId,
        content,
        createdAt: new Date(start + k * 60 * 1000),
      })),
    });
  }

  // Fixed scenarios for manual testing
  await createAppointment({ patientId: pino.id, doctor: mainDoctor, date: todayAppointmentDateBd(), timeSlot: liveCallTimeSlotBd(2), status: 'confirmed', type: ConsultationType.VIDEO, durationMin: 30, channel: 'cholbe_live_call_test' });
  await createAppointment({ patientId: rayhan.id, doctor: mainDoctor, date: todayAppointmentDateBd(), timeSlot: formatTimeSlotBd(new Date(Date.now() + 10 * 60 * 1000)), status: 'scheduled', type: ConsultationType.VIDEO, durationMin: 15 });
  const chatAppt = await createAppointment({ patientId: mehidi.id, doctor: mainDoctor, date: todayAppointmentDateBd(), timeSlot: formatTimeSlotBd(new Date(Date.now() + 2 * 60 * 60 * 1000)), status: 'confirmed', type: ConsultationType.CHAT, durationMin: 20 });
  await addChat(chatAppt.id, mehidi.id, mainDoctor.userId, 3);
  await createAppointment({ patientId: rohima.id, doctor: mainDoctor, date: apptDate(5), timeSlot: '11:00 AM', status: 'confirmed', type: ConsultationType.VIDEO });

  // Random history + upcoming spread across all active doctors
  let feedbackCount = 0;
  for (let i = 0; i < 90; i++) {
    const doctor = i < 20 ? mainDoctor : pick(activeDoctors);
    const patient = i < 10 ? rayhan : pick(patientsForAppts);
    const offset = i % 3 === 0 ? int(1, 14) : -int(1, 60);
    const date = apptDate(offset);
    let timeSlot = pick(SLOTS);
    for (let tries = 0; usedSlots.has(`${doctor.id}|${date.toISOString()}|${timeSlot}`) && tries < 20; tries++) timeSlot = pick(SLOTS);
    const key = `${doctor.id}|${date.toISOString()}|${timeSlot}`;
    if (usedSlots.has(key)) continue;
    usedSlots.add(key);

    const status = offset > 0 ? pick(['scheduled', 'confirmed', 'confirmed', 'cancelled']) : pick(['completed', 'completed', 'completed', 'completed', 'cancelled', 'no_show']);
    const appt = await createAppointment({ patientId: patient.id, doctor, date, timeSlot, status });

    if (status === 'completed') {
      if (appt.consultationType === ConsultationType.CHAT || chance(0.3)) {
        await addChat(appt.id, patient.id, doctor.userId, int(2, CHAT_SCRIPT.length));
      }
      if (chance(0.7)) {
        await prisma.consultationFeedback.create({
          data: { appointmentId: appt.id, doctorId: doctor.id, rating: pick([3, 4, 4, 5, 5, 5]), comment: pick(FEEDBACK_COMMENTS) },
        });
        feedbackCount++;
      }
    }
  }

  // ── Health records ────────────────────────────────────────────────────────
  const healthPatients = [...customers.slice(0, 15), mehidi, pinoMother];
  for (const c of healthPatients) {
    const reports = c.id === rayhan.id ? HEALTH_REPORTS : sample(HEALTH_REPORTS, int(1, 4));
    await prisma.healthReport.createMany({
      data: reports.map((r, k) => {
        const pdf = r.type !== ReportType.IMAGING;
        return {
          patientId: c.id,
          title: r.title,
          reportType: r.type,
          provider: r.provider,
          reportDate: daysAgo(int(3, 300)),
          fileUrl: `/uploads/reports/seed-report-${k + 1}.${pdf ? 'pdf' : 'jpg'}`,
          fileName: `${r.title.replace(/[^A-Za-z0-9]+/g, '_')}.${pdf ? 'pdf' : 'jpg'}`,
          mimeType: pdf ? 'application/pdf' : 'image/jpeg',
          tip: r.tip,
        };
      }),
    });

    // Vitals: 14 days of BP + oxygen, plus some sugar/weight/heart-rate readings
    const vitals: Prisma.HealthVitalCreateManyInput[] = [];
    const hypertensive = c.id === rayhan.id || chance(0.3);
    for (let d = 13; d >= 0; d--) {
      const sys = hypertensive ? int(128, 150) : int(110, 125);
      vitals.push({ patientId: c.id, vitalType: 'blood_pressure', value: `${sys}/${sys - int(40, 50)}`, recordedAt: daysAgo(d, 8) });
      vitals.push({ patientId: c.id, vitalType: 'oxygen', value: `${int(95, 99)}%`, recordedAt: daysAgo(d, 9) });
      if (d % 3 === 0) {
        vitals.push({ patientId: c.id, vitalType: 'blood_sugar', value: `${(5 + rand() * 4).toFixed(1)} mmol/L`, recordedAt: daysAgo(d, 7) });
        vitals.push({ patientId: c.id, vitalType: 'heart_rate', value: `${int(64, 92)} bpm`, recordedAt: daysAgo(d, 10) });
      }
      if (d % 7 === 0) vitals.push({ patientId: c.id, vitalType: 'weight', value: `${int(55, 85)} kg`, recordedAt: daysAgo(d, 7) });
    }
    await prisma.healthVital.createMany({ data: vitals });
  }

  // ── Prescriptions → schedules → logs ──────────────────────────────────────
  let scheduleCount = 0;
  let logCount = 0;
  const todayIso = toDateOnlyIsoBd();
  for (const c of [...customers.slice(0, 12), mehidi, pinoMother]) {
    const prescriptionCount = c.id === rayhan.id ? 3 : int(1, 2);
    for (let p = 0; p < prescriptionCount; p++) {
      const createdAt = daysAgo(int(5, 45));
      const meds = sample(RX_MEDS, int(2, 4));
      const prescription = await prisma.prescription.create({
        data: {
          patientId: c.id,
          fileUrl: `/uploads/prescriptions/seed-prescription-${p + 1}.jpg`,
          fileName: `prescription_${p + 1}.jpg`,
          source: pick(['camera', 'gallery', 'upload']),
          createdAt,
          medicines: {
            create: meds.map((m) => ({
              name: m.name,
              dose: m.dose,
              instruction: m.instruction,
              mealTiming: m.meal,
              frequency: m.freq,
              times: m.times,
              startDate: createdAt,
              endDate: new Date(createdAt.getTime() + int(30, 90) * DAY),
              reminderBeforeMinutes: pick([5, 10, 15]),
              followUpMinutes: pick([15, 30]),
              inventoryCount: int(10, 60),
            })),
          },
        },
      });

      // Turn the latest prescription's medicines into active schedules
      if (p !== 0) continue;
      for (const m of meds) {
        const inventory = int(4, 60);
        const schedule = await prisma.medicationSchedule.create({
          data: {
            patientId: c.id,
            prescriptionId: prescription.id,
            medicineName: m.name,
            dose: m.dose,
            instruction: m.instruction,
            mealTiming: m.meal,
            times: m.times,
            frequency: m.freq,
            startDate: createdAt,
            endDate: new Date(createdAt.getTime() + 60 * DAY),
            reminderEnabled: true,
            reminderBeforeMinutes: 10,
            followUpEnabled: chance(0.5),
            followUpMinutes: 30,
            followUpTime: '30 min',
            refillEnabled: inventory < 15,
            inventoryCount: inventory,
            refillDate: inventory < 15 ? daysFromNow(int(1, 5)) : null,
            refillTime: inventory < 15 ? '10:00 AM' : null,
            caregiverName: c.id === mehidi.id ? 'Rahman Uddin' : c.id === pinoMother.id ? 'Pino Test' : null,
            isActive: true,
          },
        });
        scheduleCount++;

        // 7 days of dose logs; today only covers slots that have already passed
        const logs: Prisma.MedicationLogCreateManyInput[] = [];
        for (let d = 7; d >= 0; d--) {
          for (const t of m.times) {
            const [hm, ampm] = t.split(' ');
            const [h, min] = hm.split(':').map(Number);
            const hour24 = (h % 12) + (ampm === 'PM' ? 12 : 0);
            const dayIso = toDateOnlyIsoBd(new Date(Date.now() - d * DAY));
            const at = new Date(`${dayIso}T${String(hour24).padStart(2, '0')}:${String(min).padStart(2, '0')}:00+06:00`);
            if (at.getTime() > Date.now()) continue;
            const status = dayIso === todayIso && chance(0.2) ? 'snoozed' : pick(['taken', 'taken', 'taken', 'taken', 'missed']);
            logs.push({
              scheduleId: schedule.id,
              status,
              scheduledTime: t,
              loggedAt: new Date(at.getTime() + int(0, 40) * 60 * 1000),
              snoozeUntil: status === 'snoozed' ? new Date(Date.now() + 10 * 60 * 1000) : null,
            });
          }
        }
        await prisma.medicationLog.createMany({ data: logs });
        logCount += logs.length;
      }
    }
  }
  // One stand-alone (manual) schedule that is paused
  await prisma.medicationSchedule.create({
    data: {
      patientId: rayhan.id, medicineName: 'Vitamin D 2000 IU', dose: '1 capsule', mealTiming: 'after', times: ['09:00 AM'],
      frequency: 'weekly', reminderEnabled: false, isActive: false, startDate: daysAgo(90), endDate: daysAgo(10),
    },
  });

  // ── Notifications ─────────────────────────────────────────────────────────
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  const TEMPLATES = [
    { category: 'medication', title: 'Medication Reminder', body: 'Time to take your {med} dose.' },
    { category: 'alert', title: 'Missed Dose Alert', body: "It looks like you missed your {med} dose this morning. Please don't forget!" },
    { category: 'order', title: 'Order Update', body: 'Your pharmacy order is being prepared.' },
    { category: 'order', title: 'Order Delivered', body: 'Your order has been delivered. Stay healthy!' },
    { category: 'appointment', title: 'Upcoming Consultation', body: 'Video call with your doctor in 10 minutes.' },
    { category: 'appointment', title: 'Appointment Confirmed', body: 'Your appointment has been confirmed.' },
    { category: 'refill', title: 'Refill Reminder', body: 'Only a few doses of {med} left. Time to reorder.' },
  ];
  for (const c of [...customers, mehidi, rohima, pinoMother]) {
    const n = c.id === rayhan.id ? 12 : int(2, 6);
    for (let k = 0; k < n; k++) {
      const t = pick(TEMPLATES);
      notifications.push({
        userId: c.id, category: t.category, title: t.title, body: t.body.replace('{med}', pick(RX_MEDS).name),
        isRead: k > 3 && chance(0.7), createdAt: daysAgo(k, int(7, 22)),
      });
    }
  }
  for (const v of vendors) {
    for (let k = 0; k < 5; k++) {
      const t = pick([
        { category: 'order', title: 'New Order', body: 'You have received a new order.' },
        { category: 'stock', title: 'Low Stock Alert', body: 'Some products are below the minimum alert level.' },
        { category: 'payout', title: 'Payout Processed', body: 'Your weekly payout has been processed.' },
      ]);
      notifications.push({ userId: v.userId, ...t, isRead: k > 1, createdAt: daysAgo(k) });
    }
  }
  for (const d of doctors) {
    for (let k = 0; k < 5; k++) {
      const t = pick([
        { category: 'appointment', title: 'New Appointment', body: 'A patient booked a consultation with you.' },
        { category: 'appointment', title: 'Appointment Cancelled', body: 'A patient cancelled their appointment.' },
        { category: 'payout', title: 'Withdrawal Update', body: 'Your withdrawal request status changed.' },
      ]);
      notifications.push({ userId: d.userId, ...t, isRead: k > 1, createdAt: daysAgo(k) });
    }
  }
  for (const k of [0, 1, 2]) {
    notifications.push({ userId: admin.id, category: 'vendor', title: 'Vendor Approval Pending', body: `${VENDORS[4].pharmacy} is waiting for approval.`, isRead: k > 0, createdAt: daysAgo(k) });
  }
  await prisma.notification.createMany({ data: notifications });

  // ── Device tokens (fake FCM tokens — pushes will fail harmlessly) ─────────
  const tokenUsers = [...customers.slice(0, 10), ...vendors.slice(0, 3), ...doctors.slice(0, 4)];
  await prisma.deviceToken.createMany({
    data: tokenUsers.map((u, k) => ({
      userId: 'profileId' in u ? u.id : u.userId,
      token: `seed-fcm-token-${String(k + 1).padStart(3, '0')}-${Math.floor(rand() * 1e12).toString(36)}`,
      platform: k % 3 === 0 ? 'ios' : 'android',
    })),
  });

  // ── OTP codes (history + one live code) ───────────────────────────────────
  await prisma.otpCode.createMany({
    data: [
      { userId: rayhan.id, contact: 'rayhan@gmail.com', channel: OtpChannel.EMAIL, code: '123456', expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      { userId: rayhan.id, contact: '01677589448', channel: OtpChannel.SMS, code: '654321', expiresAt: daysAgo(3), used: true, createdAt: daysAgo(3) },
      { contact: '01799999999', channel: OtpChannel.SMS, code: '111222', expiresAt: daysAgo(1), createdAt: daysAgo(1) },
      ...customers.slice(2, 10).map((c) => ({
        userId: c.id, contact: c.phone ?? '', channel: OtpChannel.SMS, code: String(int(100000, 999999)),
        expiresAt: daysAgo(int(1, 20)), used: chance(0.7),
      })),
    ],
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  const counts = await Promise.all([
    prisma.user.count(), prisma.vendorProduct.count(), prisma.order.count(), prisma.appointment.count(),
    prisma.healthReport.count(), prisma.notification.count(),
  ]);
  console.log('\nLocal seed complete. Password for every account: Password123!');
  console.log('  Admin:     admin@cholbe.com, ops@cholbe.com');
  console.log('  Customer:  rayhan@gmail.com (richest data set), pino@gmail.com (live video call now)');
  console.log('  Family:    mehidi.family@cholbe.com, rohima.family@cholbe.com, pino.mother@cholbe.com');
  console.log(`  Vendors:   ${VENDORS.map((v) => v.email).join(', ')}`);
  console.log(`  Doctors:   ${DOCTORS.map((d) => d.email).join(', ')}`);
  console.log('  Live OTP:  rayhan@gmail.com → 123456 (valid 10 min)');
  console.log(
    `  Rows: ${counts[0]} users, ${counts[1]} vendor products, ${counts[2]} orders, ${counts[3]} appointments, ` +
      `${feedbackCount} feedbacks, ${counts[4]} health reports, ${scheduleCount} schedules, ${logCount} dose logs, ${counts[5]} notifications`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
