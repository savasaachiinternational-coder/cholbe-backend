import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MedicineSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import {
  CreateVendorProductDto,
  UpdateVendorProductDto,
  VendorProductQueryDto,
} from './dto/vendor-product.dto';

@Injectable()
export class VendorProductsService {
  constructor(private prisma: PrismaService) {}

  private async getVendorProfile(userId: string) {
    const profile = await this.prisma.vendorProfile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException('Vendor profile not found');
    if (profile.approvalStatus !== 'APPROVED') {
      throw new ForbiddenException('Vendor account is not approved yet');
    }
    return profile;
  }

  async create(userId: string, dto: CreateVendorProductDto) {
    const vendor = await this.getVendorProfile(userId);

    return this.prisma.$transaction(async (tx) => {
      let medicineId = dto.medicineId;

      if (!medicineId) {
        const medicine = await tx.medicine.create({
          data: {
            name: dto.name,
            genericName: dto.genericName,
            category: dto.category,
            brand: dto.brand,
            medicineType: dto.category,
            imageUrl: dto.imageUrl,
            prescriptionRequired: dto.prescriptionRequired ?? false,
            source: MedicineSource.VENDOR,
            createdByUserId: userId,
          },
        });
        medicineId = medicine.id;
      }

      return tx.vendorProduct.create({
        data: {
          vendorId: vendor.id,
          ownerUserId: userId,
          medicineId,
          name: dto.name,
          genericName: dto.genericName,
          category: dto.category,
          brand: dto.brand,
          unitPrice: new Prisma.Decimal(dto.unitPrice),
          discountPrice: dto.discountPrice != null ? new Prisma.Decimal(dto.discountPrice) : null,
          stockQuantity: dto.stockQuantity,
          minAlertLevel: dto.minAlertLevel ?? 10,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          batchNumber: dto.batchNumber,
          unitType: dto.unitType,
          temperature: dto.temperature,
          imageUrl: dto.imageUrl,
          prescriptionRequired: dto.prescriptionRequired ?? false,
          reminderActive: dto.reminderActive ?? true,
        },
        include: { medicine: true },
      });
    });
  }

  async findMine(userId: string, query: VendorProductQueryDto) {
    const vendor = await this.getVendorProfile(userId);
    return this.prisma.vendorProduct.findMany({
      where: {
        vendorId: vendor.id,
        ...(query.activeOnly ? { isActive: true } : {}),
        ...(query.search
          ? { name: { contains: query.search, mode: 'insensitive' } }
          : {}),
        ...(query.category
          ? { category: { equals: query.category, mode: 'insensitive' } }
          : {}),
      },
      include: { medicine: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findShop(query: VendorProductQueryDto) {
    return this.prisma.vendorProduct.findMany({
      where: {
        isActive: true,
        stockQuantity: { gt: 0 },
        vendor: { approvalStatus: 'APPROVED', isStoreOpen: true },
        ...(query.search
          ? { name: { contains: query.search, mode: 'insensitive' } }
          : {}),
        ...(query.category
          ? { category: { equals: query.category, mode: 'insensitive' } }
          : {}),
      },
      include: {
        vendor: { select: { pharmacyName: true, address: true } },
        medicine: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.vendorProduct.findUnique({
      where: { id },
      include: { medicine: true, vendor: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(userId: string, id: string, dto: UpdateVendorProductDto) {
    const vendor = await this.getVendorProfile(userId);
    const product = await this.findOne(id);
    if (product.vendorId !== vendor.id) {
      throw new ForbiddenException('Not your product');
    }

    const { unitPrice, discountPrice, expiryDate, stockQuantity, ...rest } = dto;
    return this.prisma.vendorProduct.update({
      where: { id },
      data: {
        ...rest,
        ...(unitPrice != null ? { unitPrice: new Prisma.Decimal(unitPrice) } : {}),
        ...(discountPrice != null ? { discountPrice: new Prisma.Decimal(discountPrice) } : {}),
        ...(expiryDate != null ? { expiryDate: new Date(expiryDate) } : {}),
        ...(stockQuantity != null ? { stockQuantity } : {}),
      },
    });
  }

  async toggleActive(userId: string, id: string, isActive: boolean) {
    const vendor = await this.getVendorProfile(userId);
    const product = await this.findOne(id);
    if (product.vendorId !== vendor.id) throw new ForbiddenException('Not your product');
    return this.prisma.vendorProduct.update({ where: { id }, data: { isActive } });
  }

  async remove(userId: string, id: string) {
    const vendor = await this.getVendorProfile(userId);
    const product = await this.findOne(id);
    if (product.vendorId !== vendor.id) throw new ForbiddenException('Not your product');
    await this.prisma.vendorProduct.delete({ where: { id } });
    return { deleted: true };
  }

  async getLowStock(vendorUserId?: string) {
    const products = await this.prisma.vendorProduct.findMany({
      where: {
        isActive: true,
        ...(vendorUserId
          ? { ownerUserId: vendorUserId }
          : { vendor: { approvalStatus: 'APPROVED' } }),
      },
    });
    return products.filter((p) => p.stockQuantity <= p.minAlertLevel);
  }
}
