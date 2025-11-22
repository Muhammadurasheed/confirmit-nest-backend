/**
 * Demo Data Seeding Script for Journey 2: Account Check
 * 
 * This script seeds demo data for:
 * 1. Demo scam accounts (high risk)
 * 2. Demo verified businesses (safe)
 * 3. Demo fraud reports
 * 4. Demo business reviews
 * 
 * Run: npm run seed:demo
 */

import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

// Demo Scam Accounts
const DEMO_SCAM_ACCOUNTS = [
  {
    accountNumber: '0000123456',
    bankCode: '044', // Access Bank
    businessName: 'Fake Electronics Hub',
    reports: [
      {
        category: 'non_delivery',
        description: 'Paid ₦85,000 for iPhone 13. Never received item. Seller blocked me after payment.',
        amount_lost: 85000,
        transaction_date: new Date('2025-10-01'),
        verified: true,
      },
      {
        category: 'fake_products',
        description: 'Received fake AirPods. Quality is terrible, clearly counterfeit.',
        amount_lost: 25000,
        transaction_date: new Date('2025-10-15'),
        verified: true,
      },
      {
        category: 'non_delivery',
        description: 'Ordered MacBook Pro, never delivered. Account now unreachable.',
        amount_lost: 450000,
        transaction_date: new Date('2025-09-20'),
        verified: true,
      },
      {
        category: 'account_blocked',
        description: 'Sent ₦120k for laptop, seller blocked me immediately.',
        amount_lost: 120000,
        transaction_date: new Date('2025-10-22'),
        verified: false,
      },
    ],
  },
  {
    accountNumber: '1111234567',
    bankCode: '058', // GTBank
    businessName: 'Quick Deals NG',
    reports: [
      {
        category: 'account_blocked',
        description: 'Account disappeared after I sent ₦120k for laptop. Complete scam.',
        amount_lost: 120000,
        transaction_date: new Date('2025-10-20'),
        verified: false,
      },
      {
        category: 'fake_products',
        description: 'Received fake Samsung phone. Not original.',
        amount_lost: 180000,
        transaction_date: new Date('2025-10-10'),
        verified: true,
      },
    ],
  },
  {
    accountNumber: '9999876543',
    bankCode: '057', // Zenith Bank
    businessName: 'Best Prices Nigeria',
    reports: [
      {
        category: 'non_delivery',
        description: 'Never received the PS5 console I paid for. ₦350k gone.',
        amount_lost: 350000,
        transaction_date: new Date('2025-09-15'),
        verified: true,
      },
    ],
  },
];

// Demo Verified Businesses
const DEMO_VERIFIED_BUSINESSES = [
  {
    accountNumber: '0123456789',
    bankCode: '044', // Access Bank
    businessName: 'TechHub Electronics',
    tier: 3,
    verified: true,
    trust_score: 92,
    rating: 4.8,
    review_count: 127,
    location: 'Ikeja, Lagos',
    reviews: [
      {
        rating: 5,
        comment: 'Legit seller, fast delivery. Bought MacBook and it\'s genuine.',
        reviewer_name: 'Sarah O.',
        verified_purchase: true,
        created_at: new Date('2025-10-22'),
      },
      {
        rating: 5,
        comment: 'Trusted! Bought twice, both times perfect.',
        reviewer_name: 'Chidi A.',
        verified_purchase: true,
        created_at: new Date('2025-10-18'),
      },
      {
        rating: 4,
        comment: 'Good products, slightly delayed delivery but worth it.',
        reviewer_name: 'Amina K.',
        verified_purchase: true,
        created_at: new Date('2025-10-10'),
      },
    ],
  },
  {
    accountNumber: '0987654321',
    bankCode: '033', // UBA
    businessName: 'ChiTech Solutions',
    tier: 2,
    verified: true,
    trust_score: 85,
    rating: 4.5,
    review_count: 89,
    location: 'Victoria Island, Lagos',
    reviews: [
      {
        rating: 5,
        comment: 'Reliable seller. Got my iPhone 14 Pro Max genuine.',
        reviewer_name: 'Daniel M.',
        verified_purchase: true,
        created_at: new Date('2025-10-20'),
      },
      {
        rating: 4,
        comment: 'Good service, reasonable prices.',
        reviewer_name: 'Blessing N.',
        verified_purchase: true,
        created_at: new Date('2025-10-05'),
      },
    ],
  },
  {
    accountNumber: '0246813579',
    bankCode: '011', // First Bank
    businessName: 'Legit Store Lagos',
    tier: 3,
    verified: true,
    trust_score: 94,
    rating: 4.9,
    review_count: 203,
    location: 'Lekki, Lagos',
    reviews: [
      {
        rating: 5,
        comment: 'Best electronics store in Lagos! Genuine products always.',
        reviewer_name: 'Emmanuel T.',
        verified_purchase: true,
        created_at: new Date('2025-10-25'),
      },
      {
        rating: 5,
        comment: 'Excellent service, fast delivery, genuine products.',
        reviewer_name: 'Fatima A.',
        verified_purchase: true,
        created_at: new Date('2025-10-15'),
      },
      {
        rating: 5,
        comment: 'Highly recommended. Bought 3 items, all perfect.',
        reviewer_name: 'Tunde B.',
        verified_purchase: true,
        created_at: new Date('2025-10-08'),
      },
    ],
  },
];

