import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { CreateReportDto } from './dto/report.dto';
import { UpdateReportDto } from './dto/update-report.dto';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async create(patientId: string, dto: CreateReportDto) {
    return this.prisma.healthReport.create({
      data: {
        patientId,
        title: dto.title,
        reportType: dto.reportType ?? 'LAB',
        provider: dto.provider,
        reportDate: new Date(dto.reportDate),
        fileUrl: dto.fileUrl,
        fileName: dto.fileName,
        mimeType: dto.mimeType,
        tip: dto.tip,
      },
    });
  }

  async findAll(patientId: string) {
    return this.prisma.healthReport.findMany({
      where: { patientId },
      orderBy: { reportDate: 'desc' },
    });
  }

  async findOne(patientId: string, id: string) {
    const report = await this.prisma.healthReport.findFirst({
      where: { id, patientId },
    });
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  async update(patientId: string, id: string, dto: UpdateReportDto) {
    await this.findOne(patientId, id);
    return this.prisma.healthReport.update({
      where: { id },
      data: {
        title: dto.title,
        reportType: dto.reportType,
        provider: dto.provider,
        reportDate: dto.reportDate ? new Date(dto.reportDate) : undefined,
        tip: dto.tip,
      },
    });
  }

  async remove(patientId: string, id: string) {
    await this.findOne(patientId, id);
    await this.prisma.healthReport.delete({ where: { id } });
    return { deleted: true };
  }
}
