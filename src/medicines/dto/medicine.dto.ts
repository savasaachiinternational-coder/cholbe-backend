import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { MedicineSource, MedicineStatus } from '@prisma/client';

export class CreateMedicineDto {
  @ApiProperty({ example: 'Aamdocal Plus 50' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'Amlodipine' })
  @IsOptional()
  @IsString()
  genericName?: string;

  @ApiPropertyOptional({ example: 'Tablet' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'Square' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ example: 'Tablet' })
  @IsOptional()
  @IsString()
  medicineType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  prescriptionRequired?: boolean;
}

export class UpdateMedicineDto extends CreateMedicineDto {
  @ApiPropertyOptional({ enum: MedicineStatus })
  @IsOptional()
  @IsEnum(MedicineStatus)
  status?: MedicineStatus;
}

export class MedicineQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: MedicineSource })
  @IsOptional()
  @IsEnum(MedicineSource)
  source?: MedicineSource;

  @ApiPropertyOptional({ enum: MedicineStatus })
  @IsOptional()
  @IsEnum(MedicineStatus)
  status?: MedicineStatus;
}
