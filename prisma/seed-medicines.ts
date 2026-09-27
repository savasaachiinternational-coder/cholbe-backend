/**
 * Demo medicine catalogue: 100+ common Bangladeshi brands with MRP, pack size,
 * image, leaflet sections and prescribing defaults.
 *
 *   npm run db:seed:medicines
 *
 * Safe to re-run: rows are matched by name and updated in place, nothing else
 * is touched. Prices are approximate retail prices for demonstration only.
 */
import { copyFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { MedicineSource, MedicineStatus, Prisma, PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

type Form = 'Tablet' | 'Capsule' | 'Syrup' | 'Suspension' | 'Injection' | 'Cream' | 'Ointment' | 'Gel' | 'Drops' | 'Inhaler' | 'Sachet';

// One generic image per form; files live in prisma/seed-assets/medicines and
// are copied to uploads/medicines (which is gitignored) on every run.
const IMAGE_BY_FORM: Record<Form, string> = {
  Tablet: 'tablet',
  Capsule: 'capsule',
  Syrup: 'syrup',
  Suspension: 'syrup',
  Injection: 'injection',
  Cream: 'cream',
  Ointment: 'cream',
  Gel: 'cream',
  Drops: 'drops',
  Inhaler: 'inhaler',
  Sachet: 'sachet',
};

const STORAGE_BY_FORM: Record<Form, string> = {
  Tablet: 'Store below 30°C in a dry place, away from light.',
  Capsule: 'Store below 30°C in a dry place, away from light.',
  Syrup: 'Store below 30°C. Do not freeze. Use within 1 month of opening.',
  Suspension: 'Store below 25°C. Once mixed, keep in the fridge and use within 7 days.',
  Injection: 'Store as directed on the pack. For use by a health professional.',
  Cream: 'Store below 30°C. Do not freeze. Close the tube tightly after use.',
  Ointment: 'Store below 30°C. Close the tube tightly after use.',
  Gel: 'Store below 30°C. Close the tube tightly after use.',
  Drops: 'Store below 25°C. Do not touch the tip. Discard 4 weeks after opening.',
  Inhaler: 'Store below 30°C. Do not puncture or burn the canister, even when empty.',
  Sachet: 'Store below 30°C in a dry place. Use the solution within 24 hours.',
};

type Generic = {
  generic: string;
  category: string;
  form: Form;
  rx: boolean;
  dose: string;
  frequency: string;
  duration: string;
  instruction: string;
  uses: string[];
  sideEffects: string[];
  warnings: string[];
};

const G: Record<string, Generic> = {
  paracetamolTab: {
    generic: 'Paracetamol', category: 'Pain & Fever', form: 'Tablet', rx: false,
    dose: '1 tablet', frequency: '1 + 1 + 1', duration: '3 days', instruction: 'After meals. Max 4 g (8 tablets of 500 mg) in 24 hours.',
    uses: ['Fever', 'Headache and toothache', 'Muscle and joint pain', 'Period pain'],
    sideEffects: ['Rarely skin rash', 'Liver damage in overdose'],
    warnings: ['Do not take with other paracetamol-containing medicines', 'Ask a doctor first if you have liver disease or drink alcohol regularly'],
  },
  paracetamolXr: {
    generic: 'Paracetamol (extended release)', category: 'Pain & Fever', form: 'Tablet', rx: false,
    dose: '2 tablets', frequency: '1 + 1 + 1', duration: '5 days', instruction: 'Swallow whole, do not crush. At least 6 hours apart.',
    uses: ['Long-lasting relief of pain', 'Osteoarthritis pain', 'Fever'],
    sideEffects: ['Rarely skin rash', 'Liver damage in overdose'],
    warnings: ['Do not take with other paracetamol-containing medicines', 'Not for children under 12'],
  },
  paracetamolCaffeine: {
    generic: 'Paracetamol + Caffeine', category: 'Pain & Fever', form: 'Tablet', rx: false,
    dose: '1 tablet', frequency: '1 + 1 + 1', duration: '3 days', instruction: 'After meals. Avoid tea or coffee while taking it.',
    uses: ['Headache and migraine', 'Toothache', 'Fever with body ache'],
    sideEffects: ['Sleeplessness', 'Restlessness', 'Fast heartbeat'],
    warnings: ['Do not take at bedtime', 'Not for children under 12'],
  },
  paracetamolSyrup: {
    generic: 'Paracetamol', category: 'Pain & Fever', form: 'Suspension', rx: false,
    dose: '5 mL', frequency: '1 + 1 + 1', duration: '3 days', instruction: 'Shake well. Dose by weight for children; at least 4 hours apart.',
    uses: ['Fever in children', 'Teething and ear pain', 'Pain after vaccination'],
    sideEffects: ['Rarely skin rash'],
    warnings: ['Use the measuring cup provided', 'Do not give more than 4 doses in 24 hours'],
  },
  paracetamolDrops: {
    generic: 'Paracetamol', category: 'Pain & Fever', form: 'Drops', rx: false,
    dose: '0.6 mL', frequency: '1 + 1 + 1', duration: '3 days', instruction: 'For infants. Use the dropper; dose by weight.',
    uses: ['Fever in infants', 'Pain after vaccination'],
    sideEffects: ['Rarely skin rash'],
    warnings: ['Use only the dropper provided', 'Ask a doctor for babies under 3 months'],
  },
  ibuprofen: {
    generic: 'Ibuprofen', category: 'Pain & Inflammation', form: 'Tablet', rx: false,
    dose: '1 tablet', frequency: '1 + 1 + 1', duration: '5 days', instruction: 'Right after meals with a full glass of water.',
    uses: ['Muscle, joint and back pain', 'Period pain', 'Dental pain', 'Fever'],
    sideEffects: ['Stomach upset or heartburn', 'Nausea', 'Dizziness'],
    warnings: ['Avoid with stomach ulcer or kidney disease', 'Avoid in the last 3 months of pregnancy'],
  },
  naproxen: {
    generic: 'Naproxen', category: 'Pain & Inflammation', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 1', duration: '7 days', instruction: 'After meals with water.',
    uses: ['Arthritis pain and swelling', 'Gout attacks', 'Period pain'],
    sideEffects: ['Heartburn', 'Stomach pain', 'Headache'],
    warnings: ['Avoid with stomach ulcer, kidney or heart disease', 'Take with an acid-reducing medicine if advised'],
  },
  diclofenac: {
    generic: 'Diclofenac Sodium', category: 'Pain & Inflammation', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 1', duration: '5 days', instruction: 'After meals. Swallow whole.',
    uses: ['Joint and back pain', 'Sprains and strains', 'Arthritis'],
    sideEffects: ['Stomach pain', 'Nausea', 'Headache'],
    warnings: ['Avoid with stomach ulcer, kidney or heart disease', 'Not for use in pregnancy'],
  },
  diclofenacGel: {
    generic: 'Diclofenac Diethylamine', category: 'Pain & Inflammation', form: 'Gel', rx: false,
    dose: 'Apply a thin layer', frequency: '1 + 1 + 1', duration: '7 days', instruction: 'Rub gently on the painful area. Wash hands after use.',
    uses: ['Muscle pain and sprains', 'Back and neck pain', 'Joint pain'],
    sideEffects: ['Skin redness or itching where applied'],
    warnings: ['Do not apply on broken skin or near eyes', 'Avoid strong sunlight on treated skin'],
  },
  aceclofenac: {
    generic: 'Aceclofenac', category: 'Pain & Inflammation', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 1', duration: '7 days', instruction: 'After meals.',
    uses: ['Osteoarthritis', 'Rheumatoid arthritis', 'Back pain'],
    sideEffects: ['Indigestion', 'Stomach pain', 'Dizziness'],
    warnings: ['Avoid with stomach ulcer, kidney or heart disease'],
  },
  ketorolac: {
    generic: 'Ketorolac Tromethamine', category: 'Pain & Inflammation', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 1 + 1', duration: '3 days', instruction: 'After meals. Do not use for more than 5 days.',
    uses: ['Short-term moderate to severe pain', 'Pain after surgery or dental work'],
    sideEffects: ['Stomach pain', 'Nausea', 'Drowsiness'],
    warnings: ['Short-term use only', 'Avoid with kidney disease or bleeding problems'],
  },
  tramadol: {
    generic: 'Tramadol Hydrochloride', category: 'Pain & Inflammation', form: 'Capsule', rx: true,
    dose: '1 capsule', frequency: '1 + 0 + 1', duration: '5 days', instruction: 'After meals. May cause drowsiness; do not drive.',
    uses: ['Moderate to severe pain'],
    sideEffects: ['Nausea', 'Dizziness', 'Constipation', 'Drowsiness'],
    warnings: ['Can be habit-forming', 'Do not take with alcohol or sleeping pills'],
  },
  omeprazole: {
    generic: 'Omeprazole', category: 'Gastric & Acidity', form: 'Capsule', rx: false,
    dose: '1 capsule', frequency: '1 + 0 + 1', duration: '14 days', instruction: '30 minutes before breakfast and dinner, on an empty stomach.',
    uses: ['Acidity and heartburn', 'Stomach and duodenal ulcer', 'Gastro-oesophageal reflux (GERD)'],
    sideEffects: ['Headache', 'Stomach pain', 'Diarrhoea or constipation'],
    warnings: ['Long-term use should be reviewed by a doctor'],
  },
  esomeprazole: {
    generic: 'Esomeprazole', category: 'Gastric & Acidity', form: 'Capsule', rx: false,
    dose: '1 capsule', frequency: '1 + 0 + 1', duration: '14 days', instruction: '30 minutes before meals. Swallow whole.',
    uses: ['GERD and heartburn', 'Stomach ulcer', 'Protecting the stomach during painkiller use'],
    sideEffects: ['Headache', 'Nausea', 'Diarrhoea'],
    warnings: ['Long-term use should be reviewed by a doctor'],
  },
  pantoprazole: {
    generic: 'Pantoprazole', category: 'Gastric & Acidity', form: 'Tablet', rx: false,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '14 days', instruction: 'Before breakfast. Swallow whole, do not chew.',
    uses: ['GERD', 'Stomach and duodenal ulcer', 'Acidity'],
    sideEffects: ['Headache', 'Diarrhoea', 'Joint pain'],
    warnings: ['Long-term use should be reviewed by a doctor'],
  },
  rabeprazole: {
    generic: 'Rabeprazole Sodium', category: 'Gastric & Acidity', form: 'Tablet', rx: false,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '14 days', instruction: 'Before breakfast.',
    uses: ['GERD', 'Stomach ulcer', 'H. pylori treatment (with antibiotics)'],
    sideEffects: ['Headache', 'Diarrhoea'],
    warnings: ['Long-term use should be reviewed by a doctor'],
  },
  famotidine: {
    generic: 'Famotidine', category: 'Gastric & Acidity', form: 'Tablet', rx: false,
    dose: '1 tablet', frequency: '1 + 0 + 1', duration: '14 days', instruction: 'Before meals or at bedtime.',
    uses: ['Heartburn and acidity', 'Stomach ulcer'],
    sideEffects: ['Headache', 'Dizziness', 'Constipation'],
    warnings: ['Reduce dose in kidney disease'],
  },
  antacid: {
    generic: 'Aluminium Hydroxide + Magnesium Hydroxide', category: 'Gastric & Acidity', form: 'Suspension', rx: false,
    dose: '10 mL', frequency: '1 + 1 + 1', duration: '7 days', instruction: 'Shake well. 1 hour after meals and at bedtime.',
    uses: ['Heartburn', 'Acid indigestion', 'Upset stomach'],
    sideEffects: ['Constipation or diarrhoea'],
    warnings: ['Keep 2 hours apart from other medicines', 'Avoid long-term use in kidney disease'],
  },
  domperidone: {
    generic: 'Domperidone', category: 'Gastric & Acidity', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 1 + 1', duration: '5 days', instruction: '15–30 minutes before meals.',
    uses: ['Nausea and vomiting', 'Bloating and fullness after meals'],
    sideEffects: ['Dry mouth', 'Headache'],
    warnings: ['Do not use for more than 7 days without advice', 'Avoid with heart rhythm problems'],
  },
  ondansetron: {
    generic: 'Ondansetron', category: 'Gastric & Acidity', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 1', duration: '3 days', instruction: 'Can be taken with or without food.',
    uses: ['Nausea and vomiting', 'Vomiting after surgery or chemotherapy'],
    sideEffects: ['Headache', 'Constipation', 'Feeling warm'],
    warnings: ['Avoid with heart rhythm problems'],
  },
  ors: {
    generic: 'Oral Rehydration Salts', category: 'Gastric & Acidity', form: 'Sachet', rx: false,
    dose: '1 sachet in 500 mL water', frequency: 'After each loose stool', duration: 'Until diarrhoea stops', instruction: 'Dissolve in 500 mL clean drinking water. Sip slowly.',
    uses: ['Dehydration from diarrhoea', 'Dehydration from vomiting or heat'],
    sideEffects: ['Vomiting if taken too fast'],
    warnings: ['Use exactly 500 mL water', 'See a doctor if there is blood in stool or no urine for 6 hours'],
  },
  zinc: {
    generic: 'Zinc Sulfate', category: 'Vitamins & Supplements', form: 'Syrup', rx: false,
    dose: '10 mL', frequency: '1 + 0 + 0', duration: '10 days', instruction: 'Give with ORS during diarrhoea. Complete 10 days.',
    uses: ['Childhood diarrhoea (with ORS)', 'Zinc deficiency'],
    sideEffects: ['Nausea', 'Metallic taste'],
    warnings: ['Complete the full 10-day course'],
  },
  metronidazole: {
    generic: 'Metronidazole', category: 'Antibiotic & Antiprotozoal', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 1 + 1', duration: '7 days', instruction: 'After meals. Do not drink alcohol during and 48 hours after.',
    uses: ['Amoebic dysentery', 'Giardiasis', 'Dental and anaerobic infections'],
    sideEffects: ['Metallic taste', 'Nausea', 'Dark urine'],
    warnings: ['No alcohol during and for 2 days after the course', 'Complete the full course'],
  },
  loperamide: {
    generic: 'Loperamide Hydrochloride', category: 'Gastric & Acidity', form: 'Capsule', rx: false,
    dose: '1 capsule', frequency: 'After each loose stool', duration: '2 days', instruction: 'Max 8 capsules a day. Drink plenty of fluids.',
    uses: ['Short-term acute diarrhoea'],
    sideEffects: ['Constipation', 'Bloating', 'Dizziness'],
    warnings: ['Not for children under 12', 'Do not use with fever or blood in stool'],
  },
  lactulose: {
    generic: 'Lactulose', category: 'Gastric & Acidity', form: 'Syrup', rx: false,
    dose: '15 mL', frequency: '0 + 0 + 1', duration: '7 days', instruction: 'At bedtime. Drink plenty of water.',
    uses: ['Constipation', 'Hepatic encephalopathy'],
    sideEffects: ['Bloating', 'Gas', 'Stomach cramps'],
    warnings: ['May take 1–2 days to work'],
  },
  amoxicillin: {
    generic: 'Amoxicillin', category: 'Antibiotic', form: 'Capsule', rx: true,
    dose: '1 capsule', frequency: '1 + 1 + 1', duration: '7 days', instruction: 'Every 8 hours. Complete the full course.',
    uses: ['Throat, ear and chest infections', 'Urinary tract infections', 'Dental infections'],
    sideEffects: ['Diarrhoea', 'Nausea', 'Skin rash'],
    warnings: ['Do not take if allergic to penicillin', 'Complete the full course'],
  },
  amoxicillinSusp: {
    generic: 'Amoxicillin', category: 'Antibiotic', form: 'Suspension', rx: true,
    dose: '5 mL', frequency: '1 + 1 + 1', duration: '7 days', instruction: 'Shake well. Dose by weight. Keep in the fridge after mixing.',
    uses: ['Ear, throat and chest infections in children'],
    sideEffects: ['Diarrhoea', 'Nappy rash', 'Skin rash'],
    warnings: ['Do not give if allergic to penicillin', 'Complete the full course'],
  },
  coAmoxiclav: {
    generic: 'Amoxicillin + Clavulanic Acid', category: 'Antibiotic', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 1', duration: '7 days', instruction: 'At the start of a meal. Complete the full course.',
    uses: ['Sinus, ear and chest infections', 'Skin and soft tissue infections', 'Urinary tract infections'],
    sideEffects: ['Diarrhoea', 'Nausea', 'Thrush'],
    warnings: ['Do not take if allergic to penicillin', 'Complete the full course'],
  },
  azithromycin: {
    generic: 'Azithromycin', category: 'Antibiotic', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '3 days', instruction: '1 hour before or 2 hours after food, same time each day.',
    uses: ['Throat and chest infections', 'Typhoid', 'Some skin and sexually transmitted infections'],
    sideEffects: ['Diarrhoea', 'Nausea', 'Stomach pain'],
    warnings: ['Complete the full course', 'Avoid with heart rhythm problems'],
  },
  azithromycinSusp: {
    generic: 'Azithromycin', category: 'Antibiotic', form: 'Suspension', rx: true,
    dose: '5 mL', frequency: '1 + 0 + 0', duration: '3 days', instruction: 'Shake well. Dose by weight, once daily.',
    uses: ['Throat, ear and chest infections in children'],
    sideEffects: ['Diarrhoea', 'Vomiting'],
    warnings: ['Complete the full course'],
  },
  cefixime: {
    generic: 'Cefixime', category: 'Antibiotic', form: 'Capsule', rx: true,
    dose: '1 capsule', frequency: '1 + 0 + 1', duration: '7 days', instruction: 'With or without food. Complete the full course.',
    uses: ['Typhoid fever', 'Urinary tract infections', 'Throat and ear infections'],
    sideEffects: ['Diarrhoea', 'Stomach pain', 'Nausea'],
    warnings: ['Tell the doctor about any penicillin allergy', 'Complete the full course'],
  },
  cefuroxime: {
    generic: 'Cefuroxime Axetil', category: 'Antibiotic', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 1', duration: '7 days', instruction: 'After meals. Complete the full course.',
    uses: ['Sinus, throat and chest infections', 'Skin infections', 'Urinary tract infections'],
    sideEffects: ['Diarrhoea', 'Nausea', 'Headache'],
    warnings: ['Tell the doctor about any penicillin allergy', 'Complete the full course'],
  },
  ceftriaxone: {
    generic: 'Ceftriaxone', category: 'Antibiotic', form: 'Injection', rx: true,
    dose: '1 g', frequency: '1 + 0 + 0', duration: '5 days', instruction: 'IV or IM injection, given by a health professional.',
    uses: ['Serious infections', 'Typhoid', 'Meningitis and pneumonia'],
    sideEffects: ['Pain at injection site', 'Diarrhoea', 'Rash'],
    warnings: ['Hospital or clinic use only', 'Tell the doctor about any penicillin allergy'],
  },
  ciprofloxacin: {
    generic: 'Ciprofloxacin', category: 'Antibiotic', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 1', duration: '7 days', instruction: 'Keep 2 hours apart from milk, antacids, iron or zinc.',
    uses: ['Urinary tract infections', 'Typhoid', 'Infectious diarrhoea'],
    sideEffects: ['Nausea', 'Diarrhoea', 'Dizziness'],
    warnings: ['Not for children or pregnant women unless advised', 'Stop and see a doctor if tendons hurt'],
  },
  levofloxacin: {
    generic: 'Levofloxacin', category: 'Antibiotic', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '7 days', instruction: 'Same time each day. Keep apart from antacids and iron.',
    uses: ['Pneumonia and chest infections', 'Sinusitis', 'Urinary tract infections'],
    sideEffects: ['Nausea', 'Headache', 'Sleeplessness'],
    warnings: ['Stop and see a doctor if tendons hurt', 'Avoid strong sunlight'],
  },
  doxycycline: {
    generic: 'Doxycycline', category: 'Antibiotic', form: 'Capsule', rx: true,
    dose: '1 capsule', frequency: '1 + 0 + 1', duration: '7 days', instruction: 'With a full glass of water, sitting up. Not at bedtime.',
    uses: ['Chest infections', 'Acne', 'Leptospirosis and scrub typhus'],
    sideEffects: ['Heartburn', 'Sun sensitivity', 'Nausea'],
    warnings: ['Not for children under 8 or in pregnancy', 'Avoid strong sunlight'],
  },
  flucloxacillin: {
    generic: 'Flucloxacillin', category: 'Antibiotic', form: 'Capsule', rx: true,
    dose: '1 capsule', frequency: '1 + 1 + 1 + 1', duration: '7 days', instruction: '1 hour before meals, every 6 hours.',
    uses: ['Boils and skin infections', 'Infected wounds', 'Cellulitis'],
    sideEffects: ['Diarrhoea', 'Nausea'],
    warnings: ['Do not take if allergic to penicillin'],
  },
  nitrofurantoin: {
    generic: 'Nitrofurantoin', category: 'Antibiotic', form: 'Capsule', rx: true,
    dose: '1 capsule', frequency: '1 + 0 + 1', duration: '5 days', instruction: 'With food or milk.',
    uses: ['Uncomplicated bladder infection (cystitis)'],
    sideEffects: ['Nausea', 'Dark yellow urine', 'Headache'],
    warnings: ['Avoid in severe kidney disease', 'Avoid near the end of pregnancy'],
  },
  fluconazole: {
    generic: 'Fluconazole', category: 'Antifungal', form: 'Capsule', rx: true,
    dose: '1 capsule', frequency: '1 + 0 + 0', duration: '1 day', instruction: 'Single dose unless advised otherwise.',
    uses: ['Vaginal thrush', 'Oral thrush', 'Fungal skin and nail infections'],
    sideEffects: ['Headache', 'Nausea', 'Stomach pain'],
    warnings: ['Tell the doctor about other medicines you take'],
  },
  clotrimazole: {
    generic: 'Clotrimazole', category: 'Antifungal', form: 'Cream', rx: false,
    dose: 'Apply a thin layer', frequency: '1 + 0 + 1', duration: '14 days', instruction: 'Clean and dry the area first. Continue 1 week after it clears.',
    uses: ['Ringworm', 'Athlete\'s foot', 'Fungal skin rash'],
    sideEffects: ['Mild burning or itching where applied'],
    warnings: ['For skin use only', 'Avoid contact with eyes'],
  },
  ketoconazole: {
    generic: 'Ketoconazole', category: 'Antifungal', form: 'Cream', rx: false,
    dose: 'Apply a thin layer', frequency: '1 + 0 + 0', duration: '14 days', instruction: 'Apply to the affected area and a little around it.',
    uses: ['Ringworm', 'Seborrhoeic dermatitis', 'Pityriasis versicolor'],
    sideEffects: ['Skin irritation where applied'],
    warnings: ['For skin use only'],
  },
  terbinafine: {
    generic: 'Terbinafine', category: 'Antifungal', form: 'Cream', rx: false,
    dose: 'Apply a thin layer', frequency: '1 + 0 + 1', duration: '14 days', instruction: 'Clean and dry the area first.',
    uses: ['Athlete\'s foot', 'Ringworm', 'Jock itch'],
    sideEffects: ['Redness or itching where applied'],
    warnings: ['For skin use only'],
  },
  fusidicAcid: {
    generic: 'Fusidic Acid', category: 'Skin Care', form: 'Cream', rx: true,
    dose: 'Apply a thin layer', frequency: '1 + 1 + 1', duration: '7 days', instruction: 'Apply on the infected area after cleaning.',
    uses: ['Impetigo', 'Infected cuts and wounds', 'Infected eczema'],
    sideEffects: ['Mild irritation where applied'],
    warnings: ['Do not use for more than 2 weeks'],
  },
  mupirocin: {
    generic: 'Mupirocin', category: 'Skin Care', form: 'Ointment', rx: true,
    dose: 'Apply a thin layer', frequency: '1 + 1 + 1', duration: '7 days', instruction: 'Cover with a dressing if needed.',
    uses: ['Impetigo', 'Infected skin wounds', 'Boils'],
    sideEffects: ['Burning or stinging where applied'],
    warnings: ['Do not use for more than 10 days'],
  },
  betamethasone: {
    generic: 'Betamethasone Valerate', category: 'Skin Care', form: 'Cream', rx: true,
    dose: 'Apply a thin layer', frequency: '1 + 0 + 1', duration: '7 days', instruction: 'Apply only on affected skin, not on the face unless advised.',
    uses: ['Eczema', 'Psoriasis', 'Allergic skin inflammation'],
    sideEffects: ['Skin thinning with long use', 'Burning'],
    warnings: ['Do not use on infected skin', 'Short courses only'],
  },
  permethrin: {
    generic: 'Permethrin', category: 'Skin Care', form: 'Cream', rx: false,
    dose: 'Apply from neck down', frequency: 'Once', duration: 'Repeat after 7 days', instruction: 'Leave on for 8–12 hours, then wash off. Treat the whole family.',
    uses: ['Scabies', 'Head lice'],
    sideEffects: ['Mild itching or burning'],
    warnings: ['Wash all bedding and clothes in hot water', 'Avoid eyes and mouth'],
  },
  cetirizine: {
    generic: 'Cetirizine Hydrochloride', category: 'Allergy', form: 'Tablet', rx: false,
    dose: '1 tablet', frequency: '0 + 0 + 1', duration: '7 days', instruction: 'At night. May cause drowsiness.',
    uses: ['Allergic rhinitis and sneezing', 'Itchy skin and hives', 'Itchy watery eyes'],
    sideEffects: ['Drowsiness', 'Dry mouth', 'Headache'],
    warnings: ['Avoid driving if drowsy', 'Avoid alcohol'],
  },
  levocetirizine: {
    generic: 'Levocetirizine', category: 'Allergy', form: 'Tablet', rx: false,
    dose: '1 tablet', frequency: '0 + 0 + 1', duration: '7 days', instruction: 'At night.',
    uses: ['Allergic rhinitis', 'Hives and itching'],
    sideEffects: ['Drowsiness', 'Dry mouth'],
    warnings: ['Avoid driving if drowsy'],
  },
  fexofenadine: {
    generic: 'Fexofenadine Hydrochloride', category: 'Allergy', form: 'Tablet', rx: false,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '7 days', instruction: 'With water, not with fruit juice.',
    uses: ['Seasonal allergy', 'Hives and itching'],
    sideEffects: ['Headache', 'Nausea'],
    warnings: ['Keep apart from antacids by 2 hours'],
  },
  loratadine: {
    generic: 'Loratadine', category: 'Allergy', form: 'Tablet', rx: false,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '7 days', instruction: 'Once daily.',
    uses: ['Allergic rhinitis', 'Hives'],
    sideEffects: ['Headache', 'Tiredness'],
    warnings: ['Ask a doctor in liver disease'],
  },
  desloratadine: {
    generic: 'Desloratadine', category: 'Allergy', form: 'Tablet', rx: false,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '7 days', instruction: 'Once daily, with or without food.',
    uses: ['Allergic rhinitis', 'Hives'],
    sideEffects: ['Headache', 'Dry mouth', 'Tiredness'],
    warnings: ['Ask a doctor in kidney disease'],
  },
  chlorpheniramine: {
    generic: 'Chlorpheniramine Maleate', category: 'Allergy', form: 'Syrup', rx: false,
    dose: '5 mL', frequency: '1 + 1 + 1', duration: '5 days', instruction: 'Causes drowsiness.',
    uses: ['Allergy and itching', 'Runny nose and sneezing'],
    sideEffects: ['Drowsiness', 'Dry mouth', 'Blurred vision'],
    warnings: ['Do not drive', 'Not for children under 2'],
  },
  montelukast: {
    generic: 'Montelukast', category: 'Respiratory', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '0 + 0 + 1', duration: '30 days', instruction: 'In the evening, every day, even when well.',
    uses: ['Asthma prevention', 'Allergic rhinitis', 'Exercise-induced asthma'],
    sideEffects: ['Headache', 'Stomach pain', 'Mood or sleep changes'],
    warnings: ['Not for sudden asthma attacks', 'Report mood changes to a doctor'],
  },
  salbutamolInh: {
    generic: 'Salbutamol', category: 'Respiratory', form: 'Inhaler', rx: true,
    dose: '2 puffs', frequency: 'When needed', duration: 'As advised', instruction: 'Shake well. Use a spacer if possible. Max 8 puffs a day.',
    uses: ['Relief of asthma attacks', 'Wheezing and breathlessness', 'COPD'],
    sideEffects: ['Shaky hands', 'Fast heartbeat', 'Headache'],
    warnings: ['See a doctor if you need it more than 3 times a week'],
  },
  salbutamolSyrup: {
    generic: 'Salbutamol Sulfate', category: 'Respiratory', form: 'Syrup', rx: true,
    dose: '5 mL', frequency: '1 + 1 + 1', duration: '5 days', instruction: 'Dose by age and weight.',
    uses: ['Wheezing and chest tightness', 'Asthma'],
    sideEffects: ['Shaky hands', 'Fast heartbeat'],
    warnings: ['Use with caution in heart disease'],
  },
  fluticasoneSalmeterol: {
    generic: 'Fluticasone + Salmeterol', category: 'Respiratory', form: 'Inhaler', rx: true,
    dose: '2 puffs', frequency: '1 + 0 + 1', duration: '30 days', instruction: 'Rinse mouth after each use. Use every day.',
    uses: ['Asthma control', 'COPD'],
    sideEffects: ['Hoarse voice', 'Oral thrush', 'Headache'],
    warnings: ['Not for sudden attacks', 'Do not stop suddenly'],
  },
  fluticasoneNasal: {
    generic: 'Fluticasone Propionate', category: 'Respiratory', form: 'Drops', rx: true,
    dose: '2 sprays each nostril', frequency: '1 + 0 + 0', duration: '14 days', instruction: 'Shake well. Aim away from the middle of the nose.',
    uses: ['Allergic rhinitis', 'Nasal blockage', 'Nasal polyps'],
    sideEffects: ['Nosebleed', 'Nasal dryness'],
    warnings: ['Takes a few days to work fully'],
  },
  xylometazoline: {
    generic: 'Xylometazoline Hydrochloride', category: 'Respiratory', form: 'Drops', rx: false,
    dose: '2 drops each nostril', frequency: '1 + 1 + 1', duration: '5 days', instruction: 'Do not use for more than 7 days.',
    uses: ['Blocked nose from cold or sinusitis'],
    sideEffects: ['Stinging', 'Rebound blockage with long use'],
    warnings: ['Max 7 days', 'Use the paediatric strength for children'],
  },
  ambroxol: {
    generic: 'Ambroxol Hydrochloride', category: 'Cough & Cold', form: 'Syrup', rx: false,
    dose: '10 mL', frequency: '1 + 1 + 1', duration: '5 days', instruction: 'After meals. Drink plenty of water.',
    uses: ['Wet cough with thick mucus', 'Bronchitis'],
    sideEffects: ['Nausea', 'Stomach upset'],
    warnings: ['Ask a doctor for children under 2'],
  },
  dextromethorphan: {
    generic: 'Dextromethorphan + Pseudoephedrine + Triprolidine', category: 'Cough & Cold', form: 'Syrup', rx: false,
    dose: '10 mL', frequency: '1 + 1 + 1', duration: '5 days', instruction: 'May cause drowsiness.',
    uses: ['Dry cough', 'Runny or blocked nose'],
    sideEffects: ['Drowsiness', 'Dizziness', 'Dry mouth'],
    warnings: ['Avoid in high blood pressure', 'Not for children under 6'],
  },
  adhatoda: {
    generic: 'Adhatoda vasica (Basak)', category: 'Cough & Cold', form: 'Syrup', rx: false,
    dose: '10 mL', frequency: '1 + 1 + 1', duration: '7 days', instruction: 'After meals.',
    uses: ['Cough and cold', 'Bronchitis'],
    sideEffects: ['Mild stomach upset'],
    warnings: ['Avoid in pregnancy'],
  },
  amlodipine: {
    generic: 'Amlodipine', category: 'Heart & Blood Pressure', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '30 days', instruction: 'Same time each day. Do not stop suddenly.',
    uses: ['High blood pressure', 'Angina (chest pain)'],
    sideEffects: ['Ankle swelling', 'Flushing', 'Headache'],
    warnings: ['Check blood pressure regularly'],
  },
  losartan: {
    generic: 'Losartan Potassium', category: 'Heart & Blood Pressure', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '30 days', instruction: 'Same time each day.',
    uses: ['High blood pressure', 'Kidney protection in diabetes'],
    sideEffects: ['Dizziness', 'High potassium'],
    warnings: ['Not in pregnancy', 'Check kidney function and potassium'],
  },
  amlodipineLosartan: {
    generic: 'Amlodipine + Losartan Potassium', category: 'Heart & Blood Pressure', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '30 days', instruction: 'Same time each day.',
    uses: ['High blood pressure not controlled by one medicine'],
    sideEffects: ['Ankle swelling', 'Dizziness', 'Headache'],
    warnings: ['Not in pregnancy'],
  },
  bisoprolol: {
    generic: 'Bisoprolol Fumarate', category: 'Heart & Blood Pressure', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '30 days', instruction: 'In the morning. Do not stop suddenly.',
    uses: ['High blood pressure', 'Heart failure', 'Angina'],
    sideEffects: ['Tiredness', 'Cold hands and feet', 'Slow pulse'],
    warnings: ['Do not stop suddenly', 'Use with care in asthma'],
  },
  atenolol: {
    generic: 'Atenolol', category: 'Heart & Blood Pressure', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '30 days', instruction: 'Same time each day.',
    uses: ['High blood pressure', 'Angina', 'Fast heartbeat'],
    sideEffects: ['Tiredness', 'Cold hands', 'Slow pulse'],
    warnings: ['Do not stop suddenly', 'Avoid in asthma'],
  },
  telmisartan: {
    generic: 'Telmisartan', category: 'Heart & Blood Pressure', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '30 days', instruction: 'Same time each day.',
    uses: ['High blood pressure', 'Reducing heart risk'],
    sideEffects: ['Dizziness', 'Back pain'],
    warnings: ['Not in pregnancy'],
  },
  atorvastatin: {
    generic: 'Atorvastatin', category: 'Heart & Blood Pressure', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '0 + 0 + 1', duration: '30 days', instruction: 'At night.',
    uses: ['High cholesterol', 'Preventing heart attack and stroke'],
    sideEffects: ['Muscle aches', 'Stomach upset'],
    warnings: ['Report unexplained muscle pain', 'Not in pregnancy'],
  },
  rosuvastatin: {
    generic: 'Rosuvastatin', category: 'Heart & Blood Pressure', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '0 + 0 + 1', duration: '30 days', instruction: 'At night.',
    uses: ['High cholesterol', 'Preventing heart disease'],
    sideEffects: ['Muscle aches', 'Headache'],
    warnings: ['Report unexplained muscle pain', 'Not in pregnancy'],
  },
  aspirin: {
    generic: 'Aspirin (low dose)', category: 'Heart & Blood Pressure', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '0 + 1 + 0', duration: '30 days', instruction: 'After lunch.',
    uses: ['Preventing heart attack and stroke', 'After stent or bypass'],
    sideEffects: ['Stomach irritation', 'Easy bruising'],
    warnings: ['Avoid with stomach ulcer or bleeding problems', 'Not for children under 16'],
  },
  clopidogrel: {
    generic: 'Clopidogrel', category: 'Heart & Blood Pressure', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '30 days', instruction: 'Same time each day. Do not stop without advice.',
    uses: ['After heart attack or stent', 'Stroke prevention'],
    sideEffects: ['Bruising', 'Bleeding', 'Stomach upset'],
    warnings: ['Tell your dentist or surgeon you take it'],
  },
  furosemide: {
    generic: 'Furosemide', category: 'Heart & Blood Pressure', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '14 days', instruction: 'In the morning (causes frequent urination).',
    uses: ['Fluid build-up (oedema)', 'Heart failure', 'High blood pressure'],
    sideEffects: ['Frequent urination', 'Dizziness', 'Low potassium'],
    warnings: ['Check salts (electrolytes) regularly'],
  },
  metformin: {
    generic: 'Metformin Hydrochloride', category: 'Diabetes', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 1', duration: '30 days', instruction: 'With or right after meals.',
    uses: ['Type 2 diabetes'],
    sideEffects: ['Nausea', 'Diarrhoea', 'Metallic taste'],
    warnings: ['Stop before contrast scans or surgery if advised', 'Avoid in severe kidney disease'],
  },
  gliclazide: {
    generic: 'Gliclazide', category: 'Diabetes', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '30 days', instruction: 'With breakfast. Do not skip meals.',
    uses: ['Type 2 diabetes'],
    sideEffects: ['Low blood sugar', 'Weight gain'],
    warnings: ['Know the signs of low sugar: sweating, shaking, confusion'],
  },
  glimepiride: {
    generic: 'Glimepiride', category: 'Diabetes', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '30 days', instruction: 'With breakfast. Do not skip meals.',
    uses: ['Type 2 diabetes'],
    sideEffects: ['Low blood sugar', 'Dizziness'],
    warnings: ['Know the signs of low sugar'],
  },
  sitagliptin: {
    generic: 'Sitagliptin', category: 'Diabetes', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '30 days', instruction: 'Once daily, with or without food.',
    uses: ['Type 2 diabetes'],
    sideEffects: ['Headache', 'Runny nose'],
    warnings: ['Stop and see a doctor with severe stomach pain'],
  },
  sitagliptinMetformin: {
    generic: 'Sitagliptin + Metformin', category: 'Diabetes', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 1', duration: '30 days', instruction: 'With meals.',
    uses: ['Type 2 diabetes'],
    sideEffects: ['Nausea', 'Diarrhoea', 'Headache'],
    warnings: ['Avoid in severe kidney disease'],
  },
  empagliflozin: {
    generic: 'Empagliflozin', category: 'Diabetes', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '30 days', instruction: 'In the morning. Drink enough water.',
    uses: ['Type 2 diabetes', 'Heart failure', 'Chronic kidney disease'],
    sideEffects: ['Genital yeast infection', 'Frequent urination'],
    warnings: ['Keep genital area clean', 'Stop during severe illness if advised'],
  },
  insulin: {
    generic: 'Insulin (Biphasic Human 30/70)', category: 'Diabetes', form: 'Injection', rx: true,
    dose: 'As advised units', frequency: '1 + 0 + 1', duration: '30 days', instruction: 'Inject under the skin 30 minutes before meals. Rotate sites.',
    uses: ['Type 1 and type 2 diabetes'],
    sideEffects: ['Low blood sugar', 'Weight gain', 'Lumps at injection site'],
    warnings: ['Keep unopened pens in the fridge', 'Always carry sugar for low sugar episodes'],
  },
  levothyroxine: {
    generic: 'Levothyroxine Sodium', category: 'Hormone & Thyroid', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '30 days', instruction: 'On an empty stomach, 30–60 minutes before breakfast.',
    uses: ['Hypothyroidism (underactive thyroid)'],
    sideEffects: ['Palpitations or weight loss if the dose is too high'],
    warnings: ['Keep 4 hours apart from calcium or iron', 'Regular thyroid tests needed'],
  },
  prednisolone: {
    generic: 'Prednisolone', category: 'Hormone & Thyroid', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '5 days', instruction: 'In the morning after breakfast.',
    uses: ['Asthma flare-ups', 'Severe allergy', 'Inflammatory conditions'],
    sideEffects: ['Increased appetite', 'Raised blood sugar', 'Mood changes'],
    warnings: ['Do not stop suddenly after long courses'],
  },
  calciumD: {
    generic: 'Calcium Carbonate + Vitamin D3', category: 'Vitamins & Supplements', form: 'Tablet', rx: false,
    dose: '1 tablet', frequency: '0 + 1 + 0', duration: '30 days', instruction: 'After meals.',
    uses: ['Calcium and vitamin D deficiency', 'Bone health and osteoporosis', 'Pregnancy and breastfeeding'],
    sideEffects: ['Constipation', 'Bloating'],
    warnings: ['Keep apart from iron and thyroid tablets'],
  },
  vitaminD: {
    generic: 'Cholecalciferol (Vitamin D3)', category: 'Vitamins & Supplements', form: 'Capsule', rx: false,
    dose: '1 capsule', frequency: 'Once weekly', duration: '8 weeks', instruction: 'After a meal.',
    uses: ['Vitamin D deficiency'],
    sideEffects: ['Rare at normal doses'],
    warnings: ['Do not exceed the advised dose'],
  },
  ironFolic: {
    generic: 'Ferrous Fumarate + Folic Acid', category: 'Vitamins & Supplements', form: 'Capsule', rx: false,
    dose: '1 capsule', frequency: '1 + 0 + 0', duration: '90 days', instruction: 'Before breakfast with water or orange juice, not with tea or milk.',
    uses: ['Iron deficiency anaemia', 'Pregnancy'],
    sideEffects: ['Dark stools', 'Constipation', 'Stomach upset'],
    warnings: ['Keep out of reach of children — iron overdose is dangerous'],
  },
  folicAcid: {
    generic: 'Folic Acid', category: 'Vitamins & Supplements', form: 'Tablet', rx: false,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '90 days', instruction: 'Once daily.',
    uses: ['Before and during early pregnancy', 'Folate deficiency anaemia'],
    sideEffects: ['Rare'],
    warnings: ['Start before pregnancy if planning'],
  },
  bComplex: {
    generic: 'Vitamin B Complex', category: 'Vitamins & Supplements', form: 'Tablet', rx: false,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '30 days', instruction: 'After breakfast.',
    uses: ['Vitamin B deficiency', 'Mouth ulcers and cracked lips', 'Weakness and tiredness'],
    sideEffects: ['Bright yellow urine'],
    warnings: ['Harmless urine colour change'],
  },
  multivitamin: {
    generic: 'Multivitamin + Multimineral', category: 'Vitamins & Supplements', form: 'Tablet', rx: false,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '30 days', instruction: 'After breakfast.',
    uses: ['General nutrition support', 'Recovery after illness'],
    sideEffects: ['Mild stomach upset'],
    warnings: ['Do not take with other iron supplements unless advised'],
  },
  vitaminC: {
    generic: 'Ascorbic Acid (Vitamin C)', category: 'Vitamins & Supplements', form: 'Tablet', rx: false,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '30 days', instruction: 'Chew after meals.',
    uses: ['Vitamin C deficiency', 'Immunity support', 'Helps iron absorption'],
    sideEffects: ['Stomach upset at high doses'],
    warnings: ['High doses may cause kidney stones'],
  },
  methylcobalamin: {
    generic: 'Methylcobalamin (Vitamin B12)', category: 'Vitamins & Supplements', form: 'Tablet', rx: false,
    dose: '1 tablet', frequency: '1 + 0 + 1', duration: '30 days', instruction: 'After meals.',
    uses: ['B12 deficiency', 'Nerve pain and tingling', 'Diabetic neuropathy'],
    sideEffects: ['Rare'],
    warnings: ['Long-term use should be reviewed by a doctor'],
  },
  sertraline: {
    generic: 'Sertraline', category: 'Mental Health & Neuro', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '30 days', instruction: 'In the morning. Takes 2–4 weeks to work.',
    uses: ['Depression', 'Anxiety and panic disorder', 'OCD'],
    sideEffects: ['Nausea', 'Sleep changes', 'Sexual problems'],
    warnings: ['Do not stop suddenly', 'Seek help for worsening mood'],
  },
  escitalopram: {
    generic: 'Escitalopram', category: 'Mental Health & Neuro', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 0 + 0', duration: '30 days', instruction: 'Same time each day.',
    uses: ['Depression', 'Generalised anxiety'],
    sideEffects: ['Nausea', 'Sleep problems', 'Tiredness'],
    warnings: ['Do not stop suddenly'],
  },
  clonazepam: {
    generic: 'Clonazepam', category: 'Mental Health & Neuro', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '0 + 0 + 1', duration: '14 days', instruction: 'At bedtime. Do not drive.',
    uses: ['Panic disorder', 'Seizures', 'Short-term anxiety'],
    sideEffects: ['Drowsiness', 'Dizziness', 'Poor memory'],
    warnings: ['Can be habit-forming', 'No alcohol'],
  },
  flunarizine: {
    generic: 'Flunarizine', category: 'Mental Health & Neuro', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '0 + 0 + 1', duration: '30 days', instruction: 'At bedtime.',
    uses: ['Migraine prevention', 'Vertigo'],
    sideEffects: ['Drowsiness', 'Weight gain'],
    warnings: ['Avoid in depression or Parkinson\'s'],
  },
  pregabalin: {
    generic: 'Pregabalin', category: 'Mental Health & Neuro', form: 'Capsule', rx: true,
    dose: '1 capsule', frequency: '1 + 0 + 1', duration: '30 days', instruction: 'With or without food. Do not drive if dizzy.',
    uses: ['Nerve pain', 'Diabetic neuropathy', 'Fibromyalgia'],
    sideEffects: ['Dizziness', 'Drowsiness', 'Weight gain'],
    warnings: ['Do not stop suddenly', 'No alcohol'],
  },
  betahistine: {
    generic: 'Betahistine Dihydrochloride', category: 'Mental Health & Neuro', form: 'Tablet', rx: true,
    dose: '1 tablet', frequency: '1 + 1 + 1', duration: '14 days', instruction: 'With meals.',
    uses: ['Vertigo', 'Ménière\'s disease', 'Ringing in the ears'],
    sideEffects: ['Mild stomach upset', 'Headache'],
    warnings: ['Use with care in asthma or stomach ulcer'],
  },
  tamsulosin: {
    generic: 'Tamsulosin Hydrochloride', category: 'Urology', form: 'Capsule', rx: true,
    dose: '1 capsule', frequency: '0 + 0 + 1', duration: '30 days', instruction: '30 minutes after the same meal each day. Swallow whole.',
    uses: ['Enlarged prostate (BPH) urinary symptoms', 'Helping pass kidney stones'],
    sideEffects: ['Dizziness on standing', 'Runny nose'],
    warnings: ['Stand up slowly', 'Tell the eye surgeon before cataract surgery'],
  },
  potassiumCitrate: {
    generic: 'Potassium Citrate', category: 'Urology', form: 'Syrup', rx: true,
    dose: '10 mL in water', frequency: '1 + 1 + 1', duration: '14 days', instruction: 'Dilute in a glass of water after meals.',
    uses: ['Burning urination', 'Preventing kidney stones'],
    sideEffects: ['Stomach upset'],
    warnings: ['Avoid in kidney failure'],
  },
  tobramycinEye: {
    generic: 'Tobramycin', category: 'Eye & Ear', form: 'Drops', rx: true,
    dose: '1–2 drops', frequency: '1 + 1 + 1 + 1', duration: '7 days', instruction: 'Into the affected eye. Do not touch the dropper tip.',
    uses: ['Bacterial eye infection (conjunctivitis)'],
    sideEffects: ['Mild stinging', 'Itching'],
    warnings: ['Remove contact lenses before use'],
  },
  moxifloxacinEye: {
    generic: 'Moxifloxacin', category: 'Eye & Ear', form: 'Drops', rx: true,
    dose: '1 drop', frequency: '1 + 1 + 1', duration: '7 days', instruction: 'Into the affected eye.',
    uses: ['Bacterial conjunctivitis', 'Before and after eye surgery'],
    sideEffects: ['Eye irritation', 'Blurred vision briefly'],
    warnings: ['Remove contact lenses before use'],
  },
  artificialTears: {
    generic: 'Carboxymethylcellulose Sodium', category: 'Eye & Ear', form: 'Drops', rx: false,
    dose: '1–2 drops', frequency: '1 + 1 + 1 + 1', duration: '30 days', instruction: 'As often as needed.',
    uses: ['Dry eyes', 'Eye strain from screens'],
    sideEffects: ['Brief blurred vision'],
    warnings: ['See a doctor if eye pain or redness persists'],
  },
  ciprofloxacinEar: {
    generic: 'Ciprofloxacin', category: 'Eye & Ear', form: 'Drops', rx: true,
    dose: '3 drops', frequency: '1 + 0 + 1', duration: '7 days', instruction: 'Into the affected ear. Lie on your side for 5 minutes.',
    uses: ['Outer ear infection', 'Discharging ear'],
    sideEffects: ['Ear itching or discomfort'],
    warnings: ['Warm the bottle in your hand first'],
  },
  albendazole: {
    generic: 'Albendazole', category: 'Antiparasitic', form: 'Tablet', rx: false,
    dose: '1 tablet', frequency: 'Once', duration: '1 day', instruction: 'Chew or swallow. Repeat after 2 weeks if advised.',
    uses: ['Roundworm, hookworm and pinworm', 'Deworming every 6 months'],
    sideEffects: ['Stomach pain', 'Headache'],
    warnings: ['Not in pregnancy', 'Treat the whole family for pinworm'],
  },
  ivermectin: {
    generic: 'Ivermectin', category: 'Antiparasitic', form: 'Tablet', rx: true,
    dose: '2 tablets', frequency: 'Once', duration: '1 day', instruction: 'On an empty stomach with water. Dose by weight.',
    uses: ['Scabies', 'Strongyloides', 'Head lice'],
    sideEffects: ['Dizziness', 'Itching'],
    warnings: ['Not for children under 15 kg or in pregnancy'],
  },
  calMagZinc: {
    generic: 'Calcium + Magnesium + Zinc', category: 'Women\'s Health', form: 'Tablet', rx: false,
    dose: '1 tablet', frequency: '0 + 1 + 0', duration: '30 days', instruction: 'After meals.',
    uses: ['Bone health in women', 'Pregnancy and menopause'],
    sideEffects: ['Constipation'],
    warnings: ['Keep apart from thyroid and iron tablets'],
  },
  tranexamic: {
    generic: 'Tranexamic Acid', category: 'Women\'s Health', form: 'Tablet', rx: true,
    dose: '2 tablets', frequency: '1 + 1 + 1', duration: '4 days', instruction: 'During heavy period days only.',
    uses: ['Heavy menstrual bleeding', 'Nosebleeds'],
    sideEffects: ['Nausea', 'Headache'],
    warnings: ['Avoid with a history of blood clots'],
  },
  drotaverine: {
    generic: 'Drotaverine Hydrochloride', category: 'Women\'s Health', form: 'Tablet', rx: false,
    dose: '1 tablet', frequency: '1 + 1 + 1', duration: '3 days', instruction: 'After meals.',
    uses: ['Period cramps', 'Stomach and bowel cramps', 'Kidney stone colic'],
    sideEffects: ['Dizziness', 'Nausea'],
    warnings: ['Avoid in severe heart, liver or kidney disease'],
  },
};

type Row = [name: string, generic: keyof typeof G, company: string, strength: string, mrp: number, packSize: string];

// Brand name + strength, the generic entry it uses, manufacturer, strength, MRP (BDT), and what that MRP buys.
const MEDICINES: Row[] = [
  // Pain & fever
  ['Napa 500 mg', 'paracetamolTab', 'Beximco Pharmaceuticals', '500 mg', 12, '10 tablets (1 strip)'],
  ['Napa Extra', 'paracetamolCaffeine', 'Beximco Pharmaceuticals', '500 mg + 65 mg', 25, '10 tablets (1 strip)'],
  ['Napa Extend 665 mg', 'paracetamolXr', 'Beximco Pharmaceuticals', '665 mg', 20, '10 tablets (1 strip)'],
  ['Napa Syrup', 'paracetamolSyrup', 'Beximco Pharmaceuticals', '120 mg/5 mL', 30, '60 mL bottle'],
  ['Napa Drops', 'paracetamolDrops', 'Beximco Pharmaceuticals', '80 mg/mL', 35, '15 mL bottle'],
  ['Ace 500 mg', 'paracetamolTab', 'Square Pharmaceuticals', '500 mg', 12, '10 tablets (1 strip)'],
  ['Ace Plus', 'paracetamolCaffeine', 'Square Pharmaceuticals', '500 mg + 65 mg', 25, '10 tablets (1 strip)'],
  ['Ace Syrup', 'paracetamolSyrup', 'Square Pharmaceuticals', '120 mg/5 mL', 30, '60 mL bottle'],
  ['Renova 500 mg', 'paracetamolTab', 'Opsonin Pharma', '500 mg', 10, '10 tablets (1 strip)'],
  ['Inflam 400 mg', 'ibuprofen', 'Opsonin Pharma', '400 mg', 30, '10 tablets (1 strip)'],
  ['Naprosyn 500 mg', 'naproxen', 'Radiant Pharmaceuticals', '500 mg', 120, '10 tablets (1 strip)'],
  ['Clofenac 50 mg', 'diclofenac', 'Square Pharmaceuticals', '50 mg', 18, '10 tablets (1 strip)'],
  ['Clofenac Gel', 'diclofenacGel', 'Square Pharmaceuticals', '1%', 85, '30 g tube'],
  ['Voltalin Gel', 'diclofenacGel', 'Novartis Bangladesh', '1.16%', 170, '30 g tube'],
  ['Aceclofen 100 mg', 'aceclofenac', 'Incepta Pharmaceuticals', '100 mg', 50, '10 tablets (1 strip)'],
  ['Rolac 10 mg', 'ketorolac', 'Renata Limited', '10 mg', 100, '10 tablets (1 strip)'],
  ['Tramal 50 mg', 'tramadol', 'Renata Limited', '50 mg', 90, '10 capsules (1 strip)'],

  // Gastric & acidity
  ['Seclo 20 mg', 'omeprazole', 'Square Pharmaceuticals', '20 mg', 60, '10 capsules (1 strip)'],
  ['Losectil 20 mg', 'omeprazole', 'Eskayef Pharmaceuticals', '20 mg', 50, '10 capsules (1 strip)'],
  ['Omep 20 mg', 'omeprazole', 'Incepta Pharmaceuticals', '20 mg', 50, '10 capsules (1 strip)'],
  ['Sergel 20 mg', 'esomeprazole', 'Healthcare Pharmaceuticals', '20 mg', 70, '10 capsules (1 strip)'],
  ['Nexum 20 mg', 'esomeprazole', 'Square Pharmaceuticals', '20 mg', 70, '10 capsules (1 strip)'],
  ['Maxpro 20 mg', 'esomeprazole', 'Renata Limited', '20 mg', 70, '10 capsules (1 strip)'],
  ['Pantonix 20 mg', 'pantoprazole', 'Incepta Pharmaceuticals', '20 mg', 70, '10 tablets (1 strip)'],
  ['Trupan 20 mg', 'pantoprazole', 'Square Pharmaceuticals', '20 mg', 60, '10 tablets (1 strip)'],
  ['Finix 20 mg', 'rabeprazole', 'Opsonin Pharma', '20 mg', 70, '10 tablets (1 strip)'],
  ['Famotack 20 mg', 'famotidine', 'Square Pharmaceuticals', '20 mg', 25, '10 tablets (1 strip)'],
  ['Antacid Plus Suspension', 'antacid', 'Square Pharmaceuticals', '250 mg + 400 mg/5 mL', 80, '200 mL bottle'],
  ['Motigut 10 mg', 'domperidone', 'Square Pharmaceuticals', '10 mg', 30, '10 tablets (1 strip)'],
  ['Omidon 10 mg', 'domperidone', 'Incepta Pharmaceuticals', '10 mg', 25, '10 tablets (1 strip)'],
  ['Emistat 8 mg', 'ondansetron', 'Incepta Pharmaceuticals', '8 mg', 120, '10 tablets (1 strip)'],
  ['Orsaline-N', 'ors', 'SMC Enterprise', '10.25 g', 6, '1 sachet'],
  ['Zinc B Syrup', 'zinc', 'Square Pharmaceuticals', '20 mg/5 mL', 45, '100 mL bottle'],
  ['Filmet 400 mg', 'metronidazole', 'Beximco Pharmaceuticals', '400 mg', 20, '10 tablets (1 strip)'],
  ['Amodis 400 mg', 'metronidazole', 'Square Pharmaceuticals', '400 mg', 20, '10 tablets (1 strip)'],
  ['Imotil 2 mg', 'loperamide', 'Square Pharmaceuticals', '2 mg', 20, '10 capsules (1 strip)'],
  ['Avolac Syrup', 'lactulose', 'Aristopharma', '3.35 g/5 mL', 200, '100 mL bottle'],

  // Antibiotics
  ['Moxacil 500 mg', 'amoxicillin', 'Square Pharmaceuticals', '500 mg', 90, '10 capsules (1 strip)'],
  ['Tycil 500 mg', 'amoxicillin', 'Beximco Pharmaceuticals', '500 mg', 85, '10 capsules (1 strip)'],
  ['Moxacil Suspension', 'amoxicillinSusp', 'Square Pharmaceuticals', '125 mg/5 mL', 70, '100 mL bottle'],
  ['Moxaclav 625 mg', 'coAmoxiclav', 'Square Pharmaceuticals', '500 mg + 125 mg', 300, '10 tablets (1 strip)'],
  ['Fimoxyclav 625 mg', 'coAmoxiclav', 'Beximco Pharmaceuticals', '500 mg + 125 mg', 280, '10 tablets (1 strip)'],
  ['Zimax 500 mg', 'azithromycin', 'Square Pharmaceuticals', '500 mg', 120, '3 tablets (1 strip)'],
  ['Azithrocin 500 mg', 'azithromycin', 'Beximco Pharmaceuticals', '500 mg', 120, '3 tablets (1 strip)'],
  ['Zithrin 500 mg', 'azithromycin', 'Renata Limited', '500 mg', 110, '3 tablets (1 strip)'],
  ['Zimax Suspension', 'azithromycinSusp', 'Square Pharmaceuticals', '200 mg/5 mL', 120, '15 mL bottle'],
  ['Cef-3 200 mg', 'cefixime', 'Square Pharmaceuticals', '200 mg', 350, '10 capsules (1 strip)'],
  ['Emixef 200 mg', 'cefixime', 'Eskayef Pharmaceuticals', '200 mg', 340, '10 capsules (1 strip)'],
  ['Kilbac 500 mg', 'cefuroxime', 'Incepta Pharmaceuticals', '500 mg', 500, '10 tablets (1 strip)'],
  ['Cefotil 500 mg', 'cefuroxime', 'Square Pharmaceuticals', '500 mg', 500, '10 tablets (1 strip)'],
  ['Ceftron 1 g IV', 'ceftriaxone', 'Square Pharmaceuticals', '1 g', 220, '1 vial'],
  ['Ciprocin 500 mg', 'ciprofloxacin', 'Square Pharmaceuticals', '500 mg', 150, '10 tablets (1 strip)'],
  ['Neofloxin 500 mg', 'ciprofloxacin', 'Beximco Pharmaceuticals', '500 mg', 140, '10 tablets (1 strip)'],
  ['Levox 500 mg', 'levofloxacin', 'Square Pharmaceuticals', '500 mg', 150, '10 tablets (1 strip)'],
  ['Doxicap 100 mg', 'doxycycline', 'Square Pharmaceuticals', '100 mg', 30, '10 capsules (1 strip)'],
  ['Fluclox 500 mg', 'flucloxacillin', 'Square Pharmaceuticals', '500 mg', 100, '10 capsules (1 strip)'],
  ['Nitrofurantoin 100 mg', 'nitrofurantoin', 'Incepta Pharmaceuticals', '100 mg', 80, '10 capsules (1 strip)'],

  // Antifungal & skin
  ['Flugal 150 mg', 'fluconazole', 'Square Pharmaceuticals', '150 mg', 30, '1 capsule'],
  ['Neofen Cream', 'clotrimazole', 'Beximco Pharmaceuticals', '1%', 45, '10 g tube'],
  ['Ketocon Cream', 'ketoconazole', 'Incepta Pharmaceuticals', '2%', 70, '15 g tube'],
  ['Terbin Cream', 'terbinafine', 'Opsonin Pharma', '1%', 80, '10 g tube'],
  ['Fusid Cream', 'fusidicAcid', 'Square Pharmaceuticals', '2%', 150, '10 g tube'],
  ['Mupin Ointment', 'mupirocin', 'Beximco Pharmaceuticals', '2%', 170, '10 g tube'],
  ['Betnovate Cream', 'betamethasone', 'GlaxoSmithKline Bangladesh', '0.1%', 60, '15 g tube'],
  ['Scabex Cream', 'permethrin', 'Incepta Pharmaceuticals', '5%', 100, '30 g tube'],

  // Allergy & respiratory
  ['Alatrol 10 mg', 'cetirizine', 'Square Pharmaceuticals', '10 mg', 30, '10 tablets (1 strip)'],
  ['Cetrizin 10 mg', 'cetirizine', 'Opsonin Pharma', '10 mg', 25, '10 tablets (1 strip)'],
  ['Xyzal 5 mg', 'levocetirizine', 'UCB / Beximco', '5 mg', 60, '10 tablets (1 strip)'],
  ['Fexo 120 mg', 'fexofenadine', 'Square Pharmaceuticals', '120 mg', 90, '10 tablets (1 strip)'],
  ['Telfast 120 mg', 'fexofenadine', 'Sanofi Bangladesh', '120 mg', 110, '10 tablets (1 strip)'],
  ['Loratin 10 mg', 'loratadine', 'Square Pharmaceuticals', '10 mg', 35, '10 tablets (1 strip)'],
  ['Deslor 5 mg', 'desloratadine', 'Incepta Pharmaceuticals', '5 mg', 50, '10 tablets (1 strip)'],
  ['Histacin Syrup', 'chlorpheniramine', 'Jayson Pharmaceuticals', '2 mg/5 mL', 25, '100 mL bottle'],
  ['Monas 10 mg', 'montelukast', 'ACME Laboratories', '10 mg', 160, '10 tablets (1 strip)'],
  ['Montair 10 mg', 'montelukast', 'Incepta Pharmaceuticals', '10 mg', 160, '10 tablets (1 strip)'],
  ['Azmasol Inhaler', 'salbutamolInh', 'Beximco Pharmaceuticals', '100 mcg/puff', 200, '200 puffs'],
  ['Sulprex Syrup', 'salbutamolSyrup', 'Square Pharmaceuticals', '2 mg/5 mL', 30, '100 mL bottle'],
  ['Ticamet 250 Inhaler', 'fluticasoneSalmeterol', 'Beximco Pharmaceuticals', '25 mcg + 250 mcg/puff', 650, '120 puffs'],
  ['Flonasyl Nasal Spray', 'fluticasoneNasal', 'Square Pharmaceuticals', '50 mcg/spray', 250, '120 sprays'],
  ['Antazol Nasal Drops', 'xylometazoline', 'ACME Laboratories', '0.1%', 25, '15 mL bottle'],
  ['Ambrox Syrup', 'ambroxol', 'Square Pharmaceuticals', '15 mg/5 mL', 70, '100 mL bottle'],
  ['Tusca Plus Syrup', 'dextromethorphan', 'Square Pharmaceuticals', '10 mg + 30 mg + 1.25 mg/5 mL', 80, '100 mL bottle'],
  ['Basok Syrup', 'adhatoda', 'Square Pharmaceuticals (Herbal)', '3.5 mL/5 mL', 90, '100 mL bottle'],

  // Heart & blood pressure
  ['Amdocal 5 mg', 'amlodipine', 'Beximco Pharmaceuticals', '5 mg', 80, '14 tablets (1 strip)'],
  ['Camlodin 5 mg', 'amlodipine', 'Square Pharmaceuticals', '5 mg', 70, '14 tablets (1 strip)'],
  ['Angilock 50 mg', 'losartan', 'Square Pharmaceuticals', '50 mg', 100, '10 tablets (1 strip)'],
  ['Osartil 50 mg', 'losartan', 'Incepta Pharmaceuticals', '50 mg', 100, '10 tablets (1 strip)'],
  ['Amdocal Plus 50', 'amlodipineLosartan', 'Beximco Pharmaceuticals', '5 mg + 50 mg', 140, '10 tablets (1 strip)'],
  ['Bisocor 5 mg', 'bisoprolol', 'Beximco Pharmaceuticals', '5 mg', 80, '10 tablets (1 strip)'],
  ['Tenoren 50 mg', 'atenolol', 'ACME Laboratories', '50 mg', 30, '14 tablets (1 strip)'],
  ['Telmicard 40 mg', 'telmisartan', 'Healthcare Pharmaceuticals', '40 mg', 100, '10 tablets (1 strip)'],
  ['Atova 10 mg', 'atorvastatin', 'Beximco Pharmaceuticals', '10 mg', 120, '10 tablets (1 strip)'],
  ['Anzitor 10 mg', 'atorvastatin', 'Square Pharmaceuticals', '10 mg', 110, '10 tablets (1 strip)'],
  ['Rosuva 10 mg', 'rosuvastatin', 'Incepta Pharmaceuticals', '10 mg', 180, '10 tablets (1 strip)'],
  ['Ecosprin 75 mg', 'aspirin', 'ACI Limited', '75 mg', 10, '28 tablets (1 strip)'],
  ['Clopid 75 mg', 'clopidogrel', 'Square Pharmaceuticals', '75 mg', 120, '10 tablets (1 strip)'],
  ['Lasix 40 mg', 'furosemide', 'Sanofi Bangladesh', '40 mg', 12, '10 tablets (1 strip)'],

  // Diabetes & thyroid
  ['Comet 500 mg', 'metformin', 'Square Pharmaceuticals', '500 mg', 40, '10 tablets (1 strip)'],
  ['Informet 500 mg', 'metformin', 'Incepta Pharmaceuticals', '500 mg', 35, '10 tablets (1 strip)'],
  ['Diamicron MR 30 mg', 'gliclazide', 'Servier Bangladesh', '30 mg', 120, '10 tablets (1 strip)'],
  ['Secrin 2 mg', 'glimepiride', 'Healthcare Pharmaceuticals', '2 mg', 100, '10 tablets (1 strip)'],
  ['Sitagil 50 mg', 'sitagliptin', 'Incepta Pharmaceuticals', '50 mg', 280, '10 tablets (1 strip)'],
  ['Sitagil M 50/500', 'sitagliptinMetformin', 'Incepta Pharmaceuticals', '50 mg + 500 mg', 300, '10 tablets (1 strip)'],
  ['Empa 10 mg', 'empagliflozin', 'Square Pharmaceuticals', '10 mg', 350, '10 tablets (1 strip)'],
  ['Insul 30/70 Penfill', 'insulin', 'Novo Nordisk Bangladesh', '100 IU/mL', 650, '3 mL cartridge'],
  ['Thyrox 50 mcg', 'levothyroxine', 'Square Pharmaceuticals', '50 mcg', 45, '30 tablets (1 container)'],
  ['Deltasone 5 mg', 'prednisolone', 'Opsonin Pharma', '5 mg', 12, '10 tablets (1 strip)'],

  // Vitamins & supplements
  ['Calbo-D', 'calciumD', 'Square Pharmaceuticals', '500 mg + 200 IU', 120, '30 tablets (1 container)'],
  ['Calcin-D', 'calciumD', 'Opsonin Pharma', '500 mg + 200 IU', 110, '30 tablets (1 container)'],
  ['D-Rise 20000 IU', 'vitaminD', 'Beximco Pharmaceuticals', '20000 IU', 280, '4 capsules (1 strip)'],
  ['Ferocap-F', 'ironFolic', 'Square Pharmaceuticals', '150 mg + 0.5 mg', 40, '10 capsules (1 strip)'],
  ['Folison 5 mg', 'folicAcid', 'Square Pharmaceuticals', '5 mg', 25, '30 tablets (1 container)'],
  ['Aristovit-B', 'bComplex', 'Aristopharma', 'B1 + B2 + B6 + B12', 40, '10 tablets (1 strip)'],
  ['Filwel Silver', 'multivitamin', 'Square Pharmaceuticals', 'A–Z', 300, '30 tablets (1 container)'],
  ['Ceevit 250 mg', 'vitaminC', 'Square Pharmaceuticals', '250 mg', 20, '10 tablets (1 strip)'],
  ['Nervex 500 mcg', 'methylcobalamin', 'Beximco Pharmaceuticals', '500 mcg', 80, '10 tablets (1 strip)'],

  // Mental health & neuro
  ['Serenata 50 mg', 'sertraline', 'Square Pharmaceuticals', '50 mg', 100, '10 tablets (1 strip)'],
  ['Estalo 10 mg', 'escitalopram', 'Beximco Pharmaceuticals', '10 mg', 120, '10 tablets (1 strip)'],
  ['Rivotril 0.5 mg', 'clonazepam', 'Roche / Radiant', '0.5 mg', 70, '30 tablets (1 strip)'],
  ['Sibelium 5 mg', 'flunarizine', 'Janssen / ACI', '5 mg', 60, '10 tablets (1 strip)'],
  ['Pregaba 75 mg', 'pregabalin', 'Incepta Pharmaceuticals', '75 mg', 150, '10 capsules (1 strip)'],
  ['Vertina 8 mg', 'betahistine', 'Square Pharmaceuticals', '8 mg', 50, '10 tablets (1 strip)'],

  // Urology, eye & ear, antiparasitic, women's health
  ['Tamsin 0.4 mg', 'tamsulosin', 'Square Pharmaceuticals', '0.4 mg', 120, '10 capsules (1 strip)'],
  ['Urocit-K Syrup', 'potassiumCitrate', 'Square Pharmaceuticals', '1.5 g/5 mL', 150, '200 mL bottle'],
  ['Tobrex Eye Drops', 'tobramycinEye', 'Alcon / Novartis', '0.3%', 150, '5 mL bottle'],
  ['Moxiquin Eye Drops', 'moxifloxacinEye', 'Ibn Sina Pharmaceuticals', '0.5%', 140, '5 mL bottle'],
  ['Refresh Tears', 'artificialTears', 'Allergan / Aristopharma', '0.5%', 280, '10 mL bottle'],
  ['Ciprocin Ear Drops', 'ciprofloxacinEar', 'Square Pharmaceuticals', '0.3%', 45, '10 mL bottle'],
  ['Alben DS 400 mg', 'albendazole', 'Eskayef Pharmaceuticals', '400 mg', 20, '1 tablet'],
  ['Scabo 6 mg', 'ivermectin', 'Incepta Pharmaceuticals', '6 mg', 60, '10 tablets (1 strip)'],
  ['Calcium Magnesium Zinc', 'calMagZinc', 'Square Pharmaceuticals', '600 mg + 40 mg + 15 mg', 200, '30 tablets (1 container)'],
  ['Traxyl 500 mg', 'tranexamic', 'Square Pharmaceuticals', '500 mg', 120, '10 tablets (1 strip)'],
  ['Drotin 40 mg', 'drotaverine', 'Square Pharmaceuticals', '40 mg', 50, '10 tablets (1 strip)'],
];

function infoSections(m: Row, g: Generic): Prisma.InputJsonValue {
  const bullets = (items: string[]) => items.map((text) => ({ text, bullet: true }));
  return [
    { title: 'Uses', blocks: bullets(g.uses) },
    {
      title: 'How to take',
      blocks: [
        { text: `Usual adult dose: ${g.dose}, ${g.frequency}, for ${g.duration}.`, bullet: true },
        { text: g.instruction, bullet: true },
        { text: 'Always follow the dose on your prescription.', bold: true },
      ],
    },
    { title: 'Side effects', blocks: bullets(g.sideEffects) },
    { title: 'Warnings', blocks: bullets(g.warnings) },
    { title: 'Storage', blocks: [{ text: STORAGE_BY_FORM[g.form] }] },
    { title: 'Composition', blocks: [{ text: `${g.generic} ${m[3]} — ${m[2]}.` }] },
  ];
}

function copyImages() {
  const from = join(__dirname, 'seed-assets', 'medicines');
  const to = join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads', 'medicines');
  mkdirSync(to, { recursive: true });
  for (const file of readdirSync(from)) {
    copyFileSync(join(from, file), join(to, file));
  }
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: UserRole.ADMIN }, orderBy: { createdAt: 'asc' } });
  if (!admin) {
    throw new Error('No admin user found. Run npm run db:seed (or db:seed:local) first.');
  }

  copyImages();

  let created = 0;
  let updated = 0;
  for (const row of MEDICINES) {
    const [name, key, company, strength, mrp, packSize] = row;
    const g = G[key];
    const data = {
      name,
      genericName: g.generic,
      category: g.category,
      brand: company,
      medicineType: g.form,
      form: g.form,
      strength,
      mrp,
      packSize,
      description: `${name} contains ${g.generic} (${strength}), made by ${company}. Used for ${g.uses
        .slice(0, 2)
        .join(' and ')
        .toLowerCase()}.`,
      infoSections: infoSections(row, g),
      imageUrl: `/uploads/medicines/${IMAGE_BY_FORM[g.form]}.png`,
      prescriptionRequired: g.rx,
      defaultDose: g.dose,
      defaultFrequency: g.frequency,
      defaultDuration: g.duration,
      defaultInstruction: g.instruction,
      status: MedicineStatus.ACTIVE,
    };

    const existing = await prisma.medicine.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true, imageUrl: true },
    });
    if (existing) {
      // Never replace a real uploaded photo with the generic form image.
      const hasOwnPhoto =
        !!existing.imageUrl && !existing.imageUrl.startsWith('/uploads/medicines/');
      const { imageUrl: _generic, ...withoutImage } = data;
      await prisma.medicine.update({
        where: { id: existing.id },
        data: hasOwnPhoto ? withoutImage : data,
      });
      updated++;
    } else {
      await prisma.medicine.create({
        data: { ...data, source: MedicineSource.ADMIN, createdByUserId: admin.id },
      });
      created++;
    }
  }

  // Older catalogue rows (e.g. from seed-local) have a medicineType but no
  // image; give them the generic image for their form. Own photos are kept.
  const LEGACY_TYPE_IMAGE: Record<string, string> = {
    tablet: 'tablet',
    capsule: 'capsule',
    syrup: 'syrup',
    suspension: 'syrup',
    liquid: 'syrup',
    injection: 'injection',
    cream: 'cream',
    ointment: 'cream',
    gel: 'cream',
    drops: 'drops',
    inhaler: 'inhaler',
    sachet: 'sachet',
  };
  const untouched = await prisma.medicine.findMany({
    where: { imageUrl: null, medicineType: { not: null } },
    select: { id: true, medicineType: true },
  });
  let backfilled = 0;
  for (const m of untouched) {
    const image = LEGACY_TYPE_IMAGE[m.medicineType!.trim().toLowerCase()];
    if (!image) continue;
    await prisma.medicine.update({
      where: { id: m.id },
      data: { imageUrl: `/uploads/medicines/${image}.png` },
    });
    backfilled++;
  }
  console.log(`Images: ${backfilled} older medicines given a generic image.`);

  const total = await prisma.medicine.count({ where: { form: { not: null } } });
  console.log(`Medicines: ${created} created, ${updated} updated (${MEDICINES.length} in seed, ${total} prescribable in DB).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
