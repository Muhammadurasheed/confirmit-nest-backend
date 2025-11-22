import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetFraudReportsDto {
  @ApiProperty({
    description: 'Account number to get fraud reports for',
    example: '0123456789',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(10)
  accountNumber: string;
}
