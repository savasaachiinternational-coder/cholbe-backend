import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateAddressDto {
  @ApiProperty({ example: 'Home' })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiPropertyOptional({ example: 'Uttara Sector 12' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiProperty({ example: 'House 12, Road 5, Uttara, Dhaka' })
  @IsString()
  formattedAddress!: string;

  @ApiPropertyOptional({ example: 23.8759 })
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({ example: 90.3795 })
  @IsOptional()
  longitude?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class CreateOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  addressId!: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.COD })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ description: 'Prescription URL for Rx-required items' })
  @IsOptional()
  @IsString()
  prescriptionUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
