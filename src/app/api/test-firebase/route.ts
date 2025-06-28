
import { type NextRequest, NextResponse } from "next/server"
import { adminDb, adminAuth, adminStorage, isAdminInitialized, forceInitializeAdmin } from "@/lib/firebase-admin"

export async function GET(request: NextRequest) {
  try {
    const results = {
      timestamp: new Date().toISOString(),
      tests: {} as Record<string, any>,
      debug: {} as Record<string, any>,
    }

    // Debug environment variables (without exposing sensitive data)
    results.debug.environment = {
      hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      hasProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      hasStorageBucket: !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    }

    // Try to force initialize if not already initialized
    if (!isAdminInitialized()) {
      try {
        console.log("Attempting to force initialize Firebase Admin SDK...")
        await forceInitializeAdmin()
        results.debug.initialization = "Force initialized successfully"
      } catch (initError: any) {
        results.debug.initialization = `Force initialization failed: ${initError.message}`
        return NextResponse.json(
          {
            ...results,
            overallStatus: "error",
            message: "Firebase Admin SDK initialization failed",
            error: initError.message,
          },
          { status: 500 },
        )
      }
    } else {
      results.debug.initialization = "Already initialized"
    }

    // Test Firestore connection
    try {
      const db = adminDb()
      // Try to access a collection (this will test permissions)
      const testCollection = db.collection("_health_check")
      const testDoc = testCollection.doc("test")

      // Try to write a test document
      await testDoc.set({
        timestamp: new Date(),
        test: true,
      })

      // Try to read it back
      const docSnapshot = await testDoc.get()
      const canRead = docSnapshot.exists

      // Clean up test document
      await testDoc.delete()

      results.tests.firestore = {
        status: "success",
        message: "Firestore connection successful - can read and write",
        canRead,
        canWrite: true,
      }
    } catch (error: any) {
      results.tests.firestore = {
        status: "error",
        message: `Firestore error: ${error.message}`,
        canRead: false,
        canWrite: false,
      }
    }

    // Test Firebase Auth
    try {
      const auth = adminAuth()
      // Just test if we can access the auth instance
      const listUsersResult = await auth.listUsers(1)
      results.tests.auth = {
        status: "success",
        message: "Firebase Auth connection successful",
        userCount: listUsersResult.users.length,
        canListUsers: true,
      }
    } catch (error: any) {
      results.tests.auth = {
        status: "error",
        message: `Firebase Auth error: ${error.message}`,
        canListUsers: false,
      }
    }

    // Test Firebase Storage
    try {
      const storage = adminStorage()
      const bucket = storage.bucket()
      const [exists] = await bucket.exists()

      // Try to list files (test read permission)
      const [files] = await bucket.getFiles({ maxResults: 1 })

      results.tests.storage = {
        status: "success",
        message: "Firebase Storage connection successful",
        bucketExists: exists,
        bucketName: bucket.name,
        canListFiles: true,
        fileCount: files.length,
      }
    } catch (error: any) {
      results.tests.storage = {
        status: "error",
        message: `Firebase Storage error: ${error.message}`,
        bucketExists: false,
        canListFiles: false,
      }
    }

    // Test service account parsing
    try {
      const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      if (serviceAccountJson) {
        const serviceAccount = JSON.parse(serviceAccountJson)
        results.tests.serviceAccount = {
          status: "success",
          message: "Service account JSON is valid",
          projectId: serviceAccount.project_id,
          clientEmail: serviceAccount.client_email,
          hasPrivateKey: !!serviceAccount.private_key,
        }
      } else {
        results.tests.serviceAccount = {
          status: "error",
          message: "Service account JSON not found in environment variables",
        }
      }
    } catch (error: any) {
      results.tests.serviceAccount = {
        status: "error",
        message: `Service account parsing error: ${error.message}`,
      }
    }

    // Overall status
    const hasErrors = Object.values(results.tests).some((test) => test.status === "error")
    const overallStatus = hasErrors ? "error" : "success"

    return NextResponse.json({
      ...results,
      overallStatus,
      message: hasErrors ? "Some Firebase services have issues" : "All Firebase services are working correctly",
    })
  } catch (error: any) {
    console.error("Firebase test error:", error)
    return NextResponse.json(
      {
        error: "Failed to test Firebase services",
        details: error.message,
        timestamp: new Date().toISOString(),
        stack: error.stack,
      },
      { status: 500 },
    )
  }
}
