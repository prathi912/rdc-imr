
import * as admin from 'firebase-admin';

// This function must be idempotent, so we check if an app is already initialized.
function initializeAdminApp() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // When stored in .env, the private key's newlines must be escaped (e.g., `\n`).
  // We need to replace these escaped characters with actual newline characters.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!clientEmail || !privateKey || !projectId) {
    throw new Error('Firebase Admin SDK credentials (clientEmail, privateKey, projectId) are not fully set in environment variables.');
  }

  try {
    const app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      storageBucket: `${projectId}.appspot.com`,
    });
    return app;
  } catch (error: any) {
    console.error('Firebase admin initialization error:', error);
    throw new Error(`Failed to initialize Firebase Admin SDK. Error: ${error.message}`);
  }
}

export const adminDb = () => initializeAdminApp().firestore();
export const adminStorage = () => initializeAdminApp().storage();
export const adminAuth = () => initializeAdminApp().auth();
export const isAdminInitialized = () => admin.apps.length > 0;
