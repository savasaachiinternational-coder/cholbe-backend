import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { extname, join, resolve, sep } from 'path';

const IMAGE_SIGNATURES: { mime: string; ext: string; magic: number[] }[] = [
  { mime: 'image/png', ext: '.png', magic: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', ext: '.jpg', magic: [0xff, 0xd8, 0xff] },
];
const PDF_MAGIC = Buffer.from('%PDF-');

/**
 * Private storage for issued prescription PDFs and doctor signatures.
 * Lives outside the public /uploads static folder: files are only ever served
 * through endpoints that check who is asking.
 */
@Injectable()
export class PrescriptionFilesService {
  private readonly rootDir: string;

  constructor(config: ConfigService) {
    this.rootDir = resolve(process.cwd(), config.get<string>('PRIVATE_STORAGE_DIR', './storage'));
  }

  savePdf(prescriptionId: string, buffer: Buffer): { path: string; size: number } {
    if (!buffer?.length || !buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
      throw new BadRequestException('The file must be a PDF');
    }
    return { path: this.write('prescriptions', `${prescriptionId}.pdf`, buffer), size: buffer.length };
  }

  saveSignature(doctorId: string, buffer: Buffer): string {
    const type = IMAGE_SIGNATURES.find((t) => t.magic.every((b, i) => buffer?.[i] === b));
    if (!type) throw new BadRequestException('Signature must be a PNG or JPEG image');
    return this.write('signatures', `${doctorId}-${randomUUID()}${type.ext}`, buffer);
  }

  /** Freezes the doctor's current signature onto one prescription. */
  copySignatureForPrescription(signaturePath: string, prescriptionId: string): string {
    const dir = join(this.rootDir, 'prescription-signatures');
    mkdirSync(dir, { recursive: true });
    const fileName = `${prescriptionId}${extname(signaturePath) || '.png'}`;
    copyFileSync(this.absolute(signaturePath), join(dir, fileName));
    return `prescription-signatures/${fileName}`;
  }

  /** Absolute path of a stored file, refusing anything outside the storage root. */
  absolute(relativePath: string): string {
    const abs = resolve(this.rootDir, relativePath);
    if (!abs.startsWith(this.rootDir + sep) || !existsSync(abs)) {
      throw new NotFoundException('File not found');
    }
    return abs;
  }

  /** data: URI for embedding a stored image (the signature) into the PDF template. */
  imageDataUri(relativePath: string): string {
    const buffer = readFileSync(this.absolute(relativePath));
    const type = IMAGE_SIGNATURES.find((t) => t.magic.every((b, i) => buffer[i] === b));
    return `data:${type?.mime ?? 'image/png'};base64,${buffer.toString('base64')}`;
  }

  private write(folder: string, fileName: string, buffer: Buffer): string {
    const dir = join(this.rootDir, folder);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, fileName), buffer);
    return `${folder}/${fileName}`;
  }
}
