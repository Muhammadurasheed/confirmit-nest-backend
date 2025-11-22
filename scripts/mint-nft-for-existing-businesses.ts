import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { HederaService } from '../src/modules/hedera/hedera.service';

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
 * Mint NFTs for existing approved businesses that don't have NFTs yet
 */
async function mintNftsForExistingBusinesses() {
  console.log('\n🎨 Minting Trust ID NFTs for Existing Businesses\n');
  console.log('='.repeat(60));

  try {
    // Initialize HederaService
    const hederaService = new HederaService();

    // Get all approved businesses
    const snapshot = await db
      .collection('businesses')
      .where('verification.status', '==', 'approved')
      .get();

    if (snapshot.empty) {
      console.log('\n⚠️  No approved businesses found.');
      return;
    }

    console.log(`\n📋 Found ${snapshot.size} approved business(es)\n`);

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (const doc of snapshot.docs) {
      const business = doc.data();
      const businessId = doc.id;

      console.log(`\n🏢 Processing: ${business.name} (${businessId})`);

      // Skip if already has NFT
      if (business.hedera?.trust_id_nft?.token_id) {
        console.log(`   ⏭️  Already has NFT: ${business.hedera.trust_id_nft.serial_number}`);
        skippedCount++;
        continue;
      }

      try {
        // Mint NFT
        const nftData = await hederaService.mintTrustIdNFT(
          businessId,
          business.name,
          business.trust_score || 50,
          business.verification.tier || 1
        );

        // Update business document
        await db.collection('businesses').doc(businessId).update({
          hedera: {
            trust_id_nft: {
              token_id: nftData.token_id,
              serial_number: nftData.serial_number,
              explorer_url: nftData.explorer_url,
            },
          },
        });

        console.log(`   ✅ NFT Minted: ${nftData.serial_number}`);
        console.log(`   🔗 Explorer: ${nftData.explorer_url}`);
        successCount++;
      } catch (error: any) {
        console.error(`   ❌ Failed: ${error.message}`);
        failCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n📊 Summary:');
    console.log(`   ✅ Successfully minted: ${successCount}`);
    console.log(`   ⏭️  Skipped (already has NFT): ${skippedCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`   📦 Total businesses: ${snapshot.size}`);
    console.log('\n' + '='.repeat(60) + '\n');
  } catch (error) {
    console.error('\n❌ ERROR:', error);
    throw error;
  }
}

// Run the script
mintNftsForExistingBusinesses()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
