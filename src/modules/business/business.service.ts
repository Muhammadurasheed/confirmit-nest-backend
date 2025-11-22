import { Injectable, Logger, Inject } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { HederaService } from '../hedera/hedera.service';
import { BusinessPaymentService } from './business-payment.service';

@Injectable()
export class BusinessService {
  private readonly logger = new Logger(BusinessService.name);
  private readonly db = admin.firestore();

  constructor(
    private readonly hederaService: HederaService,
    private readonly businessPaymentService: BusinessPaymentService,
  ) {}

  async registerBusiness(data: any) {
    this.logger.log(`Registering business: ${data.name}`);

    const businessId = this.generateBusinessId();

    try {
      const businessData = {
        business_id: businessId,
        name: data.name,
        category: data.category,
        logo: data.logo || null,
        contact: {
          email: data.email,
          phone: data.phone,
          address: data.address,
        },
        bank_account: {
          number_encrypted: this.hashAccountNumber(data.accountNumber),
          bank_code: data.bankCode,
          account_name: data.accountName,
          verified: false,
        },
        verification: {
          tier: data.tier || 1,
          status: 'pending',
          verified: false,
          documents: data.documents || {},
        },
        trust_score: 0,
        rating: 0,
        review_count: 0,
        stats: {
          profile_views: 0,
          verifications: 0,
          successful_transactions: 0,
        },
        api_keys: [],
        created_by: data.userId || null, // Link business to user
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      };

      await this.db.collection('businesses').doc(businessId).set(businessData);

      return {
        success: true,
        business_id: businessId,
        message: 'Business registered successfully. Awaiting verification.',
      };
    } catch (error) {
      this.logger.error(`Business registration failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getBusiness(businessId: string) {
    const doc = await this.db.collection('businesses').doc(businessId).get();

    if (!doc.exists) {
      throw new Error('Business not found');
    }

    // Increment profile views
    await this.db.collection('businesses').doc(businessId).update({
      'stats.profile_views': admin.firestore.FieldValue.increment(1),
    });

    return {
      success: true,
      data: doc.data(),
    };
  }

  async getDirectory(filters: any) {
    this.logger.log('Fetching business directory with filters:', filters);

    try {
      let query: any = this.db
        .collection('businesses')
        .where('verification.verified', '==', true);

      // Apply filters
      if (filters.category) {
        query = query.where('category', '==', filters.category);
      }

      if (filters.tier) {
        query = query.where('verification.tier', '==', filters.tier);
      }

      if (filters.verifiedOnly) {
        query = query.where('verification.status', '==', 'approved');
      }

      // Execute query
      const snapshot = await query.get();

      let businesses = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          business_id: doc.id,
          name: data.name,
          logo: data.logo || null,
          category: data.category,
          trust_score: data.trust_score || 0,
          rating: data.rating || 0,
          review_count: data.review_count || 0,
          verified: data.verification?.verified || false,
          tier: data.verification?.tier || 1,
          location: data.contact?.city
            ? {
                city: data.contact.city,
                state: data.contact.state,
              }
            : null,
          contact: {
            email: data.contact?.email || '',
            phone: data.contact?.phone || '',
          },
          stats: data.stats || {
            profile_views: 0,
            verifications: 0,
            successful_transactions: 0,
          },
          created_at: data.created_at,
        };
      });

      // Client-side filtering for search and minTrustScore
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        businesses = businesses.filter((b) =>
          b.name.toLowerCase().includes(searchLower),
        );
      }

      if (filters.minTrustScore) {
        businesses = businesses.filter(
          (b) => b.trust_score >= filters.minTrustScore,
        );
      }

      // Sort by trust score (highest first)
      businesses.sort((a, b) => b.trust_score - a.trust_score);

      // Pagination
      const page = filters.page || 1;
      const limit = filters.limit || 12;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedBusinesses = businesses.slice(startIndex, endIndex);

      this.logger.log(
        `✅ Retrieved ${paginatedBusinesses.length} businesses (${businesses.length} total)`,
      );

      return {
        success: true,
        data: paginatedBusinesses,
        total: businesses.length,
        page,
        limit,
      };
    } catch (error) {
      this.logger.error(
        `❌ Get directory failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async generateApiKey(businessId: string) {
    const apiKey = this.generateSecureApiKey();
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    await this.db
      .collection('businesses')
      .doc(businessId)
      .update({
        api_keys: admin.firestore.FieldValue.arrayUnion({
          key_id: keyHash.substring(0, 8),
          key_hash: keyHash,
          environment: 'production',
          created_at: new Date().toISOString(),
        }),
      });

    return {
      success: true,
      api_key: apiKey,
      message: 'API key generated. Store it securely - it will not be shown again.',
    };
  }

  async getBusinessesByUserId(userId: string) {
    this.logger.log(`Fetching businesses for user: ${userId}`);

    try {
      const snapshot = await this.db
        .collection('businesses')
        .where('created_by', '==', userId)
        .orderBy('created_at', 'desc')
        .get();

      const businesses = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return {
        success: true,
        data: businesses,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch businesses: ${error.message}`);
      throw error;
    }
  }

  async getBusinessStats(businessId: string) {
    const doc = await this.db.collection('businesses').doc(businessId).get();

    if (!doc.exists) {
      throw new Error('Business not found');
    }

    const business = doc.data();

    return {
      success: true,
      stats: business.stats,
      trust_score: business.trust_score,
      rating: business.rating,
      review_count: business.review_count,
    };
  }

  private generateBusinessId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `BIZ-${timestamp}${random}`.toUpperCase();
  }

  private generateSecureApiKey(): string {
    return `ck_${crypto.randomBytes(32).toString('hex')}`;
  }

  private hashAccountNumber(accountNumber: string): string {
    // Use SHA-256 hashing - MUST match accounts.service.ts
    return crypto.createHash('sha256').update(accountNumber).digest('hex');
  }

  private encryptData(data: string): string {
    // Simple base64 encoding for now - use proper encryption in production
    return Buffer.from(data).toString('base64');
  }

  /**
   * Approve business verification and mint Trust ID NFT
   */
  async approveVerification(businessId: string, approvedBy: string) {
    this.logger.log(`Approving verification for business: ${businessId}`);

    try {
      const doc = await this.db.collection('businesses').doc(businessId).get();

      if (!doc.exists) {
        throw new Error('Business not found');
      }

      const business = doc.data();

      // Calculate initial trust score based on tier
      const initialTrustScore = this.calculateInitialTrustScore(
        business.verification.tier,
      );

      // Mint Trust ID NFT on Hedera (with graceful error handling)
      let nftData: any = null;
      let nftError: string | null = null;
      
      try {
        nftData = await this.hederaService.mintTrustIdNFT(
          businessId,
          business.name,
          initialTrustScore,
          business.verification.tier,
        );
        this.logger.log(`✅ Trust ID NFT minted successfully for business: ${businessId}`);
      } catch (error) {
        this.logger.error(`⚠️ NFT minting failed (non-critical): ${error.message}`);
        // Continue approval even if NFT minting fails
        // Business can still be verified without NFT
        nftError = error.message;
        nftData = {
          error: error.message,
          note: 'Business approved but NFT minting failed. Contact admin to retry.',
        };
      }

      // Update business document
      const updateData: any = {
        'verification.status': 'approved',
        'verification.verified': true,
        'verification.approved_at': admin.firestore.FieldValue.serverTimestamp(),
        'verification.approved_by': approvedBy,
        trust_score: initialTrustScore,
      };

      // Only add NFT data if minting succeeded
      if (!nftError && nftData?.token_id) {
        updateData.hedera = {
          trust_id_nft: {
            token_id: nftData.token_id,
            serial_number: nftData.serial_number,
            explorer_url: nftData.explorer_url,
          },
        };
      }

      await this.db
        .collection('businesses')
        .doc(businessId)
        .update(updateData);

      // CRITICAL: Update account cache immediately when business is approved
      // Instead of just deleting, we UPDATE the cache with verified business data
      // This ensures instant reflection of the new verified status
      const accountHash = business.bank_account?.number_encrypted;
      if (accountHash) {
        try {
          const accountRef = this.db.collection('accounts').doc(accountHash);
          const accountDoc = await accountRef.get();
          
          if (accountDoc.exists) {
            // Update cache with verified business data
            const existingData = accountDoc.data();
            await accountRef.set({
              account_id: accountHash,
              account_hash: accountHash,
              bank_code: business.bank_account?.bank_code || existingData.bank_code,
              trust_score: initialTrustScore,
              risk_level: 'low',
              checks: {
                last_checked: admin.firestore.FieldValue.serverTimestamp(),
                check_count: existingData.checks?.check_count || 0,
                proceed_rate: existingData.checks?.proceed_rate || 0,
                first_checked: existingData.checks?.first_checked || admin.firestore.FieldValue.serverTimestamp(),
                fraud_reports: existingData.checks?.fraud_reports || {
                  total: 0,
                  recent_30_days: 0,
                  details: [],
                },
                verified_business_id: businessId,
                flags: [],
              },
              verified_business: {
                business_id: businessId,
                name: business.business_name || business.name || 'Unknown Business',
                verified: true,
                trust_score: initialTrustScore,
                rating: business.rating || 4.5,
                review_count: business.review_count || 0,
                location: business.contact?.address || business.location || 'N/A',
                tier: business.verification?.tier || 1,
                verification_date: new Date(),
                reviews: [],
              },
              created_at: existingData.created_at || admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            
            this.logger.log(`✅ Updated cache with verified business for account: ${accountHash.slice(0, 8)}...`);
          } else {
            // No cache exists yet - create it with verified business data
            await accountRef.set({
              account_id: accountHash,
              account_hash: accountHash,
              bank_code: business.bank_account?.bank_code || null,
              trust_score: initialTrustScore,
              risk_level: 'low',
              checks: {
                last_checked: admin.firestore.FieldValue.serverTimestamp(),
                check_count: 0,
                proceed_rate: 0,
                first_checked: admin.firestore.FieldValue.serverTimestamp(),
                fraud_reports: {
                  total: 0,
                  recent_30_days: 0,
                  details: [],
                },
                verified_business_id: businessId,
                flags: [],
              },
              verified_business: {
                business_id: businessId,
                name: business.business_name || business.name || 'Unknown Business',
                verified: true,
                trust_score: initialTrustScore,
                rating: business.rating || 4.5,
                review_count: business.review_count || 0,
                location: business.contact?.address || business.location || 'N/A',
                tier: business.verification?.tier || 1,
                verification_date: new Date(),
                reviews: [],
              },
              created_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            
            this.logger.log(`✅ Created cache with verified business for account: ${accountHash.slice(0, 8)}...`);
          }
        } catch (error) {
          this.logger.warn(`Failed to update account cache: ${error.message}`);
          // Don't fail the approval if cache update fails
        }
      }

      const successMessage = nftError 
        ? `Business ${businessId} verified (NFT minting pending: ${nftError})`
        : `Business ${businessId} verified successfully with NFT ${nftData.serial_number}`;
      
      this.logger.log(successMessage);

      return {
        success: true,
        business_id: businessId,
        trust_score: initialTrustScore,
        nft: nftData,
        message: nftError 
          ? 'Business verified successfully (NFT minting pending)' 
          : 'Business verified successfully and Trust ID NFT minted',
        warning: nftError ? `NFT minting failed: ${nftError}. Business is still approved.` : undefined,
      };
    } catch (error) {
      this.logger.error(
        `Business verification failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Update business trust score and anchor to Hedera
   */
  async updateTrustScore(businessId: string, newTrustScore: number) {
    this.logger.log(
      `Updating trust score for ${businessId} to ${newTrustScore}`,
    );

    try {
      // Update trust score and anchor change to Hedera
      const hederaUpdate = await this.hederaService.updateTrustScore(
        businessId,
        newTrustScore,
      );

      // Update business document
      await this.db
        .collection('businesses')
        .doc(businessId)
        .update({
          trust_score: newTrustScore,
          last_trust_update: admin.firestore.FieldValue.serverTimestamp(),
        });

      return {
        success: true,
        business_id: businessId,
        new_trust_score: newTrustScore,
        hedera_anchor: hederaUpdate.hedera_anchor,
      };
    } catch (error) {
      this.logger.error(
        `Trust score update failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private calculateInitialTrustScore(tier: number): number {
    // Tier-based initial trust scores
    const scores = {
      1: 50, // Basic: Starting trust
      2: 70, // Verified: Higher initial trust
      3: 85, // Premium: High initial trust
    };
    return scores[tier] || 50;
  }

  /**
   * Get all pending businesses (admin only)
   */
  async getPendingBusinesses() {
    this.logger.log('Fetching pending businesses for admin review');

    // Fetch businesses with status 'pending' OR 'under_review'
    const pendingSnapshot = await this.db
      .collection('businesses')
      .where('verification.status', '==', 'pending')
      .get();

    const underReviewSnapshot = await this.db
      .collection('businesses')
      .where('verification.status', '==', 'under_review')
      .get();

    // Combine results
    const allDocs = [...pendingSnapshot.docs, ...underReviewSnapshot.docs];

    // Map and sort by created_at descending
    const businesses = allDocs
      .map((doc) => {
        const data = doc.data();
        return {
          business_id: doc.id,
          name: data.name,
          logo: data.logo,
          category: data.category,
          contact: data.contact,
          verification: data.verification,
          created_at: data.created_at,
          bank_account: {
            bank_code: data.bank_account?.bank_code,
            account_name: data.bank_account?.account_name,
          },
        };
      })
      .sort((a, b) => {
        // Sort by created_at descending (newest first)
        const timeA = a.created_at?._seconds || 0;
        const timeB = b.created_at?._seconds || 0;
        return timeB - timeA;
      });

    return {
      success: true,
      data: businesses,
      total: businesses.length,
    };
  }

  /**
   * Get all businesses (admin only)
   */
  async getAllBusinesses() {
    this.logger.log('Fetching all businesses for admin');

    const snapshot = await this.db
      .collection('businesses')
      .orderBy('created_at', 'desc')
      .get();

    const businesses = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        business_id: doc.id,
        name: data.name,
        logo: data.logo,
        category: data.category,
        trust_score: data.trust_score || 0,
        rating: data.rating || 0,
        verification: data.verification,
        stats: data.stats,
        created_at: data.created_at,
      };
    });

    return {
      success: true,
      data: businesses,
      total: businesses.length,
    };
  }

  /**
   * Reject business verification
   */
  async rejectVerification(
    businessId: string,
    reason: string,
    rejectedBy: string,
  ) {
    this.logger.log(`Rejecting verification for business: ${businessId}`);

    await this.db
      .collection('businesses')
      .doc(businessId)
      .update({
        'verification.status': 'rejected',
        'verification.rejection_reason': reason,
        'verification.rejected_by': rejectedBy,
        'verification.rejected_at': admin.firestore.FieldValue.serverTimestamp(),
      });

    return {
      success: true,
      message: 'Business verification rejected',
    };
  }

  /**
   * Suspend business (admin only)
   */
  async suspendBusiness(
    businessId: string,
    reason: string,
    suspendedBy: string,
  ) {
    this.logger.log(`Suspending business: ${businessId}`);

    const businessDoc = await this.db
      .collection('businesses')
      .doc(businessId)
      .get();

    if (!businessDoc.exists) {
      throw new Error('Business not found');
    }

    // Update business status to suspended
    await this.db
      .collection('businesses')
      .doc(businessId)
      .update({
        'verification.status': 'suspended',
        'verification.suspension_reason': reason,
        'verification.suspended_by': suspendedBy,
        'verification.suspended_at': admin.firestore.FieldValue.serverTimestamp(),
      });

    // Clear account cache if business has account linked
    const businessData = businessDoc.data();
    if (businessData?.bank_account?.number_encrypted) {
      try {
        const accountHash = businessData.bank_account.number_encrypted;
        await this.db.collection('account_cache').doc(accountHash).delete();
        this.logger.log(`Cleared account cache for suspended business: ${accountHash.slice(0, 8)}...`);
      } catch (error) {
        this.logger.warn(`Failed to clear account cache: ${error.message}`);
      }
    }

    return {
      success: true,
      message: 'Business suspended successfully',
      business_id: businessId,
    };
  }

  /**
   * Permanently delete business (admin only)
   */
  async deleteBusiness(businessId: string, deletedBy: string) {
    this.logger.log(`Permanently deleting business: ${businessId} by ${deletedBy}`);

    const businessDoc = await this.db
      .collection('businesses')
      .doc(businessId)
      .get();

    if (!businessDoc.exists) {
      throw new Error('Business not found');
    }

    const businessData = businessDoc.data();

    // Clear account cache if business has account linked
    if (businessData?.bank_account?.number_encrypted) {
      try {
        const accountHash = businessData.bank_account.number_encrypted;
        await this.db.collection('account_cache').doc(accountHash).delete();
        this.logger.log(`Cleared account cache for deleted business: ${accountHash.slice(0, 8)}...`);
      } catch (error) {
        this.logger.warn(`Failed to clear account cache: ${error.message}`);
      }
    }

    // Delete the business document
    await this.db.collection('businesses').doc(businessId).delete();

    this.logger.log(`Business ${businessId} permanently deleted by ${deletedBy}`);

    return {
      success: true,
      message: 'Business permanently deleted',
      business_id: businessId,
    };
  }

  /**
   * Mark payment as completed
   */
  async completePayment(businessId: string, paymentData: any) {
    this.logger.log(`Completing payment for ${businessId}`);

    await this.db
      .collection('businesses')
      .doc(businessId)
      .update({
        'verification.payment_status': 'completed',
        'verification.payment_data': paymentData,
        'verification.paid_at': admin.firestore.FieldValue.serverTimestamp(),
        'verification.status': 'under_review',
      });

    return {
      success: true,
      message: 'Payment completed. Application is now under review.',
    };
  }

  /**
   * Get payment status for a business
   */
  async getPaymentStatus(businessId: string) {
    this.logger.log(`Checking payment status for ${businessId}`);

    const businessDoc = await this.db
      .collection('businesses')
      .doc(businessId)
      .get();

    if (!businessDoc.exists) {
      throw new Error('Business not found');
    }

    const businessData = businessDoc.data();
    const paymentStatus = businessData.verification?.payment_status || 'pending';
    const verificationStatus = businessData.verification?.status || 'pending';

    return {
      status: paymentStatus,
      verification_status: verificationStatus,
      data: businessData.verification?.payment_data || null,
    };
  }
}
