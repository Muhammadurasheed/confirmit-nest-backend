import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth(): object {
    return {
      status: 'ok',
      message: 'ConfirmIT API is running',
      timestamp: new Date().toISOString(),
    };
  }
}