function hashAccount(accountNumber: string, bankCode: string): string {
  const salt = process.env.ACCOUNT_HASH_SALT || 'confirmit_salt_2025';
  return crypto
    .createHash('sha256')
    .update(`${accountNumber}${bankCode}${salt}`)
    .digest('hex');
}

async function seedDemoData() {
  console.log('\n🌱 Seeding demo data for Journey 2: Account Check\n');
  console.log('='.repeat(60));

  try {
    // Seed demo scam accounts
    console.log('\n📛 Seeding demo scam accounts...\n');
    
    for (const account of DEMO_SCAM_ACCOUNTS) {
      const accountHash = hashAccount(account.accountNumber, account.bankCode);
      
      // Calculate trust score based on reports
      const totalReports = account.reports.length;
      const trustScore = Math.max(10, 75 - (totalReports * 12));
      const riskLevel = totalReports > 5 ? 'high' : totalReports > 2 ? 'medium' : 'low';

      // Create demo account
      await db.collection('demo_accounts').doc(accountHash).set({
        account_hash: accountHash,
        bank_code: account.bankCode,
        business_name: account.businessName,
        trust_score: trustScore,
        risk_level: riskLevel,
        is_demo: true,
        checks: {
          check_count: Math.floor(Math.random() * 100) + 20,
          proceed_rate: 0.09, // 9% proceed anyway
          fraud_reports: {
            total: totalReports,
            recent_30_days: Math.min(totalReports, Math.floor(Math.random() * totalReports) + 1),
          },
          first_checked: admin.firestore.Timestamp.fromDate(new Date('2025-01-15')),
          last_checked: admin.firestore.Timestamp.now(),
          flags: [
            'Multiple fraud reports',
            'Low proceed rate',
            'Community warnings',
          ],
          verified_business_id: null,
        },
        created_at: admin.firestore.Timestamp.now(),
      });

      // Create demo fraud reports
      for (const report of account.reports) {
        await db.collection('demo_fraud_reports').add({
          account_hash: accountHash,
          account_number_partial: `${account.accountNumber.slice(0, 3)}***${account.accountNumber.slice(-2)}`,
          business_name: account.businessName,
          category: report.category,
          description: report.description,
          description_summary: report.description.substring(0, 100),
          amount_lost: report.amount_lost,
          transaction_date: admin.firestore.Timestamp.fromDate(report.transaction_date),
          reported_at: admin.firestore.Timestamp.fromDate(report.transaction_date),
          verified: report.verified,
          status: report.verified ? 'verified' : 'pending',
          severity: report.amount_lost > 100000 ? 'high' : report.amount_lost > 50000 ? 'medium' : 'low',
          is_demo: true,
          reporter_id: 'demo_user',
          votes_helpful: Math.floor(Math.random() * 50) + 10,
          votes_not_helpful: Math.floor(Math.random() * 5),
        });
      }

      console.log(`✅ Seeded scam account: ${account.accountNumber} (${account.businessName}) - ${totalReports} reports`);
    }

    // Seed demo verified businesses
    console.log('\n✅ Seeding demo verified businesses...\n');
    
    for (const business of DEMO_VERIFIED_BUSINESSES) {
      const accountHash = hashAccount(business.accountNumber, business.bankCode);
      
      // Create demo business
      const businessDoc = await db.collection('demo_businesses').add({
        business_name: business.businessName,
        account_number_hash: accountHash,
        bank_code: business.bankCode,
        tier: business.tier,
        verification_status: 'approved',
        trust_score: business.trust_score,
        rating: business.rating,
        review_count: business.review_count,
        location: business.location,
        is_demo: true,
        verified: business.verified,
        verified_at: admin.firestore.Timestamp.fromDate(new Date('2023-02-01')),
        created_at: admin.firestore.Timestamp.fromDate(new Date('2023-01-15')),
      });

      // Create demo account linked to business
      await db.collection('demo_accounts').doc(accountHash).set({
        account_hash: accountHash,
        bank_code: business.bankCode,
        business_name: business.businessName,
        trust_score: business.trust_score,
        risk_level: 'low',
        is_demo: true,
        checks: {
          check_count: Math.floor(Math.random() * 200) + 50,
          proceed_rate: 0.87, // 87% proceed (high trust)
          fraud_reports: {
            total: 0,
            recent_30_days: 0,
          },
          first_checked: admin.firestore.Timestamp.fromDate(new Date('2023-02-15')),
          last_checked: admin.firestore.Timestamp.now(),
          flags: [],
          verified_business_id: businessDoc.id,
        },
        created_at: admin.firestore.Timestamp.now(),
      });

      // Create demo reviews
      for (const review of business.reviews) {
        await db.collection('demo_reviews').add({
          business_id: businessDoc.id,
          rating: review.rating,
          comment: review.comment,
          reviewer_name: review.reviewer_name,
          verified_purchase: review.verified_purchase,
          is_demo: true,
          created_at: admin.firestore.Timestamp.fromDate(review.created_at),
          helpful_votes: Math.floor(Math.random() * 30) + 5,
        });
      }

      console.log(`✅ Seeded verified business: ${business.businessName} (${business.review_count} reviews, ${business.rating}★)`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✨ Demo data seeding complete!\n');
    console.log('📊 Summary:');
    console.log(`   - ${DEMO_SCAM_ACCOUNTS.length} scam accounts`);
    console.log(`   - ${DEMO_SCAM_ACCOUNTS.reduce((sum, acc) => sum + acc.reports.length, 0)} fraud reports`);
    console.log(`   - ${DEMO_VERIFIED_BUSINESSES.length} verified businesses`);
    console.log(`   - ${DEMO_VERIFIED_BUSINESSES.reduce((sum, bus) => sum + bus.reviews.length, 0)} business reviews`);
    console.log('\n🧪 Test these accounts in AccountCheck:');
    console.log('   HIGH RISK:');
    DEMO_SCAM_ACCOUNTS.forEach(acc => {
      console.log(`   - ${acc.accountNumber} (${acc.bankCode}) - ${acc.businessName}`);
    });
    console.log('\n   VERIFIED BUSINESSES:');
    DEMO_VERIFIED_BUSINESSES.forEach(bus => {
      console.log(`   - ${bus.accountNumber} (${bus.bankCode}) - ${bus.businessName}`);
    });
    console.log('\n   NO DATA:');
    console.log('   - Any other account number (e.g., 1234567890)\n');

  } catch (error) {
    console.error('\n❌ Error seeding demo data:', error);
    throw error;
  }
}

// Run the seeding
seedDemoData()
  .then(() => {
    console.log('✅ Seeding completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  });
