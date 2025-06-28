
import * as admin from 'firebase-admin';

// A global variable to hold the initialized app instance.
// This prevents re-initializing the app on every hot-reload in development.
let adminApp: admin.app.App | null = null;

function initializeAdmin() {
  if (admin.apps.length > 0) {
    adminApp = admin.app();
    return adminApp;
  }

  // Pull credentials from environment variables
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  // Validate that all required environment variables are present.
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase server-side credentials are not fully set in environment variables. ' +
      'Please ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are set.'
    );
  }

  // The private key from the environment variable needs its escaped newlines replaced with actual newlines.
  const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');

  try {
    const app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: formattedPrivateKey,
      }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });

    console.log("Firebase Admin SDK initialized successfully");
    adminApp = app;
    return app;
  } catch (error: any) {
    console.error("Firebase admin initialization error:", error);
    // Throw a more specific error to help with debugging.
    throw new Error(`Failed to initialize Firebase Admin SDK: ${error.message}`);
  }
}

// A getter function to ensure initialization happens only once.
const getAdminApp = () => {
  if (!adminApp) {
    return initializeAdmin();
  }
  return adminApp;
};


// Lazily initialized services that use the getter.
export const adminDb = () => getAdminApp().firestore();
export const adminStorage = () => getAdminApp().storage();
export const adminAuth = () => getAdminApp().auth();
export const isAdminInitialized = () => admin.apps.length > 0 && adminApp !== null;
