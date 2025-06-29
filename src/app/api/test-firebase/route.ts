
import { type NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth, adminStorage, isAdminInitialized } from "@/lib/firebase-admin";

export async function GET(request: NextRequest) {
  try {
    const results = {
      timestamp: new Date().toISOString(),
      tests: {} as Record<string, any>,
      debug: {} as Record<string, any>,
    };

    // Debug environment variables
    results.debug.environment = {
      hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      hasPublicProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      hasPublicStorageBucket: !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    };

    results.debug.initializationStatusBeforeTest = isAdminInitialized() ? "Already Initialized" : "Not Initialized";
    
    // Test Service Account Variables
    if (results.debug.environment.hasClientEmail && results.debug.environment.hasPrivateKey) {
        results.tests.serviceAccount = {
            status: "success",
            message: "FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are present.",
        };
    } else {
         results.tests.serviceAccount = {
            status: "error",
            message: "One or more Firebase Admin SDK environment variables are missing.",
        };
    }
    
    // Test Firestore connection
    try {
      const db = adminDb(); // This will trigger initialization if needed
      const testCollection = db.collection("_health_check");
      await testCollection.doc("write_test").set({ timestamp: new Date() });
      const docSnapshot = await testCollection.doc("write_test").get();
      const canRead = docSnapshot.exists;
      await testCollection.doc("write_test").delete();

      results.tests.firestore = {
        status: "success",
        message: "Firestore connection successful - can read and write.",
        canRead,
        canWrite: true,
      };
    } catch (error: any) {
      results.tests.firestore = {
        status: "error",
        message: `Firestore error: ${error.message}`,
        details: error.stack,
        canRead: false,
        canWrite: false,
      };
    }

    // Test Firebase Auth
    try {
      const auth = adminAuth();
      await auth.listUsers(1); // Test an actual API call
      results.tests.auth = {
        status: "success",
        message: "Firebase Auth connection successful.",
        canListUsers: true,
      };
    } catch (error: any) {
      results.tests.auth = {
        status: "error",
        message: `Firebase Auth error: ${error.message}`,
        details: error.stack,
        canListUsers: false,
      };
    }

    // Test Firebase Storage
    try {
      const storage = adminStorage();
      const bucket = storage.bucket();
      const [exists] = await bucket.exists();
      results.tests.storage = {
        status: "success",
        message: "Firebase Storage connection successful.",
        bucketExists: exists,
        bucketName: bucket.name,
      };
    } catch (error: any) {
      results.tests.storage = {
        status: "error",
        message: `Firebase Storage error: ${error.message}`,
        details: error.stack,
        bucketExists: false,
      };
    }

    // Final initialization status check
    results.debug.initializationStatusAfterTest = isAdminInitialized() ? "Initialized" : "Initialization Failed";

    // Overall status
    const hasErrors = Object.values(results.tests).some((test) => test.status === "error");
    const overallStatus = hasErrors ? "error" : "success";
    const overallMessage = hasErrors ? "Some Firebase services have issues." : "All Firebase services are working correctly.";

    return NextResponse.json({
      ...results,
      overallStatus,
      message: overallMessage,
    });

  } catch (error: any) {
    console.error("Firebase health check API failed catastrophically:", error);
    return NextResponse.json(
      {
        error: "Failed to run Firebase health check API",
        details: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
