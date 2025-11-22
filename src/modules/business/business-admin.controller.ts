import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BusinessService } from './business.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { Admin } from '../../common/decorators/admin.decorator';

@ApiTags('business-admin')
@Controller('business/admin')
@UseGuards(AuthGuard, AdminGuard)
@ApiBearerAuth()
export class BusinessAdminController {
  constructor(private readonly businessService: BusinessService) {}

  @Get('pending')
  @Admin()
  @ApiOperation({ summary: 'Get all pending businesses for review' })
  async getPendingBusinesses() {
    return this.businessService.getPendingBusinesses();
  }

  @Get('all')
  @Admin()
  @ApiOperation({ summary: 'Get all businesses (admin view)' })
  async getAllBusinesses() {
    return this.businessService.getAllBusinesses();
  }

  @Post('approve/:id')
  @Admin()
  @ApiOperation({ summary: 'Approve business verification and mint NFT' })
  async approveBusiness(
    @Param('id') id: string,
    @Body() body: { approvedBy: string },
  ) {
    return this.businessService.approveVerification(id, body.approvedBy);
  }

  @Post('reject/:id')
  @Admin()
  @ApiOperation({ summary: 'Reject business verification' })
  async rejectBusiness(
    @Param('id') id: string,
    @Body() body: { reason: string; rejectedBy: string },
  ) {
    return this.businessService.rejectVerification(
      id,
      body.reason,
      body.rejectedBy,
    );
  }

  @Post('suspend/:id')
  @Admin()
  @ApiOperation({ summary: 'Suspend business' })
  async suspendBusiness(
    @Param('id') id: string,
    @Body() body: { reason: string; suspendedBy: string },
  ) {
    return this.businessService.suspendBusiness(
      id,
      body.reason,
      body.suspendedBy,
    );
  }

  @Post('delete/:id')
  @Admin()
  @ApiOperation({ summary: 'Permanently delete business' })
  async deleteBusiness(
    @Param('id') id: string,
    @Body() body: { deletedBy: string },
  ) {
    return this.businessService.deleteBusiness(id, body.deletedBy);
  }
}
