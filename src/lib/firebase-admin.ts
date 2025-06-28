import * as admin from 'firebase-admin';

// This function ensures Firebase Admin is initialized only once.
const initializeAdmin = () => {
    if (admin.apps.length > 0) {
        return admin.app();
    }

    const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // The private key must be correctly formatted.
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };

    // This check is important to avoid crashes if env vars are not set.
    if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
        const errorMessage = 'Firebase Admin SDK credentials are not fully set in environment variables. Server-side Firebase features will not work.';
        console.error(errorMessage);
        // Throwing an error is better than letting the app continue in a broken state.
        throw new Error(errorMessage);
    }

    try {
        return admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        });
    } catch (error: any) {
        console.error('Firebase admin initialization error', error);
        throw new Error(`Failed to initialize Firebase Admin SDK: ${error.message}`);
    }
};

// Lazily initialized services
export const adminDb = () => initializeAdmin().firestore();
export const adminStorage = () => initializeAdmin().storage();
export const adminAuth = () => initializeAdmin().auth();
