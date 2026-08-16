import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

function nextSundayLabel() {
  const now = new Date();
  const day = now.getDay();
  const daysUntilSunday = day === 0 ? 7 : 7 - day;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntilSunday);
  return next.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

@Injectable()
export class VendorsService {
  constructor(private prisma: PrismaService) {}

  private async requireVendor(userId: string) {
    const vendor = await this.prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    return vendor;
  }

  async getDashboard(userId: string) {
    const vendor = await this.prisma.vendorProfile.findUnique({
      where: { userId },
      include: { user: { select: { fullName: true, email: true, phone: true } } },
    });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    const [
      productCount,
      orderCount,
      pendingOrders,
      recentProducts,
      recentOrders,
      revenue,
      documents,
      payoutMethods,
      totalOrders,
      acceptedOrders,
    ] = await Promise.all([
      this.prisma.vendorProduct.count({ where: { ownerUserId: userId } }),
      this.prisma.order.count({ where: { vendorId: vendor.id } }),
      this.prisma.order.count({
        where: { vendorId: vendor.id, status: 'PENDING' },
      }),
      this.prisma.vendorProduct.findMany({
        where: { vendorId: vendor.id },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      this.prisma.order.findMany({
        where: { vendorId: vendor.id },
        include: {
          customer: { select: { fullName: true, phone: true } },
          items: { take: 1 },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.order.aggregate({
        where: { vendorId: vendor.id, paymentStatus: 'PAID' },
        _sum: { total: true },
      }),
      this.prisma.vendorDocument.findMany({
        where: { vendorId: vendor.id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vendorPayoutMethod.findMany({
        where: { vendorId: vendor.id },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.order.count({ where: { vendorId: vendor.id } }),
      this.prisma.order.count({
        where: {
          vendorId: vendor.id,
          status: { in: ['DELIVERED', 'ON_THE_WAY', 'PREPARING', 'CONFIRMED'] },
        },
      }),
    ]);

    const availableBalance = Number(revenue._sum.total ?? 0);
    const acceptanceRate =
      totalOrders > 0 ? Math.round((acceptedOrders / totalOrders) * 100) : 98;

    return {
      vendor,
      stats: {
        productCount,
        orderCount,
        pendingOrders,
        totalRevenue: availableBalance,
      },
      wallet: {
        availableBalance,
        nextPayoutLabel: nextSundayLabel(),
      },
      metrics: {
        rating: 4.8,
        acceptanceRate,
      },
      documents,
      payoutMethods,
      recentProducts,
      recentOrders,
    };
  }

  async listPayments(userId: string) {
    const vendor = await this.prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    return this.prisma.paymentTransaction.findMany({
      where: { order: { vendorId: vendor.id } },
      include: {
        order: {
          select: {
            orderNumber: true,
            customer: { select: { fullName: true } },
            createdAt: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async updateProfile(userId: string, data: Record<string, unknown>) {
    return this.prisma.vendorProfile.update({
      where: { userId },
      data: data as never,
      include: { user: { select: { fullName: true, email: true, phone: true } } },
    });
  }

  async addDocument(
    userId: string,
    payload: { fileName: string; fileUrl: string; mimeType?: string },
  ) {
    const vendor = await this.requireVendor(userId);
    return this.prisma.vendorDocument.create({
      data: {
        vendorId: vendor.id,
        fileName: payload.fileName,
        fileUrl: payload.fileUrl,
        mimeType: payload.mimeType,
      },
    });
  }

  async removeDocument(userId: string, documentId: string) {
    const vendor = await this.requireVendor(userId);
    const doc = await this.prisma.vendorDocument.findFirst({
      where: { id: documentId, vendorId: vendor.id },
    });
    if (!doc) throw new NotFoundException('Document not found');
    await this.prisma.vendorDocument.delete({ where: { id: documentId } });
    return { ok: true };
  }

  async upsertPayoutMethod(
    userId: string,
    payload: {
      id?: string;
      label: string;
      methodType: 'BANK' | 'BKASH' | 'NAGAD';
      accountMasked: string;
      isPrimary?: boolean;
    },
  ) {
    const vendor = await this.requireVendor(userId);
    if (payload.isPrimary) {
      await this.prisma.vendorPayoutMethod.updateMany({
        where: { vendorId: vendor.id },
        data: { isPrimary: false },
      });
    }
    if (payload.id) {
      const existing = await this.prisma.vendorPayoutMethod.findFirst({
        where: { id: payload.id, vendorId: vendor.id },
      });
      if (!existing) throw new NotFoundException('Payout method not found');
      return this.prisma.vendorPayoutMethod.update({
        where: { id: payload.id },
        data: {
          label: payload.label,
          methodType: payload.methodType,
          accountMasked: payload.accountMasked,
          isPrimary: payload.isPrimary ?? existing.isPrimary,
        },
      });
    }
    return this.prisma.vendorPayoutMethod.create({
      data: {
        vendorId: vendor.id,
        label: payload.label,
        methodType: payload.methodType,
        accountMasked: payload.accountMasked,
        isPrimary: payload.isPrimary ?? false,
      },
    });
  }

  async revenueMonthly(userId: string) {
    const vendor = await this.prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    const months: { month: string; revenue: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const from = new Date(date.getFullYear(), date.getMonth(), 1);
      const to = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
      const agg = await this.prisma.order.aggregate({
        where: {
          vendorId: vendor.id,
          paymentStatus: 'PAID',
          createdAt: { gte: from, lte: to },
        },
        _sum: { total: true },
      });
      const label = date.toLocaleString('en-US', { month: 'short' });
      months.push({ month: label, revenue: Number(agg._sum.total ?? 0) });
    }
    return months;
  }

  async ordersMonthly(userId: string) {
    const vendor = await this.prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    const months: { month: string; count: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const from = new Date(date.getFullYear(), date.getMonth(), 1);
      const to = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
      const count = await this.prisma.order.count({
        where: {
          vendorId: vendor.id,
          createdAt: { gte: from, lte: to },
        },
      });
      const label = date.toLocaleString('en-US', { month: 'short' });
      months.push({ month: label, count });
    }
    return months;
  }
}
