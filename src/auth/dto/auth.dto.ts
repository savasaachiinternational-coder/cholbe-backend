import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { OtpChannel, UserRole, UserStatus } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'Rayhan Ullah' })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiProperty({ example: 'rayhan@gmail.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: '01677589448' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ minLength: 8, example: 'Password123!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.CUSTOMER })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class LoginDto {
  @ApiProperty({ description: 'Email or phone number', example: 'rayhan@gmail.com' })
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class SendOtpDto {
  @ApiProperty({ example: 'rayhan@gmail.com' })
  @IsString()
  @IsNotEmpty()
  contact!: string;

  @ApiProperty({ enum: OtpChannel, example: OtpChannel.EMAIL })
  @IsEnum(OtpChannel)
  channel!: OtpChannel;
}

export class VerifyOtpDto {
  @ApiProperty({ example: 'rayhan@gmail.com' })
  @IsString()
  contact!: string;

  @ApiProperty({ example: '12345' })
  @IsString()
  code!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'rayhan@gmail.com' })
  @IsString()
  contact!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'rayhan@gmail.com' })
  @IsString()
  contact!: string;

  @ApiProperty({ example: '12345' })
  @IsString()
  code!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class PatientOnboardingDto {
  @ApiPropertyOptional({ example: 28 })
  @IsOptional()
  @IsInt()
  age?: number;

  @ApiPropertyOptional({ example: 'Male' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ example: 'Personal health tracking' })
  @IsOptional()
  @IsString()
  usagePurpose?: string;
}

export class MedicalHistoryDto {
  @ApiPropertyOptional({ type: [String], example: ['Diabetes', 'Hypertension'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  conditions?: string[];

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @IsString()
  mealBreakfast?: string;

  @ApiPropertyOptional({ example: '13:00' })
  @IsOptional()
  @IsString()
  mealLunch?: string;

  @ApiPropertyOptional({ example: '20:00' })
  @IsOptional()
  @IsString()
  mealDinner?: string;
}

export class ListUsersQueryDto {
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class PublicUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiPropertyOptional()
  email!: string | null;

  @ApiPropertyOptional()
  phone!: string | null;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiPropertyOptional()
  avatarUrl!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  user!: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    role: UserRole;
    status: string;
  };
}
