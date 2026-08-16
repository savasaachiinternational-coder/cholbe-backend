import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MedicineSource, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { CreateMedicineDto, MedicineQueryDto, UpdateMedicineDto } from './dto/medicine.dto';

@Injectable()
export class MedicinesService {
  constructor(private prisma: PrismaService) {}

  async createByDoctor(userId: string, dto: CreateMedicineDto) {
    return this.prisma.medicine.create({
      data: {
        ...dto,
        source: MedicineSource.DOCTOR,
        createdByUserId: userId,
      },
    });
  }

  async createByAdmin(userId: string, dto: CreateMedicineDto) {
    return this.prisma.medicine.create({
      data: {
        ...dto,
        source: MedicineSource.ADMIN,
        createdByUserId: userId,
      },
    });
  }

  async findAll(query: MedicineQueryDto) {
    return this.prisma.medicine.findMany({
      where: {
        ...(query.source ? { source: query.source } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { genericName: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        createdBy: { select: { id: true, fullName: true, role: true } },
        _count: { select: { vendorProducts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const medicine = await this.prisma.medicine.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true, role: true } },
        vendorProducts: {
          where: { isActive: true },
          include: { vendor: { select: { pharmacyName: true } } },
        },
      },
    });
    if (!medicine) throw new NotFoundException('Medicine not found');
    return medicine;
  }

  async update(id: string, userId: string, role: UserRole, dto: UpdateMedicineDto) {
    const medicine = await this.findOne(id);
    if (role === UserRole.DOCTOR && medicine.createdByUserId !== userId) {
      throw new ForbiddenException('You can only edit medicines you created');
    }
    return this.prisma.medicine.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    const medicine = await this.prisma.medicine.findUnique({ where: { id } });
    if (!medicine) throw new NotFoundException('Medicine not found');
    await this.prisma.medicine.delete({ where: { id } });
    return { deleted: true };
  }
}
