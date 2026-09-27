import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { MedicineSource, MedicineStatus, Prisma } from '@prisma/client';

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

  @ApiPropertyOptional({ example: 'Tablet', description: 'Dosage form' })
  @IsOptional()
  @IsString()
  form?: string;

  @ApiPropertyOptional({ example: '500 mg' })
  @IsOptional()
  @IsString()
  strength?: string;

  @ApiPropertyOptional({ example: 12, description: 'Reference retail price (BDT) for one pack' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  mrp?: number;

  @ApiPropertyOptional({ example: '10 tablets (1 strip)' })
  @IsOptional()
  @IsString()
  packSize?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Leaflet sections: [{ title, blocks: [{ text, bullet?, bold? }] }]',
  })
  @IsOptional()
  @IsArray()
  // Without this, implicit conversion turns each section object into an empty array.
  @Type(() => Object)
  infoSections?: Prisma.InputJsonArray;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  prescriptionRequired?: boolean;

  @ApiPropertyOptional({ example: '1 tablet' })
  @IsOptional()
  @IsString()
  defaultDose?: string;

  @ApiPropertyOptional({ example: '1 + 1 + 1' })
  @IsOptional()
  @IsString()
  defaultFrequency?: string;

  @ApiPropertyOptional({ example: '5 days' })
  @IsOptional()
  @IsString()
  defaultDuration?: string;

  @ApiPropertyOptional({ example: 'After meals' })
  @IsOptional()
  @IsString()
  defaultInstruction?: string;
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

  @ApiPropertyOptional({ example: 'Pain & Fever' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'Tablet' })
  @IsOptional()
  @IsString()
  form?: string;
}

export class PrescribableMedicineQueryDto {
  @ApiPropertyOptional({ description: 'Matches brand name or generic name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
