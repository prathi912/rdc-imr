
'use server';

import { adminDb } from '@/lib/admin';
import type { IncentiveClaim, Author } from '@/types';

type IncentiveUploadData = {
  'Email ID': string;
  name: string;
  'MIS ID': string;
  Designation: string;
  'Title of Paper': string;
  'Month & year': string;
  Index: 'Scopus' | 'WOS' | 'Scopus & WOS';
  'Incentive given in Rs.': number;
};

async function logActivity(level: 'INFO' | 'WARNING' | 'ERROR', message: string, context: Record<string, any> = {}) {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };
    await adminDb.collection('logs').add(logEntry);
  } catch (error) {
    console.error("FATAL: Failed to write to logs collection.", error);
  }
}

export async function bulkUploadIncentiveClaims(
  records: IncentiveUploadData[],
  claimType: string,
  uploadedByUid: string,
): Promise<{ 
    success: boolean; 
    data: {
        successfulClaims: number;
        totalRecords: number;
        errors: { title: string; reason: string }[];
    };
    error?: string 
}> {
  const errors: { title: string; reason: string }[] = [];
  
  // Group records by paper title to handle co-authors
  const claimsByTitle = records.reduce((acc, record) => {
    const title = record['Title of Paper']?.trim();
    if (!title) {
        errors.push({ title: 'Unknown Title', reason: 'Row missing "Title of Paper".' });
        return acc;
    }
    if (!acc[title]) {
      acc[title] = [];
    }
    acc[title].push(record);
    return acc;
  }, {} as Record<string, IncentiveUploadData[]>);

  let successfulClaims = 0;
  const batch = adminDb.batch();
  const usersRef = adminDb.collection('users');
  const claimsRef = adminDb.collection('incentiveClaims');

  for (const title in claimsByTitle) {
    try {
      const authorRecords = claimsByTitle[title];
      const mainAuthorRecord = authorRecords[0];

      const allAuthorDetails: Author[] = [];
      const authorUids: string[] = [];

      for (const record of authorRecords) {
        const email = record['Email ID'].toLowerCase();
        let userUid: string | null = null;

        // Check if user exists
        const userQuery = await usersRef.where('email', '==', email).limit(1).get();
        if (!userQuery.empty) {
          userUid = userQuery.docs[0].id;
        }

        allAuthorDetails.push({
          uid: userUid,
          email: email,
          name: record.name,
          role: 'Co-Author', // Default role for historical data
          isExternal: false, // Assume internal for simplicity
          status: 'approved'
        });

        if (userUid) {
            authorUids.push(userUid);
        }
      }

      // Designate the first listed author as the main one for the claim record
      const mainAuthorDetails = allAuthorDetails[0];
      if (mainAuthorDetails) {
          mainAuthorDetails.role = 'First Author';
      }

      const [month, year] = mainAuthorRecord['Month & year'].split(' ');

      const claimData: Omit<IncentiveClaim, 'id'> = {
        uid: mainAuthorDetails.uid || 'historical_import',
        userName: mainAuthorDetails.name,
        userEmail: mainAuthorDetails.email,
        claimType,
        paperTitle: title,
        publicationMonth: month,
        publicationYear: year,
        indexType: mainAuthorRecord.Index === 'WOS' ? 'wos' : 'scopus', // Simplified mapping
        status: 'Payment Completed',
        submissionDate: new Date().toISOString(),
        benefitMode: 'incentives',
        faculty: 'N/A',
        isPuNameInPublication: true,
        finalApprovedAmount: mainAuthorRecord['Incentive given in Rs.'],
        authors: allAuthorDetails,
        authorUids: authorUids
      };
      
      const newClaimRef = claimsRef.doc();
      batch.set(newClaimRef, claimData);
      successfulClaims++;
    } catch (error: any) {
        errors.push({ title, reason: error.message || 'An unknown error occurred.' });
    }
  }

  try {
      await batch.commit();
      await logActivity('INFO', 'Bulk incentive claims processed', { successfulClaims, errors });
      return { 
          success: true, 
          data: {
              successfulClaims,
              totalRecords: records.length,
              errors,
          }
      };
  } catch (error: any) {
      await logActivity('ERROR', 'Failed to commit bulk incentive claims', { error: error.message });
      return { success: false, error: 'Failed to save claims to the database.' };
  }
}
