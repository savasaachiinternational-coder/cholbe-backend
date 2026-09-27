import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { generateOrderNumber } from '../common/utils/helpers';
import { CreateOrderDto } from './dto/order.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { ORDER_STATUS_LABEL, allowedNextStatuses } from './order-status.util';

const DEFAULT_DELIVERY_CHARGE = 30;

/** Who is changing an order: the admin panel or a vendor acting on their own orders. */
export type OrderActor = { role: UserRole; userId: string };

const ORDER_DETAIL_INCLUDE = {
  items: true,
  statusEvents: { orderBy: { createdAt: 'asc' } },
  payment: true,
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private config: ConfigService,
  ) {}

  /** Single source for the delivery fee; the cart reports it so the app never hardcodes it. */
  deliveryCharge(): number {
    const fee = Number(this.config.get('DELIVERY_CHARGE', DEFAULT_DELIVERY_CHARGE));
    return Number.isFinite(fee) && fee >= 0 ? fee : DEFAULT_DELIVERY_CHARGE;
  }

  async checkout(userId: string, dto: CreateOrderDto) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: { items: { include: { vendorProduct: true } } },
    });
    if (!cart?.items.length) throw new BadRequestException('Cart is empty');

    const address = await this.prisma.address.findFirst({
      where: { id: dto.addressId, userId },
    });
    if (!address) throw new NotFoundException('Address not found');

    // Charge today's price, and refuse items that went off sale since they were added.
    const lines = cart.items.map((item) => {
      const product = item.vendorProduct;
      if (!product || !product.isActive) {
        throw new BadRequestException(`${item.name} is no longer available. Remove it from your cart.`);
      }
      const unitPrice = product.discountPrice ?? product.unitPrice;
      return { item, product, unitPrice, lineTotal: Number(unitPrice) * item.quantity };
    });

    const vendorId = lines[0].product.vendorId;
    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const deliveryCharge = this.deliveryCharge();
    const total = subtotal + deliveryCharge;

    const order = await this.prisma.$transaction(async (tx) => {
      // Take stock only if enough is left; the condition makes this safe under
      // concurrent checkouts, and stock can never go negative.
      for (const { item, product } of lines) {
        const { count } = await tx.vendorProduct.updateMany({
          where: { id: product.id, stockQuantity: { gte: item.quantity } },
          data: { stockQuantity: { decrement: item.quantity } },
        });
        if (count === 0) {
          throw new BadRequestException(
            `Only ${product.stockQuantity} of ${item.name} left in stock. Update the quantity in your cart.`,
          );
        }
      }

      const created = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          customerId: userId,
          vendorId,
          addressSnapshot: address as unknown as Prisma.InputJsonValue,
          paymentMethod: dto.paymentMethod,
          // Online payments stay pending until a gateway or an admin confirms them.
          paymentStatus: PaymentStatus.PENDING,
          subtotal: new Prisma.Decimal(subtotal),
          deliveryCharge: new Prisma.Decimal(deliveryCharge),
          total: new Prisma.Decimal(total),
          prescriptionUrl: dto.prescriptionUrl,
          notes: dto.notes,
          status: OrderStatus.PENDING,
          statusEvents: { create: { status: OrderStatus.PENDING, note: 'Order placed' } },
          items: {
            create: lines.map(({ item, unitPrice, lineTotal }) => ({
              vendorProductId: item.vendorProductId,
              medicineId: item.medicineId,
              name: item.name,
              variant: item.variant,
              quantity: item.quantity,
              unitPrice,
              lineTotal: new Prisma.Decimal(lineTotal),
            })),
          },
          payment: {
            create: {
              method: dto.paymentMethod,
              amount: new Prisma.Decimal(total),
              status: PaymentStatus.PENDING,
            },
          },
        },
        include: ORDER_DETAIL_INCLUDE,
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      return created;
    });

    const vendorUserId = await this.vendorUserId(vendorId);
    await this.notifyAll([
      [userId, 'Order Placed', `Your order #${order.orderNumber} has been placed successfully.`],
      [vendorUserId, 'New Order Received', `A new order #${order.orderNumber} has been placed.`],
      ['admins', 'New Order', `Order #${order.orderNumber} was placed by a customer.`],
    ]);

    return order;
  }

  async findMine(userId: string) {
    return this.prisma.order.findMany({
      where: { customerId: userId },
      include: ORDER_DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, customerId: userId },
      include: ORDER_DETAIL_INCLUDE,
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /**
   * The only way an order's status changes. Checks the actor may touch this
   * order and that the move is allowed, then applies its side effects in the
   * same transaction:
   *   - CANCELLED puts the items back into the pharmacy's stock, and marks an
   *     already-paid order REFUNDED (the refund itself is handled by the admin).
   *   - DELIVERED marks a cash-on-delivery order PAID.
   * Finally tells the customer, the vendor and the admins (except whoever acted).
   */
  async changeStatus(orderId: string, next: OrderStatus, actor: OrderActor, note?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, vendor: { select: { userId: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (actor.role === UserRole.VENDOR && order.vendor?.userId !== actor.userId) {
      throw new ForbiddenException('This order belongs to another pharmacy');
    }

    const allowed = allowedNextStatuses(order.status, actor.role);
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        allowed.length
          ? `This order is ${ORDER_STATUS_LABEL[order.status].toLowerCase()}, so it can only move to: ${allowed
              .map((s) => ORDER_STATUS_LABEL[s])
              .join(', ')}.`
          : `This order is ${ORDER_STATUS_LABEL[order.status].toLowerCase()} and can't be changed.`,
      );
    }

    const paymentUpdate =
      next === OrderStatus.DELIVERED && order.paymentMethod === PaymentMethod.COD
        ? PaymentStatus.PAID
        : next === OrderStatus.CANCELLED && order.paymentStatus === PaymentStatus.PAID
          ? PaymentStatus.REFUNDED
          : null;

    await this.prisma.$transaction(async (tx) => {
      // Conditional on the status we checked, so two people acting at once
      // can't both apply a change.
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: order.status },
        data: { status: next, ...(paymentUpdate ? { paymentStatus: paymentUpdate } : {}) },
      });
      if (count === 0) {
        throw new ConflictException('This order was just updated by someone else. Refresh and try again.');
      }
      await tx.orderStatusEvent.create({
        data: { orderId, status: next, note: note?.trim() || this.defaultNote(next, actor.role) },
      });
      if (paymentUpdate) {
        await tx.paymentTransaction.updateMany({ where: { orderId }, data: { status: paymentUpdate } });
      }
      if (next === OrderStatus.CANCELLED) {
        for (const item of order.items) {
          if (!item.vendorProductId) continue;
          await tx.vendorProduct.updateMany({
            where: { id: item.vendorProductId },
            data: { stockQuantity: { increment: item.quantity } },
          });
        }
      }
    });

    const label = ORDER_STATUS_LABEL[next].toLowerCase();
    const who = actor.role === UserRole.ADMIN ? 'Cholbe admin' : 'the pharmacy';
    await this.notifyAll([
      [order.customerId, 'Order Status Updated', `Your order #${order.orderNumber} is now ${label}.`],
      actor.role === UserRole.VENDOR
        ? null
        : [order.vendor?.userId ?? null, 'Order Updated', `Order #${order.orderNumber} was marked ${label} by ${who}.`],
      actor.role === UserRole.ADMIN
        ? null
        : ['admins', 'Order Updated', `Order #${order.orderNumber} was marked ${label} by ${who}.`],
    ]);

    return this.prisma.order.findUnique({ where: { id: orderId }, include: ORDER_DETAIL_INCLUDE });
  }

  /**
   * Admin confirms an online payment was received (until a payment gateway
   * does this automatically). Cash on delivery is marked paid on delivery.
   */
  async markPaid(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('This order is already paid');
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('A cancelled order cannot be marked paid');
    }

    await this.prisma.$transaction([
      this.prisma.order.update({ where: { id: orderId }, data: { paymentStatus: PaymentStatus.PAID } }),
      this.prisma.paymentTransaction.updateMany({ where: { orderId }, data: { status: PaymentStatus.PAID } }),
      this.prisma.orderStatusEvent.create({
        data: { orderId, status: order.status, note: 'Payment received' },
      }),
    ]);
    await this.notifyAll([
      [order.customerId, 'Payment Received', `We received your payment for order #${order.orderNumber}.`],
    ]);
    return this.prisma.order.findUnique({ where: { id: orderId }, include: ORDER_DETAIL_INCLUDE });
  }

  async findVendorOrders(vendorUserId: string, status?: OrderStatus) {
    const vendor = await this.prisma.vendorProfile.findUnique({ where: { userId: vendorUserId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    return this.prisma.order.findMany({
      where: {
        vendorId: vendor.id,
        ...(status ? { status } : {}),
      },
      include: { items: true, customer: { select: { fullName: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findVendorOrder(vendorUserId: string, orderId: string) {
    const vendor = await this.prisma.vendorProfile.findUnique({ where: { userId: vendorUserId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, vendorId: vendor.id },
      include: {
        customer: { select: { fullName: true, phone: true, email: true, avatarUrl: true } },
        items: true,
        statusEvents: { orderBy: { createdAt: 'asc' } },
        payment: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private defaultNote(status: OrderStatus, role: UserRole) {
    const by = role === UserRole.ADMIN ? 'by admin' : 'by pharmacy';
    switch (status) {
      case OrderStatus.CONFIRMED:
        return `Order accepted ${by}`;
      case OrderStatus.PREPARING:
        return 'Pharmacy is preparing your order';
      case OrderStatus.ON_THE_WAY:
        return 'Order is on the way';
      case OrderStatus.DELIVERED:
        return 'Order delivered';
      case OrderStatus.CANCELLED:
        return `Order cancelled ${by}`;
      default:
        return `Status updated ${by}`;
    }
  }

  private async vendorUserId(vendorId: string | null) {
    if (!vendorId) return null;
    const vendor = await this.prisma.vendorProfile.findUnique({
      where: { id: vendorId },
      select: { userId: true },
    });
    return vendor?.userId ?? null;
  }

  /** In-app notifications; a failure is logged and never undoes the order change. */
  private async notifyAll(messages: Array<[string | null, string, string] | null>) {
    await Promise.all(
      messages.map(async (m) => {
        if (!m || !m[0]) return;
        const [to, title, body] = m;
        try {
          if (to === 'admins') await this.notifications.notifyAdmins('order', title, body);
          else await this.notifications.create(to, 'order', title, body);
        } catch (e) {
          this.logger.warn(`Order notification failed: ${e instanceof Error ? e.message : e}`);
        }
      }),
    );
  }
}
