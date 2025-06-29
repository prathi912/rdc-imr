
import { type NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth, adminStorage, isAdminInitialized } from "@/lib/firebase-admin";

export async function GET(request: NextRequest) {
  try {
    const results = {
      timestamp: new Date().toISOString(),
      tests: {} as Record<string, any>,
      debug: {} as Record<string, any>,
    };

    // Debug environment variables (without exposing sensitive data)
    results.debug.environment = {
      hasProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
      // Public vars
      hasPublicProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      hasPublicStorageBucket: !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      publicProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      publicStorageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    };

    results.debug.initializationStatusBeforeTest = isAdminInitialized() ? "Already Initialized" : "Not Initialized";
    
    // Test service account variables
    try {
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY;

      if (projectId && clientEmail && privateKey) {
        results.tests.serviceAccount = {
          status: "success",
          message: "All required service account environment variables are present.",
          projectId: projectId,
          clientEmail: clientEmail,
          hasPrivateKey: true,
        };
      } else {
        const missingVars = [
            !projectId && 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
            !clientEmail && 'FIREBASE_CLIENT_EMAIL',
            !privateKey && 'FIREBASE_PRIVATE_KEY'
        ].filter(Boolean).join(', ');
        
        results.tests.serviceAccount = {
          status: "error",
          message: `Missing service account environment variables: ${missingVars}.`,
          hasPrivateKey: !!privateKey,
        };
      }
    } catch (error: any) {
        results.tests.serviceAccount = {
            status: "error",
            message: `Service account environment variable check error: ${error.message}`,
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
