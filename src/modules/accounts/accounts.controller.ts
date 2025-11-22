import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { ResolveAccountDto } from './dto/resolve-account.dto';
import { ReportFraudDto } from './dto/report-fraud.dto';
import { GetFraudReportsDto } from './dto/get-fraud-reports.dto';

import { IsString, IsNotEmpty, IsOptional, Length } from 'class-validator';

class CheckAccountDto {
  @IsString()
  @IsNotEmpty({ message: 'Account number is required' })
  @Length(10, 10, { message: 'Account number must be exactly 10 digits' })
  account_number: string;

  @IsString()
  @IsOptional()
  bank_code?: string;

  @IsString()
  @IsOptional()
  business_name?: string;
}

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post('check')
  @ApiOperation({ summary: 'Check account trustworthiness and fraud reports' })
  async checkAccount(@Body() dto: CheckAccountDto) {
    return this.accountsService.checkAccount(
      dto.account_number,
      dto.bank_code,
      dto.business_name,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get account details by account ID' })
  async getAccount(@Param('id') id: string) {
    return this.accountsService.getAccount(id);
  }

  @Post('report-fraud')
  @ApiOperation({ summary: 'Report fraudulent account activity' })
  async reportFraud(@Body() dto: ReportFraudDto) {
    return this.accountsService.reportFraud(
      dto.accountNumber,
      dto.businessName,
      dto.category,
      dto.description,
      dto.reporterId,
    );
  }

  @Post('fraud-reports')
  @ApiOperation({ summary: 'Get fraud reports for an account (anonymized)' })
  async getFraudReports(@Body() dto: GetFraudReportsDto) {
    return this.accountsService.getFraudReports(dto.accountNumber);
  }

  @Post('resolve')
  @ApiOperation({ summary: 'Resolve account name from account number and bank code using Paystack' })
  async resolveAccount(@Body() dto: ResolveAccountDto) {
    return this.accountsService.resolveAccount(
      dto.accountNumber,
      dto.bankCode,
    );
  }
}
