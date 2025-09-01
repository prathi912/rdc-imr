
'use server';

import { adminDb } from '@/lib/admin';
import type { User, FoundUser } from '@/types';
import {
  collection as adminCollection,
  query as adminQuery,
  where as adminWhere,
  getDocs as adminGetDocs,
} from 'firebase/firestore/lite';


async function logActivity(level: 'INFO' | 'WARNING' | 'ERROR', message: string, context: Record<string, any> = {}) {
    try {
        if (!message) {
            console.error("Log message is empty or undefined.");
            return;
        }

        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...context,
        };
        await adminDb.collection('logs').add(logEntry);
    } catch (error) {
        console.error("FATAL: Failed to write to logs collection.", error);
        console.error("Original Log Entry:", { level, message, context });
    }
}


export async function findUserByMisId(
    misId: string,
  ): Promise<{ 
      success: boolean; 
      users?: FoundUser[];
      error?: string 
  }> {
    try {
      if (!misId || misId.trim() === "") {
        return { success: false, error: "MIS ID is required." };
      }
      
      const allFound = new Map<string, FoundUser>();
  
      // 1. Search existing users in Firestore
      const usersRef = adminCollection(adminDb, "users");
      const q = adminQuery(usersRef, adminWhere("misId", "==", misId));
      const querySnapshot = await adminGetDocs(q);
  
      querySnapshot.forEach(doc => {
        const userData = doc.data() as User;
        const userResult = {
            uid: doc.id,
            name: userData.name,
            email: userData.email,
            misId: userData.misId!,
            campus: userData.campus || 'Vadodara',
        };
        allFound.set(userResult.email, userResult);
      });
  
      // 2. Search staff data files via API
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002';
      const response = await fetch(`${baseUrl}/api/get-staff-data?misId=${encodeURIComponent(misId)}&fetchAll=true`);
      const staffResult = await response.json();
  
      if (staffResult.success && Array.isArray(staffResult.data)) {
        staffResult.data.forEach((staff: any) => {
          if (!allFound.has(staff.email)) {
              allFound.set(staff.email, {
                  uid: '', // No UID for staff not yet registered
                  name: staff.name,
                  email: staff.email,
                  misId: staff.misId,
                  campus: staff.campus,
              });
          }
        });
      }
  
      const foundUsers = Array.from(allFound.values());
      
      if (foundUsers.length > 0) {
          return { success: true, users: foundUsers };
      }
      
      return { success: false, error: "No user found with this MIS ID across any campus. Please check the MIS ID or ask them to sign up first." };
  
    } catch (error: any) {
      console.error("Error finding user by MIS ID:", error);
      await logActivity('ERROR', 'Failed to find user by MIS ID', { misId, error: error.message, stack: error.stack });
      return { success: false, error: error.message || "Failed to search for user." };
    }
  }
