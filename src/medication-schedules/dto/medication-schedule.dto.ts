import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateMedicationScheduleDto {
  @ApiProperty({ example: 'Amlodipine' })
  @IsString()
  @IsNotEmpty()
  medicineName!: string;

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

  @ApiPropertyOptional({ type: [String], example: ['08:30 AM'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  times?: string[];

  @ApiPropertyOptional({ example: 'twice_daily' })
  @IsOptional()
  @IsString()
  frequency?: string;

  @ApiPropertyOptional({ example: '2025-10-25' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2025-11-25' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  reminderBeforeMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  followUpEnabled?: boolean;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  followUpMinutes?: number;

  @ApiPropertyOptional({ example: '08:30 AM' })
  @IsOptional()
  @IsString()
  followUpTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  refillEnabled?: boolean;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  inventoryCount?: number;

  @ApiPropertyOptional({ example: '2025-10-25' })
  @IsOptional()
  @IsDateString()
  refillDate?: string;

  @ApiPropertyOptional({ example: '08:30 AM' })
  @IsOptional()
  @IsString()
  refillTime?: string;

  @ApiPropertyOptional({ example: 'Rohima Akter' })
  @IsOptional()
  @IsString()
  caregiverName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  prescriptionId?: string;
}
