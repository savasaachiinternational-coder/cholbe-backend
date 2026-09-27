import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { OrdersService } from '../orders/orders.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';

@Injectable()
export class CartService {
  constructor(
    private prisma: PrismaService,
    private orders: OrdersService,
  ) {}

  private async getOrCreateCart(userId: string) {
    let cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: { vendorProduct: { include: { vendor: true } } },
        },
      },
    });
    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { userId },
        include: {
          items: {
            include: { vendorProduct: { include: { vendor: true } } },
          },
        },
      });
    }
    return cart;
  }

  async getCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);

    // Keep each line at the pharmacy's current price, so the cart total is what
    // checkout will actually charge.
    for (const item of cart.items) {
      const product = item.vendorProduct;
      if (!product) continue;
      const current = product.discountPrice ?? product.unitPrice;
      if (!current.equals(item.unitPrice)) {
        await this.prisma.cartItem.update({ where: { id: item.id }, data: { unitPrice: current } });
        item.unitPrice = current;
      }
    }

    const subtotal = cart.items.reduce(
      (sum, item) => sum + Number(item.unitPrice) * item.quantity,
      0,
    );
    return { ...cart, subtotal, deliveryCharge: this.orders.deliveryCharge() };
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const product = await this.prisma.vendorProduct.findUnique({
      where: { id: dto.vendorProductId },
    });
    if (!product || !product.isActive) throw new NotFoundException('Product not available');
    if (product.stockQuantity < dto.quantity) {
      throw new BadRequestException('Insufficient stock');
    }

    const cart = await this.getOrCreateCart(userId);
    const variant = dto.variant ?? 'PC';
    const unitPrice = product.discountPrice ?? product.unitPrice;

    const existing = cart.items.find(
      (i) => i.vendorProductId === dto.vendorProductId && i.variant === variant,
    );

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + dto.quantity },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          vendorProductId: product.id,
          medicineId: product.medicineId,
          name: product.name,
          variant,
          quantity: dto.quantity,
          unitPrice,
        },
      });
    }

    return this.getCart(userId);
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const cart = await this.getOrCreateCart(userId);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Cart item not found');

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity: dto.quantity },
    });
    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const cart = await this.getOrCreateCart(userId);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Cart item not found');
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return this.getCart(userId);
  }

  async clear(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.getCart(userId);
  }
}
