/**
 * Migration Script: Update Business Account Number Hashing
 * 
 * This script migrates existing businesses from Base64 encoding to SHA-256 hashing
 * for bank account numbers to match the new hashing algorithm.
 * 
 * IMPORTANT: This is a ONE-TIME migration. Run only once!
 * 
 * Usage:
 *   npx ts-node backend/scripts/migrate-business-account-hashes.ts
 */

import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables (try backend/.env first, then root .env)
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

function base64Decode(encoded: string): string {
  return Buffer.from(encoded, 'base64').toString('utf-8');
}

async function migrateBusinessAccounts() {
  console.log('🚀 Starting business account hash migration...\n');

  try {
    // Get all businesses
    const snapshot = await db.collection('businesses').get();
    
    if (snapshot.empty) {
      console.log('❌ No businesses found in database');
      return;
    }

    console.log(`📊 Found ${snapshot.size} businesses to check\n`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const doc of snapshot.docs) {
      const businessId = doc.id;
      const business = doc.data();
      
      try {
        const numberEncrypted = business.bank_account?.number_encrypted;
        
        if (!numberEncrypted) {
          console.log(`⚠️  ${businessId} - No bank account number, skipping`);
          skipped++;
          continue;
        }

        // Check if it's Base64 encoded (old format) or SHA-256 hash (new format)
        // SHA-256 hashes are always 64 characters hex
        const isSHA256 = /^[a-f0-9]{64}$/.test(numberEncrypted);
        
        if (isSHA256) {
          console.log(`✅ ${businessId} (${business.name}) - Already using SHA-256, skipping`);
          skipped++;
          continue;
        }

        // Try to decode Base64 and re-hash with SHA-256
        try {
          const decodedAccountNumber = base64Decode(numberEncrypted);
          
          // Validate it looks like an account number (10 digits for Nigerian accounts)
          if (!/^\d{10}$/.test(decodedAccountNumber)) {
            console.log(`⚠️  ${businessId} (${business.name}) - Decoded value doesn't look like an account number: ${decodedAccountNumber}, skipping`);
            skipped++;
            continue;
          }

          const newHash = hashAccountNumber(decodedAccountNumber);
          
          // Update the document
          await db.collection('businesses').doc(businessId).update({
            'bank_account.number_encrypted': newHash,
          });
          
          console.log(`✅ ${businessId} (${business.name}) - Migrated successfully`);
          console.log(`   Old (Base64): ${numberEncrypted.slice(0, 20)}...`);
          console.log(`   New (SHA-256): ${newHash.slice(0, 20)}...\n`);
          
          migrated++;
        } catch (decodeError) {
          console.log(`⚠️  ${businessId} (${business.name}) - Could not decode, might already be migrated or invalid format, skipping`);
          skipped++;
          continue;
        }
      } catch (error) {
        console.error(`❌ ${businessId} - Error: ${error.message}`);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ MIGRATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`📊 Total businesses: ${snapshot.size}`);
    console.log(`✅ Migrated: ${migrated}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration
migrateBusinessAccounts()
  .then(() => {
    console.log('✅ Migration script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  });
