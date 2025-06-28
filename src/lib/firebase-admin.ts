
import * as admin from "firebase-admin"

// This function ensures Firebase Admin is initialized only once.
const initializeAdmin = () => {
  if (admin.apps.length > 0) {
    return admin.app()
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON

  if (!serviceAccountJson) {
    const errorMessage =
      "FIREBASE_SERVICE_ACCOUNT_JSON is not set in environment variables. Server-side Firebase features will not work."
    console.error(errorMessage)
    throw new Error(errorMessage)
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson)

    // The private key from the env var has escaped newlines.
    // We need to replace them with actual newline characters for the SDK.
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n")
    }

    // Validate required fields
    const requiredFields = [
      "type",
      "project_id",
      "private_key_id",
      "private_key",
      "client_email",
      "client_id",
      "auth_uri",
      "token_uri",
    ]
    for (const field of requiredFields) {
      if (!serviceAccount[field]) {
        throw new Error(`Missing required field: ${field}`)
      }
    }

    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    })

    console.log("Firebase Admin SDK initialized successfully")
    return app
  } catch (error: any) {
    console.error("Firebase admin initialization error:", error)
    throw new Error(`Failed to initialize Firebase Admin SDK: ${error.message}`)
  }
}

// Initialize the app once
let adminApp: admin.app.App | null = null

const getAdminApp = () => {
  if (!adminApp) {
    try {
      adminApp = initializeAdmin()
    } catch (error) {
      console.error("Failed to get admin app:", error)
      throw error
    }
  }
  return adminApp
}

// Lazily initialized services with error handling
export const adminDb = () => {
  try {
    return getAdminApp().firestore()
  } catch (error) {
    console.error("Error getting Firestore admin instance:", error)
    throw error
  }
}

export const adminStorage = () => {
  try {
    return getAdminApp().storage()
  } catch (error) {
    console.error("Error getting Storage admin instance:", error)
    throw error
  }
}

export const adminAuth = () => {
  try {
    return getAdminApp().auth()
  } catch (error) {
    console.error("Error getting Auth admin instance:", error)
    throw error
  }
}

// Helper function to check if admin is initialized
export const isAdminInitialized = () => {
  try {
    return admin.apps.length > 0 && adminApp !== null
  } catch (error) {
    console.error("Error checking admin initialization:", error)
    return false
  }
}

// Force initialization function for testing
export const forceInitializeAdmin = () => {
  try {
    adminApp = null
    return getAdminApp()
  } catch (error) {
    console.error("Force initialization failed:", error)
    throw error
  }
}
