
import * as admin from 'firebase-admin';

// This function will initialize the admin app if it's not already initialized.
// It's designed to be safe to call multiple times.
function getFirebaseAdminApp() {
  // If the app is already initialized, return it.
  if (admin.apps.length > 0 && admin.apps[0]) {
    return admin.apps[0];
  }

  // If not initialized, create a new app instance.
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // The private key from the environment variable needs its escaped newlines replaced with actual newlines.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  // Validate that all required environment variables are present.
  if (!projectId || !clientEmail || !privateKey) {
    const missingVars = [
        !projectId && 'FIREBASE_PROJECT_ID',
        !clientEmail && 'FIREBASE_CLIENT_EMAIL',
        !privateKey && 'FIREBASE_PRIVATE_KEY'
    ].filter(Boolean).join(', ');
    throw new Error(`Firebase server-side credentials are not fully set. Missing: ${missingVars}`);
  }

  try {
    const app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      // Use the .appspot.com domain for the admin SDK storage bucket
      storageBucket: `${projectId}.appspot.com`,
    });
    return app;
  } catch (error: any) {
    console.error("Firebase admin initialization error:", error);
    // Provide a more specific error message for common issues.
    if (error.code === 'auth/invalid-credential') {
      throw new Error("Failed to initialize Firebase Admin SDK: The credentials provided are invalid. Please check your service account details.");
    }
    if (error.message.includes('PEM')) {
        throw new Error(`Failed to initialize Firebase Admin SDK: Invalid private key format. Please check the FIREBASE_PRIVATE_KEY environment variable. Original error: ${error.message}`);
    }
    throw new Error(`Failed to initialize Firebase Admin SDK: ${error.message}`);
  }
}

// Export a single function to get a service instance.
// This ensures initialization is handled correctly every time.
function getAdminService<T>(serviceFactory: (app: admin.app.App) => T): T {
  const app = getFirebaseAdminApp();
  return serviceFactory(app);
}

export const adminDb = () => getAdminService(app => app.firestore());
export const adminStorage = () => getAdminService(app => app.storage());
export const adminAuth = () => getAdminService(app => app.auth());
export const isAdminInitialized = () => admin.apps.length > 0;
