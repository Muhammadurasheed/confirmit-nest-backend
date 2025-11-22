import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  }),
});

const db = admin.firestore();

/**
 * Hash account number for storage
 */
function hashAccount(accountNumber: string, bankCode: string): string {
  const salt = 'confirmit_secure_salt_2025';
  return crypto
    .createHash('sha256')
    .update(`${accountNumber}-${bankCode}-${salt}`)
    .digest('hex');
}

/**
 * Add a fraud report for a scammer account
 */
async function addFraudReport() {
  console.log('\n🚨 Add Fraud Report to ConfirmIT\n');
  console.log('='.repeat(60));

  // Your friend's scammer details
  const accountNumber = '0123456789'; // REPLACE WITH ACTUAL ACCOUNT NUMBER
  const bankCode = '044'; // REPLACE WITH ACTUAL BANK CODE (e.g., 044 for Access Bank)
  const businessName = 'Fake Electronics Store'; // REPLACE WITH SCAMMER'S NAME
  const category = 'false_business'; // Options: false_business, fake_receipt, fake_product, phishing, advance_fee_fraud
  const description = 'This business took payment but never delivered the products. Multiple attempts to contact them failed.'; // REPLACE WITH DESCRIPTION
  const amountLost = 150000; // REPLACE WITH AMOUNT (in Naira)
  const transactionDate = '2025-01-15'; // REPLACE WITH DATE (YYYY-MM-DD)
  const reportedBy = 'Your Friend Name'; // REPLACE WITH REPORTER NAME
  const reporterEmail = 'friend@example.com'; // REPLACE WITH REPORTER EMAIL

  try {
    const accountHash = hashAccount(accountNumber, bankCode);

    // 1. Check if account already exists
    let accountRef = db.collection('accounts').doc(accountHash);
    let accountDoc = await accountRef.get();

    if (!accountDoc.exists) {
      // Create new account entry
      console.log(`\n📝 Creating account entry for ${accountNumber}...`);
      await accountRef.set({
        account_hash: accountHash,
        bank_code: bankCode,
        business_name: businessName,
        risk_level: 'high',
        trust_score: 0,
        is_verified: false,
        fraud_report_count: 1,
        total_amount_lost: amountLost,
        first_reported: admin.firestore.FieldValue.serverTimestamp(),
        last_reported: admin.firestore.FieldValue.serverTimestamp(),
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log('✅ Account entry created');
    } else {
      // Update existing account
      console.log(`\n📝 Updating existing account entry...`);
      const existingData = accountDoc.data();
      await accountRef.update({
        fraud_report_count: admin.firestore.FieldValue.increment(1),
        total_amount_lost: admin.firestore.FieldValue.increment(amountLost),
        last_reported: admin.firestore.FieldValue.serverTimestamp(),
        risk_level: 'high', // Escalate risk
        trust_score: Math.max(0, (existingData?.trust_score || 0) - 15), // Decrease trust score
      });
      console.log('✅ Account entry updated');
    }

    // 2. Add fraud report
    console.log(`\n🚨 Creating fraud report...`);
    const reportId = `FR-${Date.now()}-${Math.random().toString(36).substring(7)}`.toUpperCase();
    
    await db.collection('fraud_reports').doc(reportId).set({
      report_id: reportId,
      account_hash: accountHash,
      category,
      description,
      amount_lost: amountLost,
      transaction_date: transactionDate,
      reported_by: reportedBy,
      reporter_email: reporterEmail,
      status: 'verified', // Options: pending, verified, resolved
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ Fraud report created');
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ SUCCESS! Fraud report added to ConfirmIT');
    console.log('\n📊 Summary:');
    console.log(`   Account Number: ${accountNumber}`);
    console.log(`   Bank Code: ${bankCode}`);
    console.log(`   Business Name: ${businessName}`);
    console.log(`   Amount Lost: ₦${amountLost.toLocaleString()}`);
    console.log(`   Report ID: ${reportId}`);
    console.log('\n🔍 Test by searching this account in AccountCheck!');
    console.log('\n' + '='.repeat(60) + '\n');
  } catch (error) {
    console.error('\n❌ ERROR:', error);
    throw error;
  }
}

// Run the script
addFraudReport()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
