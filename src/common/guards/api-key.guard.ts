import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private readonly db = admin.firestore();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = this.extractApiKey(request);

    if (!apiKey) {
      throw new UnauthorizedException('API key is required');
    }

    try {
      // Hash the API key to compare with stored hash
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      // Find business with this API key
      const businessSnapshot = await this.db
        .collection('businesses')
        .where('api_keys', 'array-contains', { key_hash: keyHash })
        .limit(1)
        .get();

      if (businessSnapshot.empty) {
        throw new UnauthorizedException('Invalid API key');
      }

      const businessDoc = businessSnapshot.docs[0];
      const businessData = businessDoc.data();

      // Find the specific API key
      const apiKeyData = businessData.api_keys?.find(
        (key: any) => key.key_hash === keyHash,
      );

      if (!apiKeyData) {
        throw new UnauthorizedException('Invalid API key');
      }

      // Check if key is revoked
      if (apiKeyData.revoked) {
        throw new UnauthorizedException('API key has been revoked');
      }

      // Attach business info to request for later use
      request.business = {
        id: businessDoc.id,
        name: businessData.name,
        tier: businessData.verification?.tier || 1,
        apiKeyId: apiKeyData.key_id,
      };

      // Log API usage
      await this.logApiUsage(businessDoc.id, request);

      this.logger.log(`✅ API key validated for business: ${businessData.name}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ API key validation failed: ${error.message}`);
      throw new UnauthorizedException(error.message);
    }
  }

  private extractApiKey(request: any): string | undefined {
    // Check Authorization header (Bearer token)
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check X-API-Key header
    const apiKeyHeader = request.headers['x-api-key'];
    if (apiKeyHeader) {
      return apiKeyHeader;
    }

    // Check query parameter (not recommended for production)
    if (request.query?.api_key) {
      return request.query.api_key;
    }

    return undefined;
  }

  private async logApiUsage(businessId: string, request: any) {
    try {
      // Log to Firestore subcollection for analytics
      await this.db
        .collection('businesses')
        .doc(businessId)
        .collection('api_usage')
        .add({
          endpoint: request.url,
          method: request.method,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          ip_address: request.ip,
          user_agent: request.headers['user-agent'],
        });

      // Increment usage counter
      await this.db
        .collection('businesses')
        .doc(businessId)
        .update({
          'stats.api_requests': admin.firestore.FieldValue.increment(1),
        });
    } catch (error) {
      this.logger.error(`Failed to log API usage: ${error.message}`);
      // Don't throw - logging failure shouldn't block the request
    }
  }
}
