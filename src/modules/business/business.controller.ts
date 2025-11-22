import { Controller, Post, Get, Param, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BusinessService } from './business.service';
import { BusinessPaymentService } from './business-payment.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { GetDirectoryDto } from './dto/get-directory.dto';

@ApiTags('business')
@Controller('business')
export class BusinessController {
  constructor(
    private readonly businessService: BusinessService,
    private readonly businessPaymentService: BusinessPaymentService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register new business' })
  async registerBusiness(@Body() body: any) {
    return this.businessService.registerBusiness(body);
  }

  @Get('directory')
  @ApiOperation({ summary: 'Get business directory with filters and pagination' })
  async getDirectory(@Query() query: GetDirectoryDto) {
    return this.businessService.getDirectory(query);
  }

  @Get('my-businesses')
  @ApiOperation({ summary: 'Get businesses owned by user' })
  async getMyBusinesses(@Query('userId') userId: string) {
    return this.businessService.getBusinessesByUserId(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get business profile' })
  async getBusiness(@Param('id') id: string) {
    return this.businessService.getBusiness(id);
  }

  @Post('api-keys/generate')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate API key for business' })
  async generateApiKey(@Body() body: { businessId: string }) {
    return this.businessService.generateApiKey(body.businessId);
  }

  @Get('stats/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get business analytics' })
  async getBusinessStats(@Param('id') id: string) {
    return this.businessService.getBusinessStats(id);
  }

  @Post('verify/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve business verification and mint NFT' })
  async approveVerification(
    @Param('id') id: string,
    @Body() body: { approvedBy: string },
  ) {
    return this.businessService.approveVerification(id, body.approvedBy);
  }

  @Post('trust-score/update')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update business trust score' })
  async updateTrustScore(
    @Body() body: { businessId: string; newTrustScore: number },
  ) {
    return this.businessService.updateTrustScore(
      body.businessId,
      body.newTrustScore,
    );
  }

  @Post('payment/initialize')
  @ApiOperation({ summary: 'Initialize payment for business verification' })
  async initializePayment(
    @Body()
    body: {
      businessId: string;
      email: string;
      tier: number;
      paymentMethod: 'paystack' | 'nowpayments';
    },
  ) {
    const pricing = this.businessPaymentService.getTierPricing(body.tier);

    if (body.paymentMethod === 'paystack') {
      return this.businessPaymentService.initializePaystackPayment(
        body.email,
        pricing.ngn * 100, // Convert to kobo
        body.businessId,
        { tier: body.tier },
      );
    } else if (body.paymentMethod === 'nowpayments') {
      return this.businessPaymentService.initializeNOWPayment(
        pricing.discountedUsd,
        body.businessId,
        { tier: body.tier },
      );
    }

    throw new Error('Invalid payment method');
  }

  @Post('payment/verify')
  @ApiOperation({ summary: 'Verify payment and complete business registration' })
  async verifyPayment(
    @Body()
    body: {
      businessId: string;
      paymentMethod: 'paystack' | 'nowpayments';
      reference: string;
    },
  ) {
    let paymentData;

    if (body.paymentMethod === 'paystack') {
      paymentData = await this.businessPaymentService.verifyPaystackPayment(
        body.reference,
      );
    } else if (body.paymentMethod === 'nowpayments') {
      paymentData = await this.businessPaymentService.verifyNOWPayment(
        body.reference,
      );
    } else {
      throw new Error('Invalid payment method');
    }

    // Mark business as payment completed
    await this.businessService.completePayment(body.businessId, paymentData);

    return {
      success: true,
      message: 'Payment verified successfully. Your application is now under review.',
      payment: paymentData,
    };
  }

  @Get('payment/pricing/:tier')
  @ApiOperation({ summary: 'Get pricing for a tier' })
  async getTierPricing(@Param('tier') tier: string) {
    return this.businessPaymentService.getTierPricing(parseInt(tier, 10));
  }

  @Get('payment/status/:businessId')
  @ApiOperation({ summary: 'Get payment status for business registration' })
  async getPaymentStatus(@Param('businessId') businessId: string) {
    return this.businessService.getPaymentStatus(businessId);
  }
}
