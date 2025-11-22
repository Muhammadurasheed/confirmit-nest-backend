import { Module } from '@nestjs/common';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { ReceiptsGateway } from './receipts.gateway';
import { HederaModule } from '../hedera/hedera.module';

@Module({
  imports: [HederaModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReceiptsGateway],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
