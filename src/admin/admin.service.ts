import { Injectable } from '@nestjs/common';
import {
  OrderStatus,
  PaymentStatus,
  UserRole,
  UserStatus,
  VendorApprovalStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { VendorProductsService } from '../vendor-products/vendor-products.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { formatAppointmentDateBd } from '../common/utils/bd-time.util';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private vendorProducts: VendorProductsService,
    private usersService: UsersService,
    private notifications: NotificationsService,
  ) {}

  async dashboard() {
    const [totalOrders, totalUsers, totalVendors, revenue] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.user.count({ where: { role: UserRole.CUSTOMER } }),
      this.prisma.vendorProfile.count({ where: { approvalStatus: 'APPROVED' } }),
      this.prisma.order.aggregate({ _sum: { total: true }, where: { paymentStatus: 'PAID' } }),
    ]);
    return {
      totalOrders,
      totalUsers,
      totalVendors,
      totalRevenue: revenue._sum.total ?? 0,
      growthPercent: 18.6,
    };
  }

  async listOrders(status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: status ? { status } : {},
      include: {
        customer: { select: { fullName: true, phone: true, avatarUrl: true } },
        vendor: { select: { pharmacyName: true } },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listVendors(status?: VendorApprovalStatus) {
    return this.prisma.vendorProfile.findMany({
      where: status ? { approvalStatus: status } : {},
      include: { user: { select: { fullName: true, email: true, phone: true } } },
    });
  }

  async updateVendorStatus(vendorId: string, approvalStatus: VendorApprovalStatus) {
    const result = await this.prisma.vendorProfile.update({
      where: { id: vendorId },
      data: { approvalStatus },
    });

    const vendor = await this.prisma.vendorProfile.findUnique({
      where: { id: vendorId },
      select: { userId: true, pharmacyName: true },
    });
    if (vendor) {
      const statusLabel = approvalStatus === 'APPROVED' ? 'approved' : 'rejected';
      void this.notifications.create(
        vendor.userId,
        'vendor',
        `Application ${approvalStatus === 'APPROVED' ? 'Approved' : 'Rejected'}`,
        `Your pharmacy application has been ${statusLabel}.`,
      );
    }

    return result;
  }

  async listUsers(role?: UserRole, status?: UserStatus) {
    return this.usersService.findAll(role, status);
  }

  async salesReport(from?: string, to?: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        paymentStatus: PaymentStatus.PAID,
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: { items: true },
    });

    const topMedicines = await this.prisma.orderItem.groupBy({
      by: ['name'],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    });

    return {
      totalOrders: orders.length,
      totalRevenue: orders.reduce((s, o) => s + Number(o.total), 0),
      topSellingMedicines: topMedicines.map((m) => ({
        name: m.name,
        quantitySold: m._sum.quantity,
      })),
    };
  }

  async inventoryOverview() {
    const [totalItems, lowStock, outOfStock] = await Promise.all([
      this.prisma.vendorProduct.count({ where: { isActive: true } }),
      this.vendorProducts.getLowStock(),
      this.prisma.vendorProduct.count({ where: { isActive: true, stockQuantity: 0 } }),
    ]);
    return { totalItems, lowStockCount: lowStock.length, outOfStock, lowStockItems: lowStock };
  }

  async listPayments() {
    return this.prisma.paymentTransaction.findMany({
      include: {
        order: {
          select: {
            orderNumber: true,
            customer: { select: { fullName: true } },
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listAppointments(status?: string) {
    return this.prisma.appointment.findMany({
      where: status ? { status } : {},
      include: {
        patient: { select: { fullName: true, phone: true, avatarUrl: true } },
        doctor: {
          include: {
            user: { select: { fullName: true, avatarUrl: true } },
            specialtyRef: true,
          },
        },
        feedback: true,
      },
      orderBy: { scheduledDate: 'desc' },
    });
  }

  async updateAppointmentStatus(id: string, status: string) {
    const appt = await this.prisma.appointment.findUnique({ where: { id } });
    if (!appt) throw new Error('Appointment not found');
    const result = await this.prisma.appointment.update({ where: { id }, data: { status } });

    const apptData = await this.prisma.appointment.findUnique({
      where: { id },
      select: { patientId: true, scheduledDate: true, timeSlot: true },
    });
    if (apptData) {
      void this.notifications.create(
        apptData.patientId,
        'appointment',
        'Appointment Status Updated',
        `Your appointment on ${formatAppointmentDateBd(apptData.scheduledDate)} at ${apptData.timeSlot} is now ${status}.`,
      );
    }

    return result;
  }

  async listReviews(doctorId?: string) {
    return this.prisma.consultationFeedback.findMany({
      where: doctorId ? { doctorId } : {},
      include: {
        appointment: {
          include: {
            patient: { select: { fullName: true, avatarUrl: true } },
            doctor: { include: { user: { select: { fullName: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteReview(id: string) {
    const review = await this.prisma.consultationFeedback.findUnique({ where: { id } });
    if (!review) throw new Error('Review not found');
    await this.prisma.consultationFeedback.delete({ where: { id } });
    return { deleted: true };
  }

  async getOrder(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: { select: { fullName: true, phone: true, email: true, avatarUrl: true } },
        vendor: { select: { pharmacyName: true, phone: true } },
        items: true,
        statusEvents: { orderBy: { createdAt: 'asc' } },
        payment: true,
      },
    });
  }

  async updateOrderStatus(id: string, status: OrderStatus) {
    const result = await this.prisma.order.update({
      where: { id },
      data: {
        status,
        statusEvents: { create: { status, note: `Status updated to ${status}` } },
      },
    });

    const ord = await this.prisma.order.findUnique({
      where: { id },
      select: { customerId: true, orderNumber: true },
    });
    if (ord) {
      void this.notifications.create(
        ord.customerId,
        'order',
        'Order Status Updated',
        `Your order #${ord.orderNumber} is now ${status.toLowerCase().replace(/_/g, ' ')}.`,
      );
    }

    return result;
  }

  async ordersMonthly() {
    const now = new Date();
    const months: { month: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const from = new Date(d.getFullYear(), d.getMonth(), 1);
      const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const count = await this.prisma.order.count({
        where: { createdAt: { gte: from, lte: to } },
      });
      months.push({
        month: d.toLocaleString('default', { month: 'short' }),
        count,
      });
    }
    return months;
  }
}
