import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Length } from 'class-validator';

export class ResolveAccountDto {
  @ApiProperty({
    description: 'Account number to resolve',
    example: '0123456789',
  })
  @IsString()
  @IsNotEmpty()
  @Length(10, 10, { message: 'Account number must be exactly 10 digits' })
  accountNumber: string;

  @ApiProperty({
    description: 'Bank code',
    example: '044',
  })
  @IsString()
  @IsNotEmpty()
  bankCode: string;
}
