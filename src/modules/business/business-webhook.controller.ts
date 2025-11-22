import {
  Controller,
  Post,
  Body,
  Headers,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BusinessPaymentService } from './business-payment.service';
import { BusinessService } from './business.service';
import * as crypto from 'crypto';

@ApiTags('webhooks')
@Controller('webhooks')
export class BusinessWebhookController {
  private readonly logger = new Logger(BusinessWebhookController.name);

  constructor(
    private readonly businessPaymentService: BusinessPaymentService,
    private readonly businessService: BusinessService,
  ) {}

  @Post('paystack')
  @ApiOperation({ summary: 'Paystack payment webhook' })
  async paystackWebhook(
    @Body() payload: any,
    @Headers('x-paystack-signature') signature: string,
  ) {
    this.logger.log('Received Paystack webhook');

    // Verify webhook signature
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(payload))
      .digest('hex');

    if (hash !== signature) {
      this.logger.error('Invalid Paystack webhook signature');
      throw new BadRequestException('Invalid signature');
    }

    // Handle different event types
    if (payload.event === 'charge.success') {
      const { reference, metadata } = payload.data;
      const businessId = metadata.business_id;

      this.logger.log(`Payment successful for business: ${businessId}`);

      // Mark payment as completed
      await this.businessService.completePayment(businessId, {
        reference,
        amount: payload.data.amount / 100, // Convert from kobo
        payment_method: 'paystack',
        status: 'success',
        paid_at: new Date().toISOString(),
      });
    }

    return { success: true };
  }

  @Post('nowpayments')
  @ApiOperation({ summary: 'NOWPayments webhook' })
  async nowpaymentsWebhook(
    @Body() payload: any,
    @Headers('x-nowpayments-sig') signature: string,
  ) {
    this.logger.log('Received NOWPayments webhook');

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha512', process.env.NOWPAYMENTS_IPN_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');

    if (signature !== expectedSignature) {
      this.logger.error('Invalid NOWPayments webhook signature');
      throw new BadRequestException('Invalid signature');
    }

    // Handle payment status
    if (payload.payment_status === 'finished') {
      const businessId = payload.order_id;

      this.logger.log(
        `Crypto payment successful for business: ${businessId}`,
      );

      // Mark payment as completed
      await this.businessService.completePayment(businessId, {
        payment_id: payload.payment_id,
        amount: payload.price_amount,
        currency: payload.price_currency,
        payment_method: 'nowpayments',
        status: 'finished',
        paid_at: new Date().toISOString(),
      });
    }

    return { success: true };
  }
}
