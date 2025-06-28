import * as admin from 'firebase-admin';

// This function ensures Firebase Admin is initialized only once.
const initializeAdmin = () => {
    if (admin.apps.length > 0) {
        return admin.app();
    }

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    
    if (!serviceAccountJson) {
        const errorMessage = 'FIREBASE_SERVICE_ACCOUNT_JSON is not set in environment variables. Server-side Firebase features will not work.';
        console.error(errorMessage);
        throw new Error(errorMessage);
    }

    try {
        const serviceAccount = JSON.parse(serviceAccountJson);
        
        // The private key from the env var has escaped newlines.
        // We need to replace them with actual newline characters for the SDK.
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

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
