import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class ReverseGeocodeQueryDto {
  @ApiProperty({ example: 23.874 })
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 90.3695 })
  @IsLongitude()
  lng!: number;
}

export class StaticMapQueryDto {
  @ApiProperty({ example: 23.874 })
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 90.3695 })
  @IsLongitude()
  lng!: number;

  @ApiPropertyOptional({ example: 14, minimum: 1, maximum: 21 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(21)
  zoom?: number;

  @ApiPropertyOptional({ example: 600, minimum: 1, maximum: 1280 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1280)
  width?: number;

  @ApiPropertyOptional({ example: 240, minimum: 1, maximum: 1280 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1280)
  height?: number;

  @ApiPropertyOptional({ example: 2, minimum: 1, maximum: 2 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(2)
  scale?: number;
}
