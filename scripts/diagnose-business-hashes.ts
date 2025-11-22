import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Helper function to hash account number
function hashAccountNumber(accountNumber: string): string {
  return crypto.createHash('sha256').update(accountNumber).digest('hex');
}

// Helper to check if string is Base64
function isBase64(str: string): boolean {
  if (!str || str.length === 0) return false;
  // SHA-256 hex is always 64 characters of hexadecimal
  if (str.length === 64 && /^[a-f0-9]+$/i.test(str)) return false;
  // Base64 is typically shorter and contains different characters
  return str.length < 64 && /^[A-Za-z0-9+/=]+$/.test(str);
}

// Helper to decode Base64
function base64Decode(encoded: string): string {
  try {
    return Buffer.from(encoded, 'base64').toString('utf-8');
  } catch (error) {
    throw new Error(`Failed to decode Base64: ${error.message}`);
  }
}

async function diagnoseBusinessHashes() {
  try {
    console.log('🔍 DIAGNOSTIC: Checking Business Account Hashes\n');
    console.log('=' .repeat(60));

    // Initialize Firebase Admin
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\\\n/g, '\\n');
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

    if (!projectId || !privateKey || !clientEmail) {
      console.error('\n❌ FIREBASE CREDENTIALS CHECK:');
      console.error('   FIREBASE_PROJECT_ID:', projectId ? '✅ Found' : '❌ Missing');
      console.error('   FIREBASE_PRIVATE_KEY:', privateKey ? '✅ Found' : '❌ Missing');
      console.error('   FIREBASE_CLIENT_EMAIL:', clientEmail ? '✅ Found' : '❌ Missing');
      console.error('\n💡 SOLUTION: Add these to backend/.env:');
      console.error('   1. Go to: https://console.firebase.google.com/project/confirmit-8e623/settings/serviceaccounts/adminsdk');
      console.error('   2. Click "Generate new private key"');
      console.error('   3. Copy credentials from the downloaded JSON to backend/.env\n');
      process.exit(1);
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          privateKey,
          clientEmail,
        }),
      });
    }

    const db = admin.firestore();
    const businessesSnapshot = await db.collection('businesses').get();

    console.log(`\n📊 Total Businesses: ${businessesSnapshot.size}\n`);

    if (businessesSnapshot.empty) {
      console.log('⚠️  No businesses found in database!');
      process.exit(0);
    }

    let base64Count = 0;
    let sha256Count = 0;
    let missingCount = 0;
    let approvedCount = 0;

    console.log('Business Details:');
    console.log('-'.repeat(60));

    businessesSnapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      const businessName = data.name || 'Unnamed Business';
      const accountEncrypted = data.bank_account?.number_encrypted;
      const isApproved = data.verification?.verified === true;

      if (isApproved) approvedCount++;

      console.log(`\n${index + 1}. ${businessName}`);
      console.log(`   ID: ${doc.id}`);
      console.log(`   Approved: ${isApproved ? '✅ Yes' : '❌ No'}`);

      if (!accountEncrypted) {
        console.log(`   Account Hash: ❌ MISSING`);
        missingCount++;
      } else if (isBase64(accountEncrypted)) {
        console.log(`   Account Hash: ⚠️  Base64 (NEEDS MIGRATION)`);
        console.log(`   Value: ${accountEncrypted}`);
        base64Count++;
        
        // Try to decode and show what the correct hash should be
        try {
          const decoded = base64Decode(accountEncrypted);
          if (decoded.length === 10 && /^\d+$/.test(decoded)) {
            const correctHash = hashAccountNumber(decoded);
            console.log(`   Decoded: ${decoded.slice(0, 3)}***${decoded.slice(-2)}`);
            console.log(`   Should be: ${correctHash}`);
          }
        } catch (e) {
          console.log(`   ⚠️  Could not decode Base64`);
        }
      } else {
        console.log(`   Account Hash: ✅ SHA-256`);
        console.log(`   Value: ${accountEncrypted}`);
        sha256Count++;
      }
    });

    console.log('\n' + '='.repeat(60));
    console.log('\n📈 SUMMARY:');
    console.log(`   Total Businesses: ${businessesSnapshot.size}`);
    console.log(`   Approved Businesses: ${approvedCount}`);
    console.log(`   ✅ SHA-256 Hashed: ${sha256Count}`);
    console.log(`   ⚠️  Base64 Encoded: ${base64Count} (needs migration)`);
    console.log(`   ❌ Missing Hash: ${missingCount}`);

    if (base64Count > 0) {
      console.log('\n⚠️  ACTION REQUIRED:');
      console.log(`   ${base64Count} business(es) need migration from Base64 to SHA-256`);
      console.log('   Run: npx ts-node scripts/migrate-business-account-hashes.ts');
    } else if (sha256Count === businessesSnapshot.size - missingCount) {
      console.log('\n✅ ALL BUSINESSES PROPERLY HASHED!');
      console.log('   If account checks still fail, the issue is elsewhere.');
    }

    console.log('\n' + '='.repeat(60));

  } catch (error) {
    console.error('\n❌ DIAGNOSTIC FAILED:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run diagnostic
diagnoseBusinessHashes()
  .then(() => {
    console.log('\n✅ Diagnostic complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Diagnostic failed:', error);
    process.exit(1);
  });
