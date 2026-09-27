import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ReportType } from '@prisma/client';

export class CreateReportDto {
  @ApiProperty({ example: 'Hemoglobin Test' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ enum: ReportType, default: ReportType.LAB })
  @IsOptional()
  @IsEnum(ReportType)
  reportType?: ReportType;

  @ApiPropertyOptional({ example: 'Devcare Lab' })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiProperty({ example: '2026-05-01' })
  @IsDateString()
  reportDate!: string;

  @ApiProperty({ description: 'URL from POST /uploads/report' })
  @IsString()
  @IsNotEmpty()
  fileUrl!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ example: 'Hemoglobin levels are within normal range.' })
  @IsOptional()
  @IsString()
  tip?: string;
}
