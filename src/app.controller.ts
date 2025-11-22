import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  getHealth(): object {
    return this.appService.getHealth();
  }

  @Get('status')
  @ApiOperation({ summary: 'Service status' })
  getStatus(): object {
    return {
      status: 'operational',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        api: 'healthy',
        firebase: 'connected',
        hedera: 'connected',
        ai_service: 'connected',
      },
    };
  }
}
