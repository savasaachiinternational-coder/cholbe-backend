import { randomInt } from 'crypto';
import { UserRole } from '@prisma/client';

export function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomInt(36 ** 4).toString(36).padStart(4, '0').toUpperCase();
  return `#RK${ts}${rand}`;
}

/** 5-digit OTP from a cryptographically secure source. */
export function generateOtpCode(): string {
  return randomInt(10000, 100000).toString();
}

export const ROLE_LABELS: Record<UserRole, string> = {
  CUSTOMER: 'Customer',
  VENDOR: 'Vendor',
  ADMIN: 'Admin',
  DOCTOR: 'Doctor',
};
