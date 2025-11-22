import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsEnum } from 'class-validator';

export enum PaymentMethod {
  PAYSTACK = 'paystack',
  NOWPAYMENTS = 'nowpayments',
  HEDERA = 'hedera',
}

export class PaymentVerificationDto {
  @ApiProperty({ example: 'BIZ-123ABC' })
  @IsString()
  businessId: string;

  @ApiProperty({ example: 'paystack', enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiProperty({ example: 'ref_xyz123' })
  @IsString()
  paymentReference: string;

  @ApiProperty({ example: 25000 })
  @IsNumber()
  amount: number;

  @ApiProperty({ example: 'NGN' })
  @IsString()
  currency: string;
}
