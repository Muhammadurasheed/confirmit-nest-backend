import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  }),
});

const db = admin.firestore();

async function clearAllAccountCache() {
  console.log('\n🧹 CLEARING ALL ACCOUNT CACHE\n');
  console.log('='.repeat(60));
  
  try {
    // Get all accounts
    const accountsSnapshot = await db.collection('accounts').get();
    
    console.log(`📊 Total cached accounts: ${accountsSnapshot.size}`);
    
    if (accountsSnapshot.empty) {
      console.log('✅ No cache to clear');
      return;
    }
    
    // Delete all accounts
    const batch = db.batch();
    let deleteCount = 0;
    
    accountsSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
      deleteCount++;
    });
    
    await batch.commit();
    
    console.log(`\n✅ Deleted ${deleteCount} cached account entries`);
    console.log('\n💡 Next account check will fetch fresh data from businesses collection');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Error clearing cache:', error);
    throw error;
  } finally {
    // Clean up
    await admin.app().delete();
  }
}

// Run the script
clearAllAccountCache()
  .then(() => {
    console.log('\n✨ Cache clearing complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
