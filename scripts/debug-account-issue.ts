import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Initialize Firebase Admin
if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!projectId || !privateKey || !clientEmail) {
    console.error('❌ Missing Firebase credentials:');
    console.error('FIREBASE_PROJECT_ID:', projectId ? '✓' : '✗');
    console.error('FIREBASE_PRIVATE_KEY:', privateKey ? '✓' : '✗');
    console.error('FIREBASE_CLIENT_EMAIL:', clientEmail ? '✓' : '✗');
    throw new Error('Missing required Firebase environment variables');
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      privateKey,
      clientEmail,
    }),
  });
}

const db = admin.firestore();

function hashAccountNumber(accountNumber: string): string {
  return crypto.createHash('sha256').update(accountNumber).digest('hex');
}

async function debugAccountIssue() {
  console.log('\n🔍 DEEP DIVE DEBUG: Account Check Issue\n');
  console.log('='.repeat(70));

  // Test account numbers from user
  const testAccounts = ['8162958127', '9032068646'];

  for (const accountNumber of testAccounts) {
    console.log(`\n📱 Testing Account: ${accountNumber}`);
    console.log('-'.repeat(70));

    const accountHash = hashAccountNumber(accountNumber);
    console.log(`🔐 SHA-256 Hash: ${accountHash}`);

    // 1. Check if account exists in accounts collection (cache)
    console.log('\n1️⃣ Checking accounts collection (cache):');
    const accountDoc = await db.collection('accounts').doc(accountHash).get();
    
    if (accountDoc.exists) {
      const data = accountDoc.data();
      console.log('   ✅ Found cached account data');
      console.log(`   📊 Trust Score: ${data.trust_score}`);
      console.log(`   🎯 Risk Level: ${data.risk_level}`);
      console.log(`   🏢 Verified Business ID: ${data.checks?.verified_business_id || 'NULL'}`);
      console.log(`   🕐 Last Checked: ${data.checks?.last_checked?.toDate() || 'N/A'}`);
      console.log(`   🔢 Check Count: ${data.checks?.check_count || 0}`);
      
      // Check if cache is fresh (within 1 hour)
      const lastChecked = data.checks?.last_checked?.toDate();
      if (lastChecked) {
        const ageMinutes = (Date.now() - lastChecked.getTime()) / (60 * 1000);
        console.log(`   ⏰ Cache Age: ${ageMinutes.toFixed(2)} minutes`);
        console.log(`   ${ageMinutes < 60 ? '⚠️  Cache is FRESH (will be used)' : '✅ Cache is STALE (will refresh)'}`);
      }
    } else {
      console.log('   ❌ No cached account data found');
    }

    // 2. Check businesses collection for matching account
    console.log('\n2️⃣ Checking businesses collection:');
    
    // First, find ALL businesses with this hash
    const allBusinessesQuery = await db
      .collection('businesses')
      .where('bank_account.number_encrypted', '==', accountHash)
      .get();
    
    console.log(`   📊 Total businesses with this account: ${allBusinessesQuery.size}`);
    
    if (!allBusinessesQuery.empty) {
      allBusinessesQuery.docs.forEach((doc, index) => {
        const business = doc.data();
        console.log(`\n   Business ${index + 1}:`);
        console.log(`   📋 ID: ${doc.id}`);
        console.log(`   🏢 Name: ${business.name || business.business_name}`);
        console.log(`   ✅ Verified: ${business.verification?.verified ? 'YES' : 'NO'}`);
        console.log(`   📈 Status: ${business.verification?.status}`);
        console.log(`   💰 Tier: ${business.verification?.tier}`);
        console.log(`   🔐 Hash: ${business.bank_account?.number_encrypted?.slice(0, 20)}...`);
        
        if (business.verification?.verified) {
          console.log(`   🎉 THIS BUSINESS SHOULD APPEAR AS VERIFIED!`);
        }
      });
    } else {
      console.log('   ❌ No businesses found with this account');
      
      // Let's check if there are ANY approved businesses at all
      const anyApproved = await db
        .collection('businesses')
        .where('verification.verified', '==', true)
        .limit(1)
        .get();
      
      console.log(`\n   🔍 Sanity check: ${anyApproved.size} approved business(es) exist in database`);
    }

    // 3. Try the exact query that accounts.service.ts uses
    console.log('\n3️⃣ Running exact query from accounts.service.ts:');
    try {
      const exactQuery = await db
        .collection('businesses')
        .where('bank_account.number_encrypted', '==', accountHash)
        .where('verification.verified', '==', true)
        .limit(1)
        .get();
      
      console.log(`   📊 Query result: ${exactQuery.size} verified business(es) found`);
      
      if (!exactQuery.empty) {
        const business = exactQuery.docs[0].data();
        console.log(`   ✅ MATCH FOUND!`);
        console.log(`   🏢 Business: ${business.name || business.business_name}`);
        console.log(`   📈 Trust Score: ${business.trust_score}`);
      } else {
        console.log(`   ❌ NO MATCH - This is why account shows UNKNOWN`);
      }
    } catch (error) {
      console.log(`   ❌ Query failed: ${error.message}`);
      if (error.message.includes('index')) {
        console.log(`   ⚠️  Missing Firestore index!`);
      }
    }

    // 4. SOLUTION: Delete cache if it exists
    if (accountDoc.exists) {
      console.log('\n4️⃣ RESOLUTION:');
      console.log('   🔄 Deleting stale cache to force refresh...');
      
      try {
        await db.collection('accounts').doc(accountHash).delete();
        console.log('   ✅ Cache deleted successfully');
        console.log('   💡 Next account check will fetch fresh data from businesses collection');
      } catch (error) {
        console.log(`   ❌ Failed to delete cache: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(70));
  }

  console.log('\n✨ DEBUG COMPLETE\n');
  console.log('📝 SUMMARY:');
  console.log('   If cache was deleted above, try checking the accounts again in the UI');
  console.log('   They should now show as VERIFIED BUSINESS if approved');
  console.log('');
}

debugAccountIssue()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Debug script failed:', error);
    process.exit(1);
  });
