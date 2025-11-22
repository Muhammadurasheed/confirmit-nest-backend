import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as crypto from 'crypto';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Initialize Firebase Admin
if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!projectId || !privateKey || !clientEmail) {
    console.error('❌ Missing Firebase credentials');
    process.exit(1);
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

async function testAccountLookup() {
  console.log('\n🔬 ACCOUNT LOOKUP DIAGNOSTIC TEST\n');
  console.log('='.repeat(70));
  
  // Test accounts provided by user
  const testAccounts = ['8162958127', '9032068646', '0133695252'];
  
  for (const accountNumber of testAccounts) {
    console.log(`\n\n📱 Testing Account: ${accountNumber}`);
    console.log('─'.repeat(70));
    
    // Hash the account number
    const accountHash = crypto.createHash('sha256')
      .update(accountNumber)
      .digest('hex');
    
    console.log(`🔐 SHA-256 Hash: ${accountHash}`);
    
    // Step 1: Check all approved businesses
    console.log(`\n📊 Step 1: Checking all approved businesses...`);
    try {
      const allApprovedSnapshot = await db
        .collection('businesses')
        .where('verification.verified', '==', true)
        .get();
      
      console.log(`   ✅ Found ${allApprovedSnapshot.size} approved businesses`);
      
      let hashMatches = 0;
      allApprovedSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.bank_account?.number_encrypted === accountHash) {
          hashMatches++;
          console.log(`\n   🎯 MATCH FOUND!`);
          console.log(`   📋 Business: ${data.business_name}`);
          console.log(`   🆔 ID: ${doc.id}`);
          console.log(`   📍 Location: ${data.location || 'N/A'}`);
          console.log(`   ⭐ Trust Score: ${data.trust_score || 'N/A'}`);
          console.log(`   🏆 Tier: ${data.tier || 'N/A'}`);
          console.log(`   ✓ Verified: ${data.verification?.verified ? 'Yes' : 'No'}`);
        }
      });
      
      if (hashMatches === 0) {
        console.log(`   ⚠️  No approved businesses with this account hash`);
      } else {
        console.log(`\n   📈 Total matches: ${hashMatches}`);
      }
    } catch (error) {
      console.error(`   ❌ Error querying approved businesses: ${error.message}`);
    }
    
    // Step 2: Try the composite query (this might fail if index doesn't exist)
    console.log(`\n📊 Step 2: Testing composite query...`);
    try {
      const compositeSnapshot = await db
        .collection('businesses')
        .where('bank_account.number_encrypted', '==', accountHash)
        .where('verification.verified', '==', true)
        .limit(1)
        .get();
      
      if (!compositeSnapshot.empty) {
        const businessDoc = compositeSnapshot.docs[0];
        const data = businessDoc.data();
        console.log(`   ✅ Composite query SUCCESS!`);
        console.log(`   📋 Found: ${data.business_name}`);
      } else {
        console.log(`   ⚠️  Composite query returned no results`);
      }
    } catch (error: any) {
      if (error.message.includes('index')) {
        console.error(`   ❌ MISSING FIRESTORE INDEX!`);
        console.error(`   📝 This is the ROOT CAUSE of the issue.`);
        console.error(`\n   🔧 CREATE INDEX HERE:`);
        console.error(`   ${error.message.match(/(https:\/\/console\.firebase[^\s]+)/)?.[1] || 'Check Firebase Console'}`);
        console.error(`\n   OR use this direct link:`);
        console.error(`   https://console.firebase.google.com/v1/r/project/confirmit-8e623/firestore/indexes?create_composite=ClJwcm9qZWN0cy9jb25maXJtaXQtOGU2MjMvZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL2J1c2luZXNzZXMvaW5kZXhlcy9fEAEaJQohYmFua19hY2NvdW50Lm51bWJlcl9lbmNyeXB0ZWQQARobChdkZXJpZmljYXRpb24udmVyaWZpZWQQARoMCghfX25hbWVfXxAC`);
      } else {
        console.error(`   ❌ Query error: ${error.message}`);
      }
    }
    
    // Step 3: Check if hash exists with ANY verification status
    console.log(`\n📊 Step 3: Checking for hash regardless of verification...`);
    try {
      const anySnapshot = await db
        .collection('businesses')
        .where('bank_account.number_encrypted', '==', accountHash)
        .get();
      
      console.log(`   ✅ Found ${anySnapshot.size} businesses with this hash (any status)`);
      
      anySnapshot.docs.forEach(doc => {
        const data = doc.data();
        console.log(`\n   📋 Business: ${data.business_name}`);
        console.log(`      Status: ${data.verification?.verified ? '✅ Approved' : '⏳ Pending'}`);
        console.log(`      ID: ${doc.id}`);
      });
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('\n💡 SUMMARY:\n');
  console.log('If "MISSING FIRESTORE INDEX" error appeared above:');
  console.log('1. Click the provided link to create the index');
  console.log('2. Wait 2-5 minutes for index to build');
  console.log('3. Test account check again');
  console.log('\nIf no matches found:');
  console.log('1. Account may not be registered in system');
  console.log('2. Business may not be approved yet');
  console.log('3. Different account number used during registration');
  console.log('\n' + '='.repeat(70) + '\n');
}

testAccountLookup()
  .then(() => {
    console.log('✅ Diagnostic complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
