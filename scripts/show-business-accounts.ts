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

async function showBusinessAccounts() {
  console.log('\n🔍 APPROVED BUSINESS ACCOUNT ANALYSIS\n');
  console.log('='.repeat(60));
  
  const snapshot = await db.collection('businesses')
    .where('verification.verified', '==', true)
    .get();
  
  console.log(`\n📊 Found ${snapshot.size} approved businesses\n`);
  
  // Extended list of test account numbers to check
  const testAccounts = [
    '0123456789', '1234567890', '9876543210', '0987654321',
    '8166600027', '2345678901', '3456789012', '4567890123',
    '5678901234', '6789012345', '7890123456', '8901234567',
    '9012345678', '0111111111', '0222222222', '0333333333',
  ];
  
  // Group businesses by their hash for easier analysis
  const businessesByHash: Map<string, any[]> = new Map();
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const accountHash = data.bank_account?.number_encrypted;
    
    if (!businessesByHash.has(accountHash)) {
      businessesByHash.set(accountHash, []);
    }
    businessesByHash.get(accountHash)?.push({ id: doc.id, ...data });
  }
  
  console.log(`\n📊 Found ${businessesByHash.size} unique account hashes\n`);
  
  let hashIndex = 1;
  for (const [accountHash, businesses] of businessesByHash.entries()) {
    console.log(`\n${'━'.repeat(60)}`);
    console.log(`🔐 Hash Group ${hashIndex++}:`);
    console.log(`   Hash: ${accountHash}`);
    console.log(`   Businesses using this account: ${businesses.length}`);
    
    // List all businesses with this hash
    businesses.forEach((biz, idx) => {
      console.log(`   ${idx + 1}. ${biz.business_name || 'Unnamed'} (${biz.id})`);
      console.log(`      Tier: ${biz.tier || 'N/A'}, Location: ${biz.location || 'N/A'}`);
    });
    
    // Check if hash matches any test accounts
    let foundMatch = false;
    for (const testNum of testAccounts) {
      const testHash = crypto.createHash('sha256')
        .update(testNum)
        .digest('hex');
      
      if (testHash === accountHash) {
        console.log(`\n   ✅ MATCH FOUND!`);
        console.log(`   📱 Account Number: ${testNum}`);
        console.log(`   🎯 Use this number to test in Account Check!`);
        foundMatch = true;
        break;
      }
    }
    
    if (!foundMatch) {
      console.log(`\n   ⚠️  No match in test account set`);
      console.log(`   💡 This is likely a real account number entered during registration`);
      console.log(`   📋 To find it, check the Firebase Console or your registration records`);
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('\n💡 TESTING RECOMMENDATIONS:\n');
  console.log('1. Use ANY of the account numbers marked with ✅ MATCH FOUND above');
  console.log('2. Those are the ONLY accounts that will show "VERIFIED BUSINESS"');
  console.log('3. Testing with any other number will show "UNKNOWN" (expected)');
  console.log('\n📝 If NO matches found:');
  console.log('   → The account numbers used during registration are not in our test set');
  console.log('   → Check Firebase Console: Firestore → businesses → [business] → bank_account');
  console.log('   → Or register a new business with a known test account (e.g., 0123456789)');
  console.log('\n🔥 CRITICAL: Create missing Firestore index first!');
  console.log('   Click: https://console.firebase.google.com/v1/r/project/confirmit-8e623/firestore/indexes?create_composite=ClZwcm9qZWN0cy9jb25maXJtaXQtOGU2MjMvZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL2FjY291bnRfY2hlY2tzL2luZGV4ZXMvXxABGiEKHXZlcmlmaWVkX2J1c2luZXNzLmJ1c2luZXNzX2lkEAEaDgoKY3JlYXRlZF9hdBACGgwKCF9fbmFtZV9fEAI');
  console.log('\n' + '='.repeat(60));
}

showBusinessAccounts()
  .then(() => {
    console.log('\n✅ Analysis complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
