import { UserRole } from '@prisma/client';

export function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `#RK${ts}${rand}`;
}

export function generateOtpCode(): string {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

export const ROLE_LABELS: Record<UserRole, string> = {
  CUSTOMER: 'Customer',
  VENDOR: 'Vendor',
  ADMIN: 'Admin',
  DOCTOR: 'Doctor',
};
