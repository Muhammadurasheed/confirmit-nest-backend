import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { ReceiptsService } from './receipts.service';
import { ScanReceiptDto } from './dto/scan-receipt.dto';
import { AuthGuard } from '../../common/guards/auth.guard';

@ApiTags('receipts')
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Post('scan')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload and analyze receipt (public endpoint)' })
  @ApiConsumes('multipart/form-data')
  async scanReceipt(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ScanReceiptDto,
  ) {
    return this.receiptsService.scanReceipt(file, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get receipt details' })
  async getReceipt(@Param('id') id: string) {
    return this.receiptsService.getReceipt(id);
  }

  @Get('user/:userId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user receipt history' })
  async getUserReceipts(@Param('userId') userId: string) {
    return this.receiptsService.getUserReceipts(userId);
  }

  @Post(':id/anchor')
  @ApiOperation({ summary: 'Anchor receipt to Hedera blockchain' })
  async anchorReceipt(@Param('id') id: string) {
    return this.receiptsService.anchorReceiptToHedera(id);
  }
}
