import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_KEY } from '../decorators/admin.decorator';
import * as admin from 'firebase-admin';

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly ADMIN_EMAILS = ['yekinirasheed2002@gmail.com'];

  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isAdmin = this.reflector.getAllAndOverride<boolean>(ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!isAdmin) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new ForbiddenException('No authorization token provided');
    }

    try {
      const token = authHeader.replace('Bearer ', '');
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userEmail = decodedToken.email;

      if (!this.ADMIN_EMAILS.includes(userEmail)) {
        throw new ForbiddenException(
          'Access denied. Admin privileges required.',
        );
      }

      request.user = decodedToken;
      return true;
    } catch (error) {
      throw new ForbiddenException('Invalid token or insufficient permissions');
    }
  }
}
