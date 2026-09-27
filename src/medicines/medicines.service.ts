import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MedicineSource, MedicineStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import {
  CreateMedicineDto,
  MedicineQueryDto,
  PrescribableMedicineQueryDto,
  UpdateMedicineDto,
} from './dto/medicine.dto';

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
        ...(query.category ? { category: { equals: query.category, mode: 'insensitive' } } : {}),
        ...(query.form ? { form: { equals: query.form, mode: 'insensitive' } } : {}),
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

  /**
   * Catalogue for the doctor's prescription picker: active medicines that have
   * a dosage form, with their prescribing defaults. Prices are left out on purpose.
   */
  async findPrescribable(query: PrescribableMedicineQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.MedicineWhereInput = {
      status: MedicineStatus.ACTIVE,
      form: { not: null },
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { genericName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.medicine.findMany({
      where,
      select: {
        id: true,
        name: true,
        genericName: true,
        form: true,
        strength: true,
        defaultDose: true,
        defaultFrequency: true,
        defaultDuration: true,
        defaultInstruction: true,
      },
      orderBy: { name: 'asc' },
      take: query.limit ?? 50,
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
