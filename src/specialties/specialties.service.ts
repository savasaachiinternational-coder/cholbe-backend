import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class SpecialtiesService {
  constructor(private prisma: PrismaService) {}

  listActive() {
    return this.prisma.specialty.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  listAll() {
    return this.prisma.specialty.findMany({ orderBy: { name: 'asc' } });
  }

  async create(data: { name: string; icon?: string; isActive?: boolean }) {
    const slug = slugify(data.name);
    const existing = await this.prisma.specialty.findFirst({
      where: { OR: [{ name: data.name }, { slug }] },
    });
    if (existing) throw new ConflictException('Specialty already exists');
    return this.prisma.specialty.create({
      data: {
        name: data.name,
        slug,
        icon: data.icon,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(id: string, data: { name?: string; icon?: string; isActive?: boolean }) {
    await this.findOne(id);
    const slug = data.name ? slugify(data.name) : undefined;
    return this.prisma.specialty.update({
      where: { id },
      data: {
        name: data.name,
        slug,
        icon: data.icon,
        isActive: data.isActive,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.specialty.delete({ where: { id } });
    return { deleted: true };
  }

  async findOne(id: string) {
    const item = await this.prisma.specialty.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Specialty not found');
    return item;
  }
}
