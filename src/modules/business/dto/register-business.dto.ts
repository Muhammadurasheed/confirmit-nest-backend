import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsPhoneNumber,
  IsNumber,
  IsObject,
  IsOptional,
  Min,
  Max,
} from 'class-validator';

export class RegisterBusinessDto {
  @ApiProperty({ example: 'Acme Electronics Ltd' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Electronics & Appliances' })
  @IsString()
  category: string;

  @ApiProperty({ example: 'https://cloudinary.com/logo.png', required: false })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiProperty({ example: 'https://www.acmeelectronics.com', required: false })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiProperty({ example: 'https://www.linkedin.com/company/acme', required: false })
  @IsOptional()
  @IsString()
  linkedin?: string;

  @ApiProperty({ example: 'We are a leading electronics retailer...', required: false })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiProperty({ example: 'contact@acme.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+2348012345678' })
  @IsString()
  phone: string;

  @ApiProperty({ example: '123 Commerce Street, Victoria Island, Lagos' })
  @IsString()
  address: string;

  @ApiProperty({ example: '0123456789' })
  @IsString()
  accountNumber: string;

  @ApiProperty({ example: '058' })
  @IsString()
  bankCode: string;

  @ApiProperty({ example: 'ACME ELECTRONICS LIMITED' })
  @IsString()
  accountName: string;

  @ApiProperty({ example: 2, description: '1=Basic, 2=Verified, 3=Premium' })
  @IsNumber()
  @Min(1)
  @Max(3)
  tier: number;

  @ApiProperty({
    example: {
      cacCertificate: 'https://cloudinary.com/...',
      governmentId: 'https://cloudinary.com/...',
    },
    required: false,
  })
  @IsOptional()
  @IsObject()
  documents?: {
    cacCertificate?: string;
    governmentId?: string;
    proofOfAddress?: string;
    bankStatement?: string;
  };

  @ApiProperty({ example: 'user_123', required: false })
  @IsOptional()
  @IsString()
  userId?: string;
}
