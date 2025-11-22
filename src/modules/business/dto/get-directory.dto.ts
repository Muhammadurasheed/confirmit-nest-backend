import { IsString, IsOptional, IsBoolean, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class GetDirectoryDto {
  @ApiProperty({
    description: 'Search query for business name',
    required: false,
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiProperty({
    description: 'Filter by category',
    required: false,
  })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({
    description: 'Minimum trust score filter',
    required: false,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  minTrustScore?: number;

  @ApiProperty({
    description: 'Show only verified businesses',
    required: false,
  })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  verifiedOnly?: boolean;

  @ApiProperty({
    description: 'Filter by tier (1: Basic, 2: Verified, 3: Premium)',
    required: false,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(3)
  tier?: number;

  @ApiProperty({
    description: 'Page number for pagination',
    required: false,
    default: 1,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: 'Number of results per page',
    required: false,
    default: 12,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  limit?: number = 12;
}
