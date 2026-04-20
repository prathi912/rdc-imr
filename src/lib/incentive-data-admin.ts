import { adminDb, adminRtdb } from './admin';
import type { IncentiveClaim } from '@/types';

/**
 * Fetches a single incentive claim by ID, checking RTDB first, then Firestore.
 */
export async function getIncentiveClaimByIdCombined(claimId: string): Promise<IncentiveClaim | null> {
    try {
        // 1. Check RTDB first (most recent data)
        const rtdbSnap = await adminRtdb.ref(`incentiveClaims/${claimId}`).get();
        if (rtdbSnap.exists()) {
            return { ...rtdbSnap.val(), id: claimId } as IncentiveClaim;
        }

        // 2. Fallback to Firestore (historical data)
        const firestoreSnap = await adminDb.collection('incentiveClaims').doc(claimId).get();
        if (firestoreSnap.exists) {
            return { ...firestoreSnap.data(), id: firestoreSnap.id } as IncentiveClaim;
        }

        return null;
    } catch (error) {
        console.error(`Error fetching combined claim ${claimId}:`, error);
        return null;
    }
}

/**
 * Fetches all incentive claims from both Firestore and RTDB, merging them.
 * Useful for bulk server actions like Excel generation.
 */
export async function getAllClaimsCombinedAdmin(): Promise<IncentiveClaim[]> {
    try {
        const [firestoreSnap, rtdbSnap] = await Promise.all([
            adminDb.collection('incentiveClaims').get(),
            adminRtdb.ref('incentiveClaims').get()
        ]);

        const combinedMap = new Map<string, IncentiveClaim>();

        // Add Firestore claims
        firestoreSnap.docs.forEach(doc => {
            combinedMap.set(doc.id, { ...doc.data(), id: doc.id } as IncentiveClaim);
        });

        // Add/Overwrite with RTDB claims
        if (rtdbSnap.exists()) {
            const data = rtdbSnap.val();
            Object.keys(data).forEach(key => {
                combinedMap.set(key, { ...data[key], id: key } as IncentiveClaim);
            });
        }

        return Array.from(combinedMap.values()).sort((a, b) => {
            const dateA = new Date(a.submissionDate).getTime();
            const dateB = new Date(b.submissionDate).getTime();
            return dateB - dateA;
        });
    } catch (error) {
        console.error("Error fetching all combined claims (admin):", error);
        return [];
    }
}
