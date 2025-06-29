import * as admin from 'firebase-admin';

function initializeAdminApp() {
  if (admin.apps.length > 0 && admin.apps[0]) {
    return admin.apps[0];
  }

  const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountString) {
    throw new Error('The FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set.');
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountString);

    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: `${serviceAccount.project_id}.appspot.com`,
    });
    return app;
  } catch (error: any) {
    console.error("Firebase admin initialization error:", error);
    throw new Error(`Failed to initialize Firebase Admin SDK. Please check the FIREBASE_SERVICE_ACCOUNT_JSON environment variable. Error: ${error.message}`);
  }
}

export const adminDb = () => initializeAdminApp().firestore();
export const adminStorage = () => initializeAdminApp().storage();
export const adminAuth = () => initializeAdminApp().auth();
export const isAdminInitialized = () => admin.apps.length > 0;
