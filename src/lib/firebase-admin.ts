import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// In a managed environment like App Hosting or Cloud Functions,
// initializeApp() can be called without arguments to use the application
// default credentials.
if (!admin.apps.length) {
  admin.initializeApp();
}

const adminDb = getFirestore();

export { adminDb };
