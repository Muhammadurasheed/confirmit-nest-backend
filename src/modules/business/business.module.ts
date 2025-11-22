import { Module } from '@nestjs/common';
import { BusinessController } from './business.controller';
import { BusinessAdminController } from './business-admin.controller';
import { BusinessWebhookController } from './business-webhook.controller';
import { BusinessService } from './business.service';
import { BusinessPaymentService } from './business-payment.service';
import { HederaModule } from '../hedera/hedera.module';

@Module({
  imports: [HederaModule],
  controllers: [
    BusinessController,
    BusinessAdminController,
    BusinessWebhookController,
  ],
  providers: [BusinessService, BusinessPaymentService],
  exports: [BusinessService, BusinessPaymentService],
})
export class BusinessModule {}
