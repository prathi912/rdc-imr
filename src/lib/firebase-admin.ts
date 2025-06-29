import * as admin from 'firebase-admin';

// This function is designed to be safe to call multiple times and robust for serverless environments.
function initializeAdminApp() {
  // If the app is already initialized, return it to prevent re-initialization.
  if (admin.apps.length > 0 && admin.apps[0]) {
    return admin.apps[0];
  }

  // Retrieve credentials from environment variables.
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // This is the most critical part. The private key from an env var
  // needs to have its escaped newlines replaced with actual newlines.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  // Validate that all required environment variables are present.
  if (!projectId || !clientEmail || !privateKey) {
    const missingVars = [
        !projectId && 'FIREBASE_PROJECT_ID',
        !clientEmail && 'FIREBASE_CLIENT_EMAIL',
        !privateKey && 'FIREBASE_PRIVATE_KEY'
    ].filter(Boolean).join(', ');
    
    // Log a more descriptive error to help with debugging.
    console.error(`Firebase server-side credentials are not fully set. Missing: ${missingVars}`);
    throw new Error(`Firebase server-side credentials are not fully set. Missing: ${missingVars}`);
  }

  try {
    const app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      // The Admin SDK requires the .appspot.com domain for the storage bucket.
      storageBucket: `${projectId}.appspot.com`,
    });
    return app;
  } catch (error: any) {
    // Log the original error for deeper debugging if needed.
    console.error("Firebase admin initialization error:", error);
    // Provide a more specific error message for common issues.
    if (error.code === 'auth/invalid-credential' || error.message.includes('PEM')) {
        throw new Error(`Failed to initialize Firebase Admin SDK: Invalid private key format. Please check the FIREBASE_PRIVATE_KEY environment variable. Original error: ${error.message}`);
    }
    throw new Error(`Failed to initialize Firebase Admin SDK: ${error.message}`);
  }
}

// These functions will now use the memoized, safely-initialized app instance.
export const adminDb = () => initializeAdminApp().firestore();
export const adminStorage = () => initializeAdminApp().storage();
export const adminAuth = () => initializeAdminApp().auth();
export const isAdminInitialized = () => admin.apps.length > 0;