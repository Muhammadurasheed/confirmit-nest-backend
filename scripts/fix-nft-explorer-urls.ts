/**
 * Migration Script: Fix NFT Explorer URLs
 * 
 * Problem: Existing NFTs have explorer URLs without serial numbers
 * Solution: Update all business documents to include serial number in URL
 * 
 * Usage:
 *   cd backend
 *   npx ts-node scripts/fix-nft-explorer-urls.ts
 */

import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

const db = admin.firestore();
const NETWORK = process.env.HEDERA_NETWORK || 'testnet';

async function fixNftExplorerUrls() {
  console.log('🔍 Scanning for businesses with NFTs...\n');

  try {
    const businessesSnapshot = await db
      .collection('businesses')
      .where('hedera.trust_id_nft', '!=', null)
      .get();

    if (businessesSnapshot.empty) {
      console.log('ℹ️  No businesses with NFTs found.');
      return;
    }

    console.log(`📊 Found ${businessesSnapshot.size} businesses with NFTs\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const doc of businessesSnapshot.docs) {
      const business = doc.data();
      const businessName = business.business_name || doc.id;
      const nft = business.hedera?.trust_id_nft;
      
      if (!nft || !nft.token_id || !nft.serial_number) {
        console.log(`⚠️  Skipping ${businessName}: Missing token_id or serial_number`);
        errorCount++;
        continue;
      }

      // Check if URL already has serial number
      if (nft.explorer_url && nft.explorer_url.includes(`/${nft.serial_number}`)) {
        console.log(`✅ ${businessName}: Already has correct URL`);
        successCount++;
        continue;
      }

      // Construct new URL with serial number
      const newUrl = `https://hashscan.io/${NETWORK}/token/${nft.token_id}/${nft.serial_number}`;
      
      try {
        await doc.ref.update({
          'hedera.trust_id_nft.explorer_url': newUrl
        });
        
        console.log(`✅ ${businessName}: Updated URL`);
        console.log(`   Old: ${nft.explorer_url || 'N/A'}`);
        console.log(`   New: ${newUrl}\n`);
        successCount++;
      } catch (error) {
        console.error(`❌ ${businessName}: Failed to update`);
        console.error(`   Error: ${error.message}\n`);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📈 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully updated: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📊 Total processed: ${businessesSnapshot.size}`);
    console.log('='.repeat(60) + '\n');

    if (successCount > 0) {
      console.log('🎉 Migration completed! All NFT explorer URLs now include serial numbers.\n');
      console.log('🔗 Test by visiting any business profile and clicking "View on Hedera Explorer"');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    // Close Firestore connection
    await db.terminate();
  }
}

// Run the migration
fixNftExplorerUrls()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
