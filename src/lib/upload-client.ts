import { auth, storage } from "@/lib/config";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

/**
 * Upload a file directly to Firebase Storage from the client
 * Bypasses Vercel Serverless Function body size limits (4.5MB)
 */
export async function uploadFileToApi(
  file: File,
  options?: {
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
    path?: string;
  }
): Promise<{ success: boolean; url?: string; error?: string; fileData?: any }> {
  try {
    // 1. Check authentication
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: "User not authenticated - please log in" };
    }

    // 2. Prepare storage reference
    // Use provided path or generate a default one
    const storagePath = options?.path || `uploads/${user.uid}/${Date.now()}-${file.name}`;
    const storageRef = ref(storage, storagePath);

    // 3. Start resumable upload
    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
      customMetadata: {
        originalName: file.name,
        uploadedBy: user.uid,
      }
    });

    // 4. Handle progress and completion via Promise
    return new Promise((resolve) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          // Calculate and report progress
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (options?.onProgress) {
            options.onProgress(Math.round(progress));
          }
        },
        (error) => {
          // Handle upload error
          console.error("Firebase upload error:", error);
          resolve({
            success: false,
            error: error.message || "Failed to upload file to storage",
          });
        },
        async () => {
          // Handle successful completion
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve({
              success: true,
              url: downloadURL,
              fileData: {
                name: file.name,
                size: file.size,
                type: file.type,
                path: storagePath,
                uploadedAt: new Date().toISOString(),
              }
            });
          } catch (urlError: any) {
            console.error("Error getting download URL:", urlError);
            resolve({
              success: false,
              error: "Upload succeeded but failed to retrieve URL",
            });
          }
        }
      );

      // Handle abort signal if provided
      if (options?.signal) {
        options.signal.addEventListener("abort", () => {
          uploadTask.cancel();
          resolve({ success: false, error: "Upload cancelled by user" });
        });
      }
    });
  } catch (error: any) {
    console.error("Setup error for upload:", error);
    return {
      success: false,
      error: error.message || "An unexpected error occurred during upload setup",
    };
  }
}

/**
 * Validate file before upload
 */
export function validateFile(
  file: File,
  options?: {
    maxSize?: number;
    allowedTypes?: string[];
  }
): { valid: boolean; error?: string } {
  const maxSize = options?.maxSize || 100 * 1024 * 1024; // 100MB default
  const allowedTypes = options?.allowedTypes || [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size exceeds ${maxSize / (1024 * 1024)}MB limit`,
    };
  }

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} is not allowed`,
    };
  }

  return { valid: true };
}
