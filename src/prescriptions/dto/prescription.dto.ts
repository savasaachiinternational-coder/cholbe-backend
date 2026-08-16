import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class PrescriptionMedicineDto {
  @ApiProperty({ example: 'Thyrox 50mg' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: '1 tablet' })
  @IsOptional()
  @IsString()
  dose?: string;

  @ApiPropertyOptional({ example: 'morning' })
  @IsOptional()
  @IsString()
  instruction?: string;

  @ApiPropertyOptional({ example: 'before' })
  @IsOptional()
  @IsString()
  mealTiming?: string;

  @ApiPropertyOptional({ example: 'twice_daily' })
  @IsOptional()
  @IsString()
  frequency?: string;

  @ApiPropertyOptional({ type: [String], example: ['08:00 AM', '08:30 PM'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  times?: string[];

  @ApiPropertyOptional({ example: '2025-04-24' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2025-05-24' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  reminderBeforeMinutes?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  followUpMinutes?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  inventoryCount?: number;
}

export class CreatePrescriptionDto {
  @ApiProperty({ description: 'URL from POST /uploads/prescription' })
  @IsString()
  @IsNotEmpty()
  fileUrl!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiPropertyOptional({ example: 'camera' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ type: [PrescriptionMedicineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionMedicineDto)
  medicines?: PrescriptionMedicineDto[];
}

export class ScanPrescriptionDto {
  @ApiProperty({ description: 'URL from POST /uploads/prescription' })
  @IsString()
  @IsNotEmpty()
  fileUrl!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiPropertyOptional({ example: 'camera' })
  @IsOptional()
  @IsString()
  source?: string;
}
