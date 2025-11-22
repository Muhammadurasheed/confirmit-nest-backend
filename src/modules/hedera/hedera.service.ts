import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Client,
  AccountId,
  PrivateKey,
  TopicMessageSubmitTransaction,
  TopicId,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenMintTransaction,
  TransferTransaction,
  TokenAssociateTransaction,
  TokenId,
} from '@hashgraph/sdk';
import * as crypto from 'crypto';
import * as admin from 'firebase-admin';

@Injectable()
export class HederaService {
  private readonly logger = new Logger(HederaService.name);
  private readonly client: Client;
  private readonly db = admin.firestore();

  constructor(private readonly configService: ConfigService) {
    // Initialize Hedera client
    const accountId = AccountId.fromString(
      this.configService.get('hedera.accountId'),
    );
    const privateKey = PrivateKey.fromString(
      this.configService.get('hedera.privateKey'),
    );

    const network = this.configService.get('hedera.network');

    if (network === 'testnet') {
      this.client = Client.forTestnet();
    } else {
      this.client = Client.forMainnet();
    }

    this.client.setOperator(accountId, privateKey);
    this.logger.log('Hedera client initialized');
  }

  async anchorToHCS(entityId: string, data: any): Promise<any> {
    this.logger.log(`Anchoring ${entityId} to Hedera HCS`);

    try {
      // 1. Create SHA-256 hash of data
      const dataHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(data))
        .digest('hex');

      const topicId = TopicId.fromString(
        this.configService.get('hedera.topicId'),
      );

      // 2. Submit message to HCS topic
      const transaction = await new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(
          JSON.stringify({
            entity_id: entityId,
            data_hash: dataHash,
            timestamp: new Date().toISOString(),
          }),
        )
        .execute(this.client);

      // 3. Get record (contains consensusTimestamp)
      const record = await transaction.getRecord(this.client);
      const consensusTimestamp = record.consensusTimestamp;

      const anchor = {
        transaction_id: transaction.transactionId.toString(),
        consensus_timestamp: consensusTimestamp.toString(),
        message_hash: dataHash,
        explorer_url: `https://hashscan.io/${this.configService.get('hedera.network')}/transaction/${transaction.transactionId}`,
      };

      // 4. Store anchor info in Firestore
      await this.db.collection('hedera_anchors').add({
        entity_type: 'receipt',
        entity_id: entityId,
        ...anchor,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      this.logger.log(`Successfully anchored ${entityId} to Hedera`);

      return anchor;
    } catch (error) {
      this.logger.error(`Hedera anchoring failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  async verifyAnchor(transactionId: string): Promise<boolean> {
    try {
      const anchorDoc = await this.db
        .collection('hedera_anchors')
        .where('transaction_id', '==', transactionId)
        .get();

      return !anchorDoc.empty;
    } catch (error) {
      this.logger.error(`Anchor verification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Mint Trust ID NFT for verified business
   * This creates a unique, non-transferable NFT representing business trust score
   */
  async mintTrustIdNFT(
    businessId: string,
    businessName: string,
    trustScore: number,
    verificationTier: number,
  ): Promise<any> {
    this.logger.log(`Minting Trust ID NFT for business: ${businessId}`);

    try {
      const tokenId = TokenId.fromString(
        this.configService.get('hedera.tokenId'),
      );

      // Create NFT metadata - MUST be under 100 bytes for Hedera
      // Store only essential info, full details stored in Firestore
      const compactMetadata = {
        id: businessId,
        ts: trustScore,
        tier: verificationTier,
        v: new Date().toISOString().split('T')[0], // Date only
      };

      const metadataBuffer = Buffer.from(JSON.stringify(compactMetadata));
      
      // Validate size (Hedera limit is 100 bytes)
      if (metadataBuffer.length > 100) {
        throw new Error(`Metadata too large: ${metadataBuffer.length} bytes (max 100)`);
      }
      
      this.logger.log(`NFT metadata size: ${metadataBuffer.length} bytes`);

      // Mint NFT
      const mintTx = await new TokenMintTransaction()
        .setTokenId(tokenId)
        .setMetadata([metadataBuffer])
        .execute(this.client);

      const mintReceipt = await mintTx.getReceipt(this.client);
      const serialNumber = mintReceipt.serials[0];

      this.logger.log(
        `NFT minted successfully. Serial: ${serialNumber.toString()}`,
      );

      // Full metadata for Firestore (not limited by Hedera constraints)
      const fullMetadata = {
        business_id: businessId,
        business_name: businessName,
        trust_score: trustScore,
        verification_tier: verificationTier,
        verified_at: new Date().toISOString(),
        network: 'ConfirmIT',
        type: 'Trust_ID_Certificate',
      };

      const network = this.configService.get('hedera.network');
      
      const nftData = {
        token_id: tokenId.toString(),
        serial_number: serialNumber.toString(),
        business_id: businessId,
        metadata: fullMetadata, // Store full metadata in Firestore
        mint_transaction_id: mintTx.transactionId.toString(),
        // Hedera NFT explorer URL with serial number path
        explorer_url: `https://hashscan.io/${network}/token/${tokenId}/${serialNumber}`,
        minted_at: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Store NFT info in Firestore
      await this.db.collection('hedera_nfts').add(nftData);

      // Update business document with NFT info
      await this.db
        .collection('businesses')
        .doc(businessId)
        .update({
          'hedera.trust_id_nft': {
            token_id: tokenId.toString(),
            serial_number: serialNumber.toString(),
            explorer_url: nftData.explorer_url,
          },
        });

      return nftData;
    } catch (error) {
      this.logger.error(
        `Trust ID NFT minting failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Update Trust ID NFT metadata when trust score changes
   */
  async updateTrustScore(
    businessId: string,
    newTrustScore: number,
  ): Promise<any> {
    this.logger.log(`Updating trust score for business: ${businessId}`);

    try {
      // Get existing NFT info
      const businessDoc = await this.db
        .collection('businesses')
        .doc(businessId)
        .get();
      const business = businessDoc.data();

      if (!business?.hedera?.trust_id_nft) {
        throw new Error('No Trust ID NFT found for this business');
      }

      // Create update transaction record
      const updateRecord = {
        business_id: businessId,
        old_trust_score: business.trust_score,
        new_trust_score: newTrustScore,
        nft_serial: business.hedera.trust_id_nft.serial_number,
        timestamp: new Date().toISOString(),
      };

      // Anchor update to HCS
      const anchor = await this.anchorToHCS(
        `TRUST_UPDATE_${businessId}`,
        updateRecord,
      );

      // Store update history
      await this.db.collection('trust_score_updates').add({
        ...updateRecord,
        hedera_anchor: anchor,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        update_record: updateRecord,
        hedera_anchor: anchor,
      };
    } catch (error) {
      this.logger.error(
        `Trust score update failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get Hedera verification status for entity
   */
  async getVerificationStatus(entityId: string): Promise<any> {
    try {
      const anchors = await this.db
        .collection('hedera_anchors')
        .where('entity_id', '==', entityId)
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();

      if (anchors.empty) {
        return {
          verified: false,
          message: 'Not anchored on Hedera',
        };
      }

      const anchor = anchors.docs[0].data();

      return {
        verified: true,
        transaction_id: anchor.transaction_id,
        consensus_timestamp: anchor.consensus_timestamp,
        explorer_url: anchor.explorer_url,
        verified_at: anchor.created_at,
      };
    } catch (error) {
      this.logger.error(`Verification status check failed: ${error.message}`);
      return {
        verified: false,
        error: error.message,
      };
    }
  }
}
