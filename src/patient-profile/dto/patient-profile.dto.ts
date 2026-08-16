import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdatePatientProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  age?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ example: 'O-' })
  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  usagePurpose?: string;
}

export class FamilyMemberDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  age?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiProperty()
  @IsString()
  relationship!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'son@email.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ minLength: 8, description: 'Required when creating a family member account' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

export class EmergencyContactDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  relation!: string;

  @ApiProperty()
  @IsString()
  phone!: string;
}

export class UpdateHealthVitalsDto {
  @ApiPropertyOptional({ example: '120/80' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  bloodPressure?: string;

  @ApiPropertyOptional({ example: '98%' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  oxygen?: string;
}
