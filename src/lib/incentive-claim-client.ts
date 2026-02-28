import { auth } from "@/lib/config";
import type { IncentiveClaim } from "@/types";
import { gzip } from "zlib";
import { promisify } from "util";

const gzipAsync = promisify(gzip);

export async function submitIncentiveClaimViaApi(
  claimData: Omit<IncentiveClaim, "id" | "claimId">,
  claimIdToUpdate?: string
): Promise<{ success: boolean; error?: string; claimId?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    const token = await user.getIdToken();
    
    const payload = { claimData, claimIdToUpdate };
    const jsonString = JSON.stringify(payload);
    
    // Check if payload is large enough to compress (typically >1KB)
    let body: Uint8Array | string;
    let contentEncoding: string | null = null;
    
    if (jsonString.length > 1024) {
      // Compress large payloads
      try {
        const buffer = Buffer.from(jsonString, 'utf-8');
        const compressed = await gzipAsync(buffer);
        body = new Uint8Array(compressed);
        contentEncoding = 'gzip';
      } catch {
        // Fall back to uncompressed if compression fails
        body = jsonString;
      }
    } else {
      // Small payloads don't need compression
      body = jsonString;
    }

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    };
    
    if (contentEncoding) {
      headers["Content-Encoding"] = contentEncoding;
    }

    const response = await fetch("/api/incentive-claims", {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || errorData.message || `Request failed with status ${response.status}`;
      return { success: false, error: errorMessage };
    }

    const result = await response.json();
    return {
      success: result.success ?? true,
      claimId: result.claimId,
      error: result.error,
    };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to submit claim" };
  }
}
