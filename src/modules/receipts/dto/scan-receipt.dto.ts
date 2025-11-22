import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsString } from 'class-validator';

export class ScanReceiptDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Receipt image file',
  })
  file: any;

  @ApiProperty({
    required: false,
    description: 'Anchor result to Hedera blockchain',
  })
  @IsOptional()
  @IsBoolean()
  anchorOnHedera?: boolean;

  @ApiProperty({
    required: false,
    description: 'User ID (Firebase UID)',
  })
  @IsOptional()
  @IsString()
  userId?: string;
}
