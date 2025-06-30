import admin from 'firebase-admin';
import type { ServiceAccount } from 'firebase-admin';

let app: admin.app.App | null = null;

function ensureAdminInitialized() {
  if (app) return;

  if (admin.apps.length > 0 && admin.apps[0]) {
    app = admin.apps[0];
    console.log("Firebase Admin SDK re-used existing instance.");
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      "Firebase Admin SDK initialization skipped. One or more required environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) are not set."
    );
    return;
  }

  try {
    const serviceAccount: ServiceAccount = {
      projectId,
      clientEmail,
      // This is the critical fix: Ensure private_key has correct newline characters.
      privateKey: privateKey.replace(/\\n/g, '\n'),
    };
    
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: `${projectId}.appspot.com`,
    });
    console.log("Firebase Admin SDK initialized successfully.");

  } catch (error: any) {
    console.error(
      "Firebase Admin SDK initialization error. This is likely due to an incorrectly formatted private key. Error:",
      error.message
    );
  }
}

function getService<T>(serviceGetter: () => T): T {
  ensureAdminInitialized();
  if (!app) {
    throw new Error(
      "Firebase Admin SDK is not initialized. Check server logs for configuration errors. Required environment variables are likely missing or malformed."
    );
  }
  return serviceGetter();
}

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
