// Load .env variables
require('dotenv').config();
const admin = require('firebase-admin');

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;
const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

console.log("Config from process.env:", { projectId, clientEmail, databaseURL, hasPrivateKey: !!privateKey });

if (!projectId || !clientEmail || !privateKey || !databaseURL) {
    console.error("Missing required env vars in process.env");
    process.exit(1);
}

console.log("Private Key starts with:", privateKey.substring(0, 30));
console.log("Private Key length:", privateKey.length);


if (!admin.apps.length) {
    const formattedPrivateKey = privateKey
        .replace(/\\n/g, '\n')
        .split('\n')
        .map(line => line.trim())
        .join('\n')
        .replace(/^"|"$/g, ''); // Handle literal quotes if they survived

    admin.initializeApp({
        credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: formattedPrivateKey,
        }),
        databaseURL,
    });
}


const db = admin.database();
const firestore = admin.firestore();

console.log("Testing Firestore...");
firestore.collection('_health_check').doc('test_connection').set({ timestamp: Date.now(), source: 'manual_test_script' })
    .then(() => {
        console.log("SUCCESS: Successfully wrote to Firestore");
        console.log("Testing RTDB...");
        return db.ref('_health_check/test_connection').set({ timestamp: Date.now(), source: 'manual_test_script' });
    })
    .then(() => {
        console.log("SUCCESS: Successfully wrote to RTDB");
        process.exit(0);
    })
    .catch((err) => {
        console.error("FAILURE:", err.message);
        process.exit(1);
    });

