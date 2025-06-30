import admin from 'firebase-admin';
import type { ServiceAccount } from 'firebase-admin';

// This new structure ensures Firebase Admin is initialized only when one of its services is first accessed.
// This is safer for Next.js and provides better error handling.

let app: admin.app.App | null = null;

function ensureAdminInitialized() {
  // If already initialized, do nothing.
  if (app) return;

  // If another part of the code initialized an app, use it.
  if (admin.apps.length > 0 && admin.apps[0]) {
    app = admin.apps[0];
    console.log("Firebase Admin SDK re-used existing instance.");
    return;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
     console.error(
      "Firebase Admin SDK initialization skipped. The FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set. \n" +
      "For local development, copy the entire content of your service account JSON file into a .env.local file. For production, set this in your hosting provider's environment variable settings."
    );
    return; // Exit without initializing, app remains null
  }

  try {
    const serviceAccount: ServiceAccount = JSON.parse(serviceAccountJson);
    
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: `${serviceAccount.project_id}.appspot.com`,
    });
    console.log("Firebase Admin SDK initialized successfully.");

  } catch (error: any) {
    console.error(
      "Firebase Admin SDK initialization error. This is likely due to an incorrectly formatted FIREBASE_SERVICE_ACCOUNT_JSON environment variable. Please ensure it's a valid, single-line JSON string. Error:",
      error.message
    );
    // Don't re-throw, app will remain null
  }
}

// A helper function to safely get a service, throwing an error only when the service is accessed.
function getService<T>(serviceGetter: () => T): T {
  ensureAdminInitialized();
  if (!app) {
    throw new Error(
      "Firebase Admin SDK is not initialized. Check server logs for configuration errors. The FIREBASE_SERVICE_ACCOUNT_JSON environment variable is likely missing or malformed."
    );
  }
  return serviceGetter();
}

// We use a Proxy to create lazy-loaded exports.
// This means getService() is only called when you access a property
// on adminAuth, adminDb, or adminStorage for the first time.
export const adminAuth = new Proxy({} as admin.auth.Auth, {
  get(target, prop) {
    return getService(() => admin.auth(app!))[prop as keyof admin.auth.Auth];
  },
});

export const adminDb = new Proxy({} as admin.firestore.Firestore, {
  get(target, prop) {
    return getService(() => admin.firestore(app!))[prop as keyof admin.firestore.Firestore];
  },
});

export const adminStorage = new Proxy({} as admin.storage.Storage, {
  get(target, prop) {
    return getService(() => admin.storage(app!))[prop as keyof admin.storage.Storage];
  },
});
