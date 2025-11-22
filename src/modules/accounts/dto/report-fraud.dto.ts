import { IsString, IsNotEmpty, IsOptional, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReportFraudDto {
  @ApiProperty({
    description: 'Account number being reported',
    example: '0123456789',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(10)
  accountNumber: string;

  @ApiProperty({
    description: 'Optional business name associated with account',
    example: 'ABC Electronics',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  businessName?: string;

  @ApiProperty({
    description: 'Fraud category',
    example: 'Non-delivery of goods',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category: string;

  @ApiProperty({
    description: 'Detailed description of the fraud',
    example: 'I paid for a laptop but never received it. The seller blocked me after payment.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(2000)
  description: string;

  @ApiProperty({
    description: 'Reporter user ID (optional, from auth)',
    required: false,
  })
  @IsString()
  @IsOptional()
  reporterId?: string;
}
