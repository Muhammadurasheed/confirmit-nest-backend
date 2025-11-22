import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject('FIRESTORE') private readonly db: admin.firestore.Firestore,
  ) {}

  async checkAccount(
    accountNumber: string,
    bankCode?: string,
    businessName?: string,
  ) {
    this.logger.log(`Checking account: ${accountNumber.slice(0, 4)}****`);

    // Hash account number for privacy
    const accountHash = this.hashAccountNumber(accountNumber);

    try {
      // 1. Query BOTH demo and real data collections in parallel
      const [demoDoc, realDoc] = await Promise.all([
        this.db.collection('demo_accounts').doc(accountHash).get(),
        this.db.collection('accounts').doc(accountHash).get(),
      ]);

      // 2. Check if we have demo data for this account
      if (demoDoc.exists) {
        const demoData = demoDoc.data();
        this.logger.log('Using demo data for this account');

        // If demo data has verified business, fetch it
        let verifiedBusiness = null;
        if (demoData.checks?.verified_business_id) {
          const businessDoc = await this.db
            .collection('demo_businesses')
            .doc(demoData.checks.verified_business_id)
            .get();

          if (businessDoc.exists) {
            const businessData = businessDoc.data();
            
            // Fetch reviews for this business
            const reviewsSnapshot = await this.db
              .collection('demo_reviews')
              .where('business_id', '==', businessDoc.id)
              .orderBy('created_at', 'desc')
              .limit(5)
              .get();

            const reviews = reviewsSnapshot.docs.map(doc => {
              const reviewData = doc.data();
              return {
                rating: reviewData.rating,
                comment: reviewData.comment,
                reviewer_name: reviewData.reviewer_name,
                verified_purchase: reviewData.verified_purchase,
                created_at: reviewData.created_at?.toDate() || new Date(),
              };
            });

            // Convert dates to ISO strings for JSON serialization
            const verificationDate = businessData.verified_at?.toDate() || new Date();
            
            verifiedBusiness = {
              business_id: businessDoc.id,
              name: businessData.business_name || businessData.name || 'Unknown Business',
              verified: businessData.verified || true,
              trust_score: businessData.trust_score || 85,
              rating: businessData.rating || 4.5,
              review_count: businessData.review_count || 0,
              location: businessData.location || businessData.contact?.address || 'N/A',
              tier: businessData.tier || 1,
              verification_date: verificationDate.toISOString(), // Always return ISO string
              reviews: reviews || [],
            };
          }
        }

        // Fetch fraud reports summary for demo account
        const fraudReportsSnapshot = await this.db
          .collection('demo_fraud_reports')
          .where('account_hash', '==', accountHash)
          .orderBy('reported_at', 'desc')
          .get();

        const fraudReports = fraudReportsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            category: data.category,
            description_summary: data.description_summary || data.description?.substring(0, 100),
            severity: data.severity,
            verified: data.verified,
            reported_at: data.reported_at?.toDate() || new Date(),
          };
        });

        // Return demo data with enriched information
        return {
          success: true,
          data: {
            account_id: accountHash,
            account_hash: accountHash,
            bank_code: demoData.bank_code,
            trust_score: demoData.trust_score,
            risk_level: demoData.risk_level,
            checks: {
              last_checked: new Date().toISOString(),
              check_count: demoData.checks?.check_count || 0,
              proceed_rate: demoData.checks?.proceed_rate || 0,
              first_checked: demoData.checks?.first_checked?.toDate() || null,
              fraud_reports: {
                total: demoData.checks?.fraud_reports?.total || 0,
                recent_30_days: demoData.checks?.fraud_reports?.recent_30_days || 0,
                details: fraudReports.slice(0, 5), // Return top 5 reports
              },
              verified_business_id: demoData.checks?.verified_business_id || null,
              flags: demoData.checks?.flags || [],
            },
            verified_business: verifiedBusiness,
            is_demo: true, // Flag for transparency (backend only)
          },
        };
      }

      // 3. No demo data, check real data
      // REDUCED CACHE TIME: Refresh every 1 hour for demo (was 7 days)
      // This ensures newly approved businesses appear immediately
      const shouldRefresh =
        !realDoc.exists ||
        Date.now() - realDoc.data()?.checks?.last_checked?.toMillis() >
          60 * 60 * 1000; // 1 hour cache

      let accountData: any;

      if (realDoc.exists && !shouldRefresh) {
        // Use cached real data
        accountData = realDoc.data();
        this.logger.log('Using cached real account data');
      } else {
        // 4. No cached data - check if we have any fraud reports
        const fraudReportsSnapshot = await this.db
          .collection('fraud_reports')
          .where('account_hash', '==', accountHash)
          .get();

        const fraudCount = fraudReportsSnapshot.size;
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const recentFraudCount = fraudReportsSnapshot.docs.filter(doc => {
          const reportedAt = doc.data().reported_at?.toDate();
          return reportedAt && reportedAt > thirtyDaysAgo;
        }).length;

        // Calculate trust score based on fraud reports
        const baseTrustScore = 75;
        const trustScore = Math.max(10, baseTrustScore - (fraudCount * 12));
        const riskLevel = this.calculateRiskLevel(fraudCount, trustScore);

        const fraudReports = fraudReportsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            category: data.category,
            description_summary: data.description_summary || data.description?.substring(0, 100),
            severity: data.severity,
            verified: data.verified,
            reported_at: data.reported_at?.toDate() || new Date(),
          };
        });

        // Check if linked to verified business
        let verifiedBusiness = null;
        
        this.logger.log(`\n${'='.repeat(60)}`);
        this.logger.log(`🔍 ACCOUNT CHECK DEBUG INFO`);
        this.logger.log(`📱 Account: ${accountNumber.slice(0, 3)}***${accountNumber.slice(-2)}`);
        this.logger.log(`🔐 SHA-256 Hash: ${accountHash}`);
        
        // First check how many businesses we have total
        const allBusinessesSnapshot = await this.db
          .collection('businesses')
          .limit(5)
          .get();
        
        this.logger.log(`📊 Total businesses in database (sample): ${allBusinessesSnapshot.size}`);
        
        // Log sample business data for debugging
        let approvedCount = 0;
        allBusinessesSnapshot.docs.forEach((doc, index) => {
          const data = doc.data();
          const isApproved = data.verification?.verified === true;
          if (isApproved) approvedCount++;
          
          this.logger.log(`\n📋 Business ${index + 1}: ${data.business_name || data.name}`);
          this.logger.log(`   ID: ${doc.id}`);
          this.logger.log(`   Approved: ${isApproved ? '✅' : '❌'}`);
          this.logger.log(`   Hash stored: ${data.bank_account?.number_encrypted?.slice(0, 16)}...`);
          
          if (data.bank_account?.number_encrypted === accountHash) {
            this.logger.log(`   🎯 HASH MATCH FOUND!`);
          }
        });
        
        this.logger.log(`\n📈 Approved businesses found: ${approvedCount}`);
        this.logger.log(`🔎 Now querying for exact match...`);
        
        const businessSnapshot = await this.db
          .collection('businesses')
          .where('bank_account.number_encrypted', '==', accountHash)
          .where('verification.verified', '==', true)
          .limit(1)
          .get();
        
        this.logger.log(`📊 Query result: ${businessSnapshot.size} verified businesses with matching hash`);
        this.logger.log(`${'='.repeat(60)}\n`);

        if (!businessSnapshot.empty) {
          const businessDoc = businessSnapshot.docs[0];
          const businessData = businessDoc.data();
          
          // Fetch reviews for this business
          const reviewsSnapshot = await this.db
            .collection('reviews')
            .where('business_id', '==', businessDoc.id)
            .orderBy('created_at', 'desc')
            .limit(5)
            .get();

          const reviews = reviewsSnapshot.docs.map(doc => {
            const reviewData = doc.data();
            return {
              rating: reviewData.rating,
              comment: reviewData.comment,
              reviewer_name: reviewData.reviewer_name,
              verified_purchase: reviewData.verified_purchase || false,
              created_at: reviewData.created_at?.toDate() || new Date(),
            };
          });

          // Convert dates to ISO strings for JSON serialization
          const verificationDate = businessData.verification?.verified_at?.toDate() || 
                                   businessData.verified_at?.toDate() || 
                                   new Date();
          
          verifiedBusiness = {
            business_id: businessDoc.id,
            name: businessData.business_name || businessData.name || 'Unknown Business',
            verified: true,
            trust_score: businessData.trust_score || 85,
            rating: businessData.rating || 4.5,
            review_count: businessData.review_count || 0,
            location: businessData.location || businessData.contact?.address || 'N/A',
            tier: businessData.verification?.tier || businessData.tier || 1,
            verification_date: verificationDate.toISOString(), // Always return ISO string
            reviews: reviews || [],
          };
        }

        // 5. Store result
        accountData = {
          account_id: accountHash,
          account_hash: accountHash,
          bank_code: bankCode || null,
          trust_score: verifiedBusiness ? verifiedBusiness.trust_score : trustScore,
          risk_level: verifiedBusiness ? 'low' : riskLevel,
          checks: {
            last_checked: admin.firestore.FieldValue.serverTimestamp(),
            check_count: realDoc.exists ? realDoc.data().checks?.check_count + 1 : 1,
            proceed_rate: 0, // Will be calculated based on feedback
            first_checked: realDoc.exists ? realDoc.data().checks?.first_checked : admin.firestore.FieldValue.serverTimestamp(),
            fraud_reports: {
              total: fraudCount,
              recent_30_days: recentFraudCount,
              details: fraudReports.slice(0, 5),
            },
            verified_business_id: verifiedBusiness?.business_id || null,
            flags: fraudCount > 0 ? [`${fraudCount} fraud reports`] : [],
          },
          verified_business: verifiedBusiness,
          created_at: realDoc.exists ? realDoc.data().created_at : admin.firestore.FieldValue.serverTimestamp(),
        };

        await this.db.collection('accounts').doc(accountHash).set(accountData);
      }

      // Update check count and timestamp for real accounts
      if (!demoDoc.exists) {
        await this.db
          .collection('accounts')
          .doc(accountHash)
          .update({
            'checks.last_checked': admin.firestore.FieldValue.serverTimestamp(),
            'checks.check_count': admin.firestore.FieldValue.increment(1),
          });
      }

      return {
        success: true,
        data: accountData,
      };
    } catch (error) {
      this.logger.error(`Account check failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  async reportFraud(
    accountNumber: string,
    businessName: string | undefined,
    category: string,
    description: string,
    reporterId?: string,
  ) {
    this.logger.log(`Fraud report for account: ${accountNumber.slice(0, 4)}****`);

    const accountHash = this.hashAccountNumber(accountNumber);

    try {
      // 1. Create fraud report document
      const reportData: any = {
        account_hash: accountHash,
        account_number_partial: `${accountNumber.slice(0, 3)}***${accountNumber.slice(-2)}`,
        business_name: businessName || null,
        category,
        description,
        reporter_id: reporterId || 'anonymous',
        reported_at: admin.firestore.FieldValue.serverTimestamp(),
        status: 'pending',
        severity: this.calculateSeverity(category, description),
        verified: false,
      };

      const reportRef = await this.db.collection('fraud_reports').add(reportData);

      // 2. Update account fraud counter
      const accountRef = this.db.collection('accounts').doc(accountHash);
      const accountDoc = await accountRef.get();

      const fraudReports = {
        total: accountDoc.exists ? (accountDoc.data()?.checks?.fraud_reports?.total || 0) + 1 : 1,
        recent_30_days: accountDoc.exists ? (accountDoc.data()?.checks?.fraud_reports?.recent_30_days || 0) + 1 : 1,
      };

      // 3. Update or create account with fraud data
      if (accountDoc.exists) {
        const currentScore = accountDoc.data()?.trust_score || 50;
        const newScore = Math.max(0, currentScore - 15); // Reduce score by 15 for each report

        await accountRef.update({
          trust_score: newScore,
          risk_level: this.calculateRiskLevel(fraudReports.total, newScore),
          'checks.fraud_reports': fraudReports,
          'checks.flags': admin.firestore.FieldValue.arrayUnion(`Fraud report: ${category}`),
          'checks.last_updated': admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        await accountRef.set({
          account_id: accountHash,
          account_hash: accountHash,
          trust_score: 30,
          risk_level: 'high',
          checks: {
            fraud_reports: fraudReports,
            flags: [`Fraud report: ${category}`],
            last_checked: admin.firestore.FieldValue.serverTimestamp(),
            check_count: 0,
          },
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      this.logger.log(`✅ Fraud report created: ${reportRef.id}`);

      return {
        success: true,
        message: 'Thank you for reporting. This helps protect the community.',
        report_id: reportRef.id,
      };
    } catch (error) {
      this.logger.error(`❌ Fraud report failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getFraudReports(accountNumber: string) {
    this.logger.log(`Fetching fraud reports for account: ${accountNumber.slice(0, 4)}****`);

    const accountHash = this.hashAccountNumber(accountNumber);

    try {
      // Query BOTH demo and real fraud reports in parallel
      const [demoReportsSnapshot, realReportsSnapshot] = await Promise.all([
        this.db
          .collection('demo_fraud_reports')
          .where('account_hash', '==', accountHash)
          .orderBy('reported_at', 'desc')
          .limit(20)
          .get(),
        this.db
          .collection('fraud_reports')
          .where('account_hash', '==', accountHash)
          .orderBy('reported_at', 'desc')
          .limit(20)
          .get(),
      ]);

      // Merge demo + real reports
      const allReportsDocs = [...demoReportsSnapshot.docs, ...realReportsSnapshot.docs];
      
      if (allReportsDocs.length === 0) {
        return {
          success: true,
          data: {
            total: 0,
            recent_30_days: 0,
            categories: [],
            patterns: [],
            reports: [],
          },
        };
      }

      const reports = [];
      const categoryCount = {};
      const patterns = new Set();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      let recent30DaysCount = 0;

      allReportsDocs.forEach((doc) => {
        const data = doc.data();
        const reportedAt = data.reported_at?.toDate() || new Date();
        
        // Count recent reports
        if (reportedAt > thirtyDaysAgo) {
          recent30DaysCount++;
        }

        // Count categories
        if (data.category) {
          categoryCount[data.category] = (categoryCount[data.category] || 0) + 1;
        }

        // Extract patterns
        if (data.description) {
          patterns.add(this.extractPattern(data.description));
        }

        // Anonymized report details with FULL description
        reports.push({
          id: doc.id,
          category: data.category,
          description: data.description || data.description_summary || '',
          description_summary: data.description_summary || data.description?.substring(0, 100),
          severity: data.severity,
          pattern: this.extractPattern(data.description),
          amount_lost: data.amount_lost || null,
          reported_at: reportedAt,
          verified: data.verified || false,
          is_demo: data.is_demo || false,
        });
      });

      // Sort by date (most recent first)
      reports.sort((a, b) => b.reported_at.getTime() - a.reported_at.getTime());

      // Format category data
      const categories = Object.entries(categoryCount).map(([type, count]) => ({
        type,
        count,
      })).sort((a, b) => (b.count as number) - (a.count as number));

      this.logger.log(`✅ Retrieved ${reports.length} fraud reports (${recent30DaysCount} in last 30 days)`);

      return {
        success: true,
        data: {
          total: reports.length,
          recent_30_days: recent30DaysCount,
          categories,
          patterns: Array.from(patterns).filter(Boolean),
          reports: reports.slice(0, 10), // Return max 10 for privacy
        },
      };
    } catch (error) {
      this.logger.error(`❌ Get fraud reports failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  private calculateSeverity(category: string, description: string): 'low' | 'medium' | 'high' {
    const highRiskCategories = ['account takeover', 'identity theft', 'large financial loss'];
    const highRiskKeywords = ['scam', 'stole', 'never received', 'blocked me', 'fake'];
    
    const categoryLower = category.toLowerCase();
    const descriptionLower = description.toLowerCase();

    if (highRiskCategories.some(cat => categoryLower.includes(cat))) {
      return 'high';
    }

    if (highRiskKeywords.some(keyword => descriptionLower.includes(keyword))) {
      return 'high';
    }

    if (descriptionLower.length > 200) {
      return 'medium';
    }

    return 'medium';
  }

  private calculateRiskLevel(fraudCount: number, trustScore: number): 'low' | 'medium' | 'high' {
    if (fraudCount >= 5 || trustScore < 30) return 'high';
    if (fraudCount >= 2 || trustScore < 60) return 'medium';
    return 'low';
  }

  private extractPattern(description: string): string {
    const patterns = {
      'never received': 'Non-delivery of goods/services',
      'fake product': 'Counterfeit items',
      'blocked me': 'Communication cutoff after payment',
      'different account': 'Account switching scam',
      'never refund': 'Refund refusal',
    };

    const descriptionLower = description.toLowerCase();
    for (const [keyword, pattern] of Object.entries(patterns)) {
      if (descriptionLower.includes(keyword)) {
        return pattern;
      }
    }

    return 'General fraudulent activity';
  }

  async getAccount(accountId: string) {
    const doc = await this.db.collection('accounts').doc(accountId).get();

    if (!doc.exists) {
      throw new Error('Account not found');
    }

    return {
      success: true,
      data: doc.data(),
    };
  }

  async resolveAccount(accountNumber: string, bankCode: string) {
    this.logger.log(`Resolving account: ${accountNumber.slice(0, 4)}**** for bank: ${bankCode}`);

    const paystackSecretKey = this.configService.get('PAYSTACK_SECRET_KEY');
    
    if (!paystackSecretKey) {
      throw new Error('Paystack secret key not configured');
    }

    try {
      const response = await fetch(
        `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.status) {
        this.logger.error(`Paystack resolution failed: ${data.message}`);
        return {
          success: false,
          error: data.message || 'Failed to resolve account',
        };
      }

      this.logger.log(`Account resolved successfully: ${data.data.account_name}`);

      return {
        success: true,
        data: {
          account_number: data.data.account_number,
          account_name: data.data.account_name,
          bank_id: data.data.bank_id,
        },
      };
    } catch (error) {
      this.logger.error(`Account resolution error: ${error.message}`, error.stack);
      return {
        success: false,
        error: 'Failed to resolve account. Please verify the account number and bank code.',
      };
    }
  }

  private hashAccountNumber(accountNumber: string): string {
    return crypto.createHash('sha256').update(accountNumber).digest('hex');
  }
}
