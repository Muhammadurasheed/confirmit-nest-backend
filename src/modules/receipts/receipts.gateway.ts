import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/receipts',
})
export class ReceiptsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ReceiptsGateway.name);
  private connectedClients = new Map<string, number>();

  handleConnection(client: Socket) {
    // Only log first connection, not reconnections
    const count = this.connectedClients.get(client.id) || 0;
    if (count === 0) {
      this.logger.log(`Client connected: ${client.id}`);
    }
    this.connectedClients.set(client.id, count + 1);
  }

  handleDisconnect(client: Socket) {
    // Only log if client disconnects after being connected for a while
    const count = this.connectedClients.get(client.id) || 0;
    if (count <= 1) {
      this.connectedClients.delete(client.id);
    }
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, receiptId: string) {
    client.join(receiptId);
    this.logger.debug(`Client ${client.id} subscribed to receipt ${receiptId}`);
    
    // Send acknowledgment back to client
    client.emit('subscribed', { receiptId, timestamp: new Date().toISOString() });
  }

  emitProgress(receiptId: string, progress: number, status: string, message?: string) {
    this.server.to(receiptId).emit('progress', {
      receipt_id: receiptId,
      progress,
      status,
      message: message || status,
      timestamp: new Date().toISOString(),
    });
    this.logger.debug(`📊 Progress emitted to ${receiptId}: ${progress}% - ${status}`);
  }

  emitComplete(receiptId: string, data: any) {
    this.server.to(receiptId).emit('complete', {
      receipt_id: receiptId,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  emitError(receiptId: string, error: string) {
    this.server.to(receiptId).emit('error', {
      receipt_id: receiptId,
      error,
      timestamp: new Date().toISOString(),
    });
  }
}
