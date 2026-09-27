import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join, normalize, resolve, sep } from 'path';

export type UploadCategory =
  | 'reports'
  | 'prescriptions'
  | 'products'
  | 'avatars'
  | 'chat'
  | 'vendor-docs';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const DOCUMENT_TYPES = [...IMAGE_TYPES, 'application/pdf'];

export const ALLOWED_MIME_TYPES: Record<UploadCategory, string[]> = {
  reports: DOCUMENT_TYPES,
  prescriptions: [...DOCUMENT_TYPES, 'text/plain'],
  products: IMAGE_TYPES,
  avatars: IMAGE_TYPES,
  chat: DOCUMENT_TYPES,
  'vendor-docs': DOCUMENT_TYPES,
};

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
};

@Injectable()
export class UploadsService {
  private readonly rootDir: string;
  readonly maxFileSizeBytes: number;

  constructor(config: ConfigService) {
    this.rootDir = resolve(process.cwd(), config.get<string>('UPLOAD_DIR', './uploads'));
    this.maxFileSizeBytes = Number(config.get('MAX_FILE_SIZE_MB', 10)) * 1024 * 1024;
  }

  /** Stores an uploaded file under uploads/<category>/ and returns its public URL. */
  save(category: UploadCategory, file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('A non-empty "file" field is required');
    }
    const mimeType = file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype;
    if (!ALLOWED_MIME_TYPES[category].includes(mimeType)) {
      throw new BadRequestException(`File type ${mimeType} is not allowed here`);
    }

    const dir = join(this.rootDir, category);
    mkdirSync(dir, { recursive: true });
    const ext = EXTENSION_BY_MIME[mimeType] ?? (extname(file.originalname).toLowerCase() || '');
    const storedName = `${Date.now()}-${randomUUID()}${ext}`;
    writeFileSync(join(dir, storedName), file.buffer);

    return {
      fileUrl: `/uploads/${category}/${storedName}`,
      fileName: file.originalname || storedName,
      mimeType,
      size: file.size,
    };
  }

  /** Maps a /uploads/... URL (relative or absolute) to its file on disk, refusing paths outside the upload dir. */
  resolveUploadedPath(fileUrl: string): string {
    const pathname = fileUrl.startsWith('http') ? new URL(fileUrl).pathname : fileUrl;
    const marker = '/uploads/';
    const index = pathname.indexOf(marker);
    if (index === -1) throw new BadRequestException('fileUrl must point to an uploaded file');

    const relative = decodeURIComponent(pathname.slice(index + marker.length));
    const absolute = resolve(this.rootDir, normalize(relative));
    if (!absolute.startsWith(this.rootDir + sep)) {
      throw new BadRequestException('Invalid file path');
    }
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
      throw new NotFoundException('Uploaded file not found');
    }
    return absolute;
  }

  /**
   * Text used by prescription extraction: the file name, plus the file's contents for plain-text uploads.
   * Images and PDFs contribute only their name (no OCR).
   */
  readUploadedTextHint(fileUrl: string, fileName?: string): string {
    const parts = [fileName ?? '', fileUrl.split('/').pop() ?? ''];
    try {
      const path = this.resolveUploadedPath(fileUrl);
      if (extname(path).toLowerCase() === '.txt') {
        parts.push(readFileSync(path, 'utf8').slice(0, 20_000));
      }
    } catch {
      // Missing or unreadable file — fall back to the name-based hint.
    }
    return parts.filter(Boolean).join('\n');
  }
}
