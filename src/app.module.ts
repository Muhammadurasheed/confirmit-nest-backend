import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FirebaseModule } from './common/firebase/firebase.module';
import { ReceiptsModule } from './modules/receipts/receipts.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { BusinessModule } from './modules/business/business.module';
import { HederaModule } from './modules/hedera/hedera.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    FirebaseModule,
    ReceiptsModule,
    AccountsModule,
    BusinessModule,
    HederaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
