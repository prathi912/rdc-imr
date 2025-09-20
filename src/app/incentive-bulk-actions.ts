
'use server';

import { adminDb } from '@/lib/admin';
import type { IncentiveClaim, Author } from '@/types';

type ResearchPaperUploadData = {
  'Title of Paper': string;
  'Email': string;
  'Journal': string;
  'Amount': number;
  'Index': 'Scopus' | 'WOS' | 'Scopus & WOS' | 'ESCI';
  'Date of proof': string | number | Date;
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

// Function to convert Excel serial date number to JS Date
function excelDateToJSDate(serial: number) {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);

  const fractional_day = serial - Math.floor(serial) + 0.0000001;
  let total_seconds = Math.floor(86400 * fractional_day);
  const seconds = total_seconds % 60;
  total_seconds -= seconds;
  const hours = Math.floor(total_seconds / (60 * 60));
  const minutes = Math.floor(total_seconds / 60) % 60;

  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds);
}


export async function bulkUploadIncentiveClaims(
  records: any[], // Using any[] to handle different possible structures initially
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
  
  if (claimType !== 'Research Papers') {
      return { success: false, error: 'Bulk upload is currently only supported for Research Papers.' };
  }

  const paperRecords = records as ResearchPaperUploadData[];

  // Group records by paper title to handle co-authors
  const claimsByTitle = paperRecords.reduce((acc, record) => {
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
  }, {} as Record<string, ResearchPaperUploadData[]>);

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
        const email = record['Email'].toLowerCase();
        let userUid: string | null = null;
        let userName: string = email.split('@')[0]; // Default name

        // Check if user exists
        const userQuery = await usersRef.where('email', '==', email).limit(1).get();
        if (!userQuery.empty) {
          const userDoc = userQuery.docs[0];
          userUid = userDoc.id;
          userName = userDoc.data().name;
        }

        allAuthorDetails.push({
          uid: userUid,
          email: email,
          name: userName,
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

      let submissionDate: Date;
      if (mainAuthorRecord['Date of proof'] instanceof Date) {
          submissionDate = mainAuthorRecord['Date of proof'];
      } else if (typeof mainAuthorRecord['Date of proof'] === 'number') {
          submissionDate = excelDateToJSDate(mainAuthorRecord['Date of proof']);
      } else {
          submissionDate = new Date(); // Fallback
      }
      

      const claimData: Omit<IncentiveClaim, 'id' | 'claimId'> = {
        uid: mainAuthorDetails.uid || 'historical_import',
        userName: mainAuthorDetails.name,
        userEmail: mainAuthorDetails.email,
        claimType,
        paperTitle: title,
        journalName: mainAuthorRecord['Journal'],
        indexType: mainAuthorRecord['Index'].toLowerCase().includes('scopus') ? 'scopus' : 'wos', // Simplified mapping
        status: 'Payment Completed',
        submissionDate: submissionDate.toISOString(),
        benefitMode: 'incentives',
        faculty: 'N/A', // Not available in the sheet
        isPuNameInPublication: true,
        finalApprovedAmount: mainAuthorRecord['Amount'],
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
