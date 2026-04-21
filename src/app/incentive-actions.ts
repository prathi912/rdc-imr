

'use server';

import { adminDb, adminRtdb } from '@/lib/admin';
import { getIncentiveClaimByIdCombined } from '@/lib/incentive-data-admin';
import type { IncentiveClaim, User } from '@/types';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { getTemplateContentFromUrl } from '@/lib/template-manager';
import { format } from 'date-fns';
import { getSystemSettings } from './actions';

export async function generateBookIncentiveForm(claimId: string): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const claim = await getIncentiveClaimByIdCombined(claimId);
    if (!claim) {
      return { success: false, error: 'Incentive claim not found.' };
    }

    let userRef;
    let userSnap;
    // If it's a co-author claim, fetch the current applicant's details. Otherwise, fetch the original claimant's.
    if (claim.originalClaimId) {
        userRef = adminDb.collection('users').doc(claim.uid);
    } else {
        userRef = adminDb.collection('users').doc(claim.uid);
    }
    
    userSnap = await userRef.get();

    if (!userSnap.exists) {
        return { success: false, error: 'Claimant user profile not found.' };
    }
    const user = userSnap.data() as User;
    
    const settings = await getSystemSettings();
    const templateName = claim.bookApplicationType === 'Book Chapter' 
        ? 'INCENTIVE_BOOK_CHAPTER' 
        : 'INCENTIVE_BOOK_PUBLICATION';
    
    const templateUrl = settings.templateUrls?.[templateName];

    if (!templateUrl) {
        return { success: false, error: `Template URL for ${templateName} not configured.` };
    }
    
    const content = await getTemplateContentFromUrl(templateUrl);
    if (!content) {
        return { success: false, error: `Template file ${templateName} not found or couldn't be loaded.` };
    }

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });

    const coAuthors = claim.authors?.filter(a => a.email !== user.email).map(a => a.name) || [];
    const coAuthorData: { [key: string]: string } = {};
    for (let i = 0; i < 6; i++) {
        coAuthorData[`coauthor${i + 1}`] = coAuthors[i] || '';
    }
    
    const internalAuthorsCount = claim.authors?.filter(a => !a.isExternal).length || 0;

    const data = {
        name: user.name, // Use the current applicant's name
        designation: user.designation || 'N/A',
        department: user.department || 'N/A',
        institute: user.institute || 'N/A',
        booktitle: claim.publicationTitle || claim.bookTitleForChapter,
        ...coAuthorData,
        authors_pu: internalAuthorsCount,
        applicant_type: claim.authorRole || 'N/A',
        total_chapters: claim.bookApplicationType === 'Book Chapter' ? 1 : (claim.bookTotalChapters || 'N/A'),
        total_pages: claim.bookTotalPages || claim.bookChapterPages || 'N/A',
        publication_year: claim.publicationYear,
        publisher_name: claim.publisherName,
        publisher_city: claim.publisherCity || 'N/A',
        publisher_country: claim.publisherCountry || 'N/A',
        publisher_type: claim.publisherType,
        print_isbn: claim.isbnPrint || 'N/A',
        electronic_isbn: claim.isbnElectronic || 'N/A',
        date: format(new Date(), 'dd/MM/yyyy'),
    };
    
    doc.setData(data);

    try {
      doc.render();
    } catch (error: any) {
      console.error('Docxtemplater render error:', error);
      return { success: false, error: 'Failed to render the document template.' };
    }

    const buf = doc.getZip().generate({ type: 'nodebuffer' });
    const base64 = buf.toString('base64');

    return { success: true, fileData: base64 };
  } catch (error: any) {
    console.error('Error generating book incentive form:', error);
    return { success: false, error: error.message || 'Failed to generate the form.' };
  }
}
/**
 * Fetches incentive claims from both Firestore and RTDB, merges them and applies role-based filtering.
 * This runs on the server to bypass RTDB security rule limitations for complex client-side queries.
 */
export async function fetchAllClaimsAction(user: User): Promise<IncentiveClaim[]> {
  if (!user) return [];

  try {
    const isAdmin = user.role === 'Super-admin' || user.role === 'admin';
    // Simplified approver check for server action context
    const isApprover = user.allowedModules?.some(m => m.startsWith('incentive-approver-'));
    
    // 1. Fetch from Firestore
    let firestoreClaims: IncentiveClaim[] = [];
    const claimsCollection = adminDb.collection('incentiveClaims');

    if (isAdmin || isApprover) {
      const snap = await claimsCollection.orderBy('submissionDate', 'desc').get();
      firestoreClaims = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as IncentiveClaim));
    } else if (user.role === 'CRO') {
      const snap = await claimsCollection.where('faculty', 'in', user.faculties || []).orderBy('submissionDate', 'desc').get();
      firestoreClaims = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as IncentiveClaim));
    } else {
      // Regular user: owned + co-authored
      const [snap1, snap2, snap3] = await Promise.all([
        claimsCollection.where('uid', '==', user.uid).get(),
        claimsCollection.where('authorUids', 'array-contains', user.uid).get(),
        claimsCollection.where('authorEmails', 'array-contains', user.email.toLowerCase()).get()
      ]);
      
      const map = new Map<string, IncentiveClaim>();
      [snap1, snap2, snap3].forEach(snap => {
        snap.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() } as IncentiveClaim));
      });
      firestoreClaims = Array.from(map.values());
    }

    // 2. Fetch from RTDB
    const rtdbSnap = await adminRtdb.ref('incentiveClaims').get();
    let rtdbClaims: IncentiveClaim[] = [];

    if (rtdbSnap.exists()) {
      const data = rtdbSnap.val();
      rtdbClaims = Object.keys(data).map(key => ({ id: key, ...data[key] } as IncentiveClaim));

      // Filter RTDB data
      if (isAdmin || isApprover) {
        // No filtering
      } else if (user.role === 'CRO') {
        rtdbClaims = rtdbClaims.filter(c => (user.faculties || []).includes(c.faculty || ''));
      } else {
        rtdbClaims = rtdbClaims.filter(c => 
          c.uid === user.uid || 
          c.authorUids?.includes(user.uid) || 
          c.authorEmails?.includes(user.email.toLowerCase())
        );
      }
    }

    // 3. Merge (RTDB wins)
    const combinedMap = new Map<string, IncentiveClaim>();
    firestoreClaims.forEach(c => combinedMap.set(c.id, c));
    rtdbClaims.forEach(c => combinedMap.set(c.id, c));

    return Array.from(combinedMap.values()).sort((a, b) => {
      const dateA = new Date(a.submissionDate).getTime();
      const dateB = new Date(b.submissionDate).getTime();
      return dateB - dateA;
    });

  } catch (error) {
    console.error("Error in fetchAllClaimsAction:", error);
    return [];
  }
}

/**
 * Server action to fetch a single incentive claim by ID.
 * This is used by form components to safely load drafts from either RTDB or Firestore.
 */
export async function getIncentiveClaimByIdAction(claimId: string): Promise<{ success: boolean; data?: IncentiveClaim; error?: string }> {
  try {
    const claim = await getIncentiveClaimByIdCombined(claimId);
    if (!claim) {
      return { success: false, error: 'Incentive claim not found.' };
    }
    return { success: true, data: claim };
  } catch (error: any) {
    console.error(`Error in getIncentiveClaimByIdAction for ID ${claimId}:`, error);
    return { success: false, error: error.message || 'Failed to fetch incentive claim.' };
  }
}
