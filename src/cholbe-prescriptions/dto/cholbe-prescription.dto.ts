import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const SHORT = 120;
const LONG = 2000;

export class CholbePrescriptionPatientDto {
  @ApiPropertyOptional({ example: '34' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  age?: string;

  @ApiPropertyOptional({ example: 'Male' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sex?: string;

  @ApiPropertyOptional({ example: '72 kg' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  weight?: string;

  @ApiPropertyOptional({ example: 'B+' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  bloodGroup?: string;

  @ApiPropertyOptional({ example: 'Penicillin' })
  @IsOptional()
  @IsString()
  @MaxLength(SHORT)
  allergies?: string;
}

export class CholbePrescriptionVitalsDto {
  @ApiPropertyOptional({ example: '100.4 °F' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  temperature?: string;

  @ApiPropertyOptional({ example: '118/76' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  bloodPressure?: string;

  @ApiPropertyOptional({ example: '84 bpm' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  pulse?: string;

  @ApiPropertyOptional({ example: '98%' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  spo2?: string;
}

export class CholbePrescriptionItemDto {
  @ApiProperty({ example: 'Omeprazole 20 mg' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(SHORT)
  name!: string;

  @ApiPropertyOptional({ example: 'Omeprazole' })
  @IsOptional()
  @IsString()
  @MaxLength(SHORT)
  genericName?: string;

  @ApiPropertyOptional({ description: 'Medicine catalogue id, when picked from the catalogue' })
  @IsOptional()
  @IsUUID()
  medicineId?: string;

  @ApiPropertyOptional({ example: '1 capsule' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  dose?: string;

  @ApiPropertyOptional({ example: '1 + 0 + 1' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  frequency?: string;

  @ApiPropertyOptional({ example: '7 days' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  duration?: string;

  @ApiPropertyOptional({ example: '30 minutes before breakfast' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  instruction?: string;
}

export class CreateCholbePrescriptionDto {
  @ApiProperty({ description: 'The appointment this prescription is issued for; its patient receives it' })
  @IsUUID()
  appointmentId!: string;

  @ApiPropertyOptional({ type: CholbePrescriptionPatientDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CholbePrescriptionPatientDto)
  patient?: CholbePrescriptionPatientDto;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  chiefComplaints?: string[];

  @ApiPropertyOptional({ type: CholbePrescriptionVitalsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CholbePrescriptionVitalsDto)
  vitals?: CholbePrescriptionVitalsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(LONG)
  diagnosis?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  investigations?: string[];

  @ApiProperty({ type: [CholbePrescriptionItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one medicine' })
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => CholbePrescriptionItemDto)
  items!: CholbePrescriptionItemDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  advice?: string[];

  @ApiPropertyOptional({ example: '2026-10-24', description: 'Follow-up date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({ strict: true })
  followUpDate?: string;
}

export class CancelCholbePrescriptionDto {
  @ApiPropertyOptional({ example: 'Wrong dose — reissued' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ListCholbePrescriptionsQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @ApiPropertyOptional({ enum: ['ISSUED', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['ISSUED', 'CANCELLED'])
  status?: 'ISSUED' | 'CANCELLED';

  @ApiPropertyOptional({ description: 'Search Rx number, patient name or diagnosis' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
