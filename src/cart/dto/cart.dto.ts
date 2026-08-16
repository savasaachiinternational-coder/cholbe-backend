import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductVariant } from '@prisma/client';

export class AddCartItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  vendorProductId!: string;

  @ApiPropertyOptional({ enum: ProductVariant, default: ProductVariant.PC })
  @IsOptional()
  @IsEnum(ProductVariant)
  variant?: ProductVariant;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class UpdateCartItemDto {
  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}
