import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(role?: UserRole, status?: UserStatus) {
    return this.prisma.user.findMany({
      where: {
        ...(role ? { role } : {}),
        ...(status ? { status } : {}),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        avatarUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateProfile(
    userId: string,
    data: { fullName?: string; phone?: string; avatarUrl?: string },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        avatarUrl: true,
        role: true,
      },
    });
  }

  /**
   * Play Store account-deletion path: remove personal/health data and
   * permanently disable the account (soft-delete / anonymize).
   * Order/appointment history rows are retained without PII on the user.
   */
  async deleteOwnAccount(userId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const stamp = Date.now();
    const scrambledPassword = await bcrypt.hash(randomBytes(32).toString('hex'), 12);

    await this.prisma.$transaction(async (tx) => {
      const patient = await tx.patientProfile.findUnique({ where: { userId } });
      if (patient) {
        await tx.emergencyContact.deleteMany({ where: { patientId: patient.id } });
        await tx.familyMember.deleteMany({ where: { patientId: patient.id } });
        await tx.patientProfile.update({
          where: { id: patient.id },
          data: {
            age: null,
            gender: null,
            bloodGroup: null,
            usagePurpose: null,
            conditions: [],
            mealBreakfast: null,
            mealLunch: null,
            mealDinner: null,
          },
        });
      }

      await tx.healthReport.deleteMany({ where: { patientId: userId } });
      await tx.prescription.deleteMany({ where: { patientId: userId } });
      await tx.medicationSchedule.deleteMany({ where: { patientId: userId } });
      await tx.healthVital.deleteMany({ where: { patientId: userId } });
      await tx.address.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.otpCode.deleteMany({ where: { userId } });
      await tx.consultationMessage.deleteMany({ where: { senderId: userId } });

      const cart = await tx.cart.findUnique({ where: { userId } });
      if (cart) {
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        await tx.cart.delete({ where: { id: cart.id } });
      }

      await tx.vendorProfile.updateMany({
        where: { userId },
        data: { phone: null, address: null, bannerUrl: null },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted_${stamp}_${userId.slice(0, 8)}@deleted.invalid`,
          phone: null,
          fullName: 'Deleted User',
          avatarUrl: null,
          passwordHash: scrambledPassword,
          status: UserStatus.BLOCKED,
        },
      });
    });

    return { deleted: true, message: 'Account deleted' };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Current password is incorrect');
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { message: 'Password changed successfully' };
  }

  async updateStatus(userId: string, status: UserStatus) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id: userId },
      data: { status },
      select: { id: true, fullName: true, status: true },
    });
  }

  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.user.delete({ where: { id: userId } });
    return { deleted: true };
  }
}
