import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
let authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;

// If authDomain is not set, but projectId is, we can construct it.
// This makes the configuration more resilient if the authDomain var is missed.
if (!authDomain && projectId) {
  authDomain = `${projectId}.firebaseapp.com`;
}

// Your web app's Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API,
  authDomain: authDomain,
  projectId: projectId,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Check if all critical environment variables are defined.
export const isFirebaseInitialized = !!(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId
);

// Declare variables that will hold Firebase services.
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let functions: Functions;

if (isFirebaseInitialized) {
    // If keys are present, initialize Firebase and export the services.
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app);
} else {
    // If keys are missing, log a warning and assign dummy objects.
    // This prevents the app from crashing on import and allows the UI to show a helpful message.
    console.warn(
        'Firebase client initialization skipped. Missing required environment variables (NEXT_PUBLIC_FIREBASE_...). The app will show a configuration guide.'
    );
    app = {} as FirebaseApp;
    auth = {} as Auth;
    db = {} as Firestore;
    functions = {} as Functions;
}

export { app, auth, db, functions };
