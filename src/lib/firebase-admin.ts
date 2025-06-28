
import * as admin from 'firebase-admin';

// This function ensures Firebase Admin is initialized only once.
const initializeAdmin = () => {
  // Check if an app is already initialized.
  if (admin.apps.length > 0) {
    return admin.app();
  }

  // Construct the service account object from individual environment variables.
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // The private key from the environment variable needs its escaped newlines replaced with actual newlines.
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };

  // Validate that all required service account properties are present.
  if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
    throw new Error('Firebase server-side credentials (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) are not set in environment variables.');
  }

  try {
    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });

    console.log("Firebase Admin SDK initialized successfully");
    return app;
  } catch (error: any) {
    console.error("Firebase admin initialization error:", error);
    // Throw a more specific error to help with debugging.
    throw new Error(`Failed to initialize Firebase Admin SDK: ${error.message}`);
  }
};

// A global variable to hold the initialized app.
let adminApp: admin.app.App | null = null;

// A getter function to ensure initialization happens only once.
const getAdminApp = () => {
  if (!adminApp) {
    try {
      adminApp = initializeAdmin();
    } catch (error) {
      console.error("Failed to get admin app:", error);
      // Re-throw the error to ensure consuming code knows about the failure.
      throw error;
    }
  }
  return adminApp;
};

// Lazily initialized services that use the getter.
export const adminDb = () => {
  try {
    return getAdminApp().firestore();
  } catch (error) {
    console.error("Error getting Firestore admin instance:", error);
    throw error;
  }
};

export const adminStorage = () => {
  try {
    return getAdminApp().storage();
  } catch (error) {
    console.error("Error getting Storage admin instance:", error);
    throw error;
  }
};

export const adminAuth = () => {
  try {
    return getAdminApp().auth();
  } catch (error) {
    console.error("Error getting Auth admin instance:", error);
    throw error;
  }
};

// Helper function to check initialization status for debugging.
export const isAdminInitialized = () => {
  try {
    return admin.apps.length > 0 && adminApp !== null;
  } catch (error) {
    console.error("Error checking admin initialization:", error);
    return false;
  }
};
