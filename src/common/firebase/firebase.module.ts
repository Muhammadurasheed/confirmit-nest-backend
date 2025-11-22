import { Module, Global, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Global()
@Module({
  providers: [
    {
      provide: 'FIREBASE_ADMIN',
      useFactory: async (configService: ConfigService) => {
        if (!admin.apps.length) {
          const projectId = configService.get<string>('firebase.projectId');
          const privateKey = configService
            .get<string>('firebase.privateKey')
            ?.replace(/\\n/g, '\n');
          const clientEmail = configService.get<string>('firebase.clientEmail');
          const databaseURL = configService.get<string>('firebase.databaseURL');

          if (!projectId || !privateKey || !clientEmail) {
            console.error('⚠️ Firebase configuration incomplete', {
              projectId,
              hasPrivateKey: !!privateKey,
              clientEmail,
            });
            throw new Error('Firebase configuration missing.');
          }

          admin.initializeApp({
            credential: admin.credential.cert({
              projectId,
              privateKey,
              clientEmail,
            }),
            databaseURL,
            storageBucket: `${projectId}.appspot.com`,
          });

          console.log('✅ Firebase Admin initialized');
        }

        return admin;
      },
      inject: [ConfigService],
    },
    {
      provide: 'FIRESTORE',
      useFactory: () => {
        if (!admin.apps.length)
          throw new Error('Firebase not initialized before Firestore');
        
        const firestore = admin.firestore();
        
        // ⚡️ CRITICAL: Apply settings IMMEDIATELY after getting Firestore instance
        firestore.settings({
          ignoreUndefinedProperties: true,
        });
        
        console.log('✅ Firestore client configured with ignoreUndefinedProperties=true');
        
        return firestore;
      },
    },
    {
      provide: 'FIREBASE_AUTH',
      useFactory: () => {
        if (!admin.apps.length)
          throw new Error('Firebase not initialized before Auth');
        return admin.auth();
      },
    },
    {
      provide: 'FIREBASE_STORAGE',
      useFactory: () => {
        if (!admin.apps.length)
          throw new Error('Firebase not initialized before Storage');
        return admin.storage();
      },
    },
  ],
  exports: ['FIREBASE_ADMIN', 'FIRESTORE', 'FIREBASE_AUTH', 'FIREBASE_STORAGE'],
})
export class FirebaseModule implements OnModuleInit {
  onModuleInit() {
    if (!admin.apps.length) {
      console.error('❌ Firebase still not initialized — check config mapping.');
    }
  }
}
