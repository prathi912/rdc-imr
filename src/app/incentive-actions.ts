
'use server';

import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { adminDb } from '@/lib/admin';
import type { IncentiveClaim, User } from '@/types';


export async function generateBookIncentiveForm(claimId: string): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const claimRef = adminDb.collection('incentiveClaims').doc(claimId);
    const claimSnap = await claimRef.get();
    if (!claimSnap.exists) {
      return { success: false, error: 'Incentive claim not found.' };
    }
    const claim = { id: claimSnap.id, ...claimSnap.data() } as IncentiveClaim;

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
    
    const templateName = claim.bookApplicationType === 'Book Chapter' 
        ? 'INCENTIVE_BOOK_CHAPTER.docx' 
        : 'INCENTIVE_BOOK_PUBLICATION.docx';
    const templatePath = path.join(process.cwd(), 'public', 'templates', templateName);

    if (!fs.existsSync(templatePath)) {
      return { success: false, error: `Template file ${templateName} not found on the server.` };
    }
    const content = fs.readFileSync(templatePath, 'binary');

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });

    const coAuthors = claim.bookCoAuthors?.filter(a => a.email !== user.email).map(a => a.name) || [];
    const coAuthorData: { [key: string]: string } = {};
    for (let i = 0; i < 6; i++) {
        coAuthorData[`coauthor${i + 1}`] = coAuthors[i] || '';
    }
    
    const internalAuthorsCount = claim.bookCoAuthors?.filter(a => !a.isExternal).length || 0;

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

function getBaseIncentive(claimData: Partial<IncentiveClaim>, isChapter: boolean): number {
    const isScopus = claimData.isScopusIndexed === true;
    const pubType = claimData.publisherType;
    const pages = isChapter ? (claimData.bookChapterPages || 0) : (claimData.bookTotalPages || 0);

    if (isChapter) {
        if (isScopus) return 6000;
        if (pubType === 'National') {
            if (pages > 20) return 2500;
            if (pages >= 10) return 1500;
            if (pages >= 5) return 500;
        } else if (pubType === 'International') {
            if (pages > 20) return 3000;
            if (pages >= 10) return 2000;
            if (pages >= 5) return 1000;
        }
    } else { // Full Book
        if (isScopus) return 18000;
        if (pubType === 'National') {
            if (pages > 350) return 3000;
            if (pages >= 200) return 2500;
            if (pages >= 100) return 2000;
            return 1000;
        } else if (pubType === 'International') {
            if (pages > 350) return 6000;
            if (pages >= 200) return 3500;
            return 2000;
        }
    }
    return 0;
}


export async function calculateIncentive(claimData: Partial<IncentiveClaim>): Promise<{ success: boolean; amount?: number; error?: string }> {
    try {
        const isChapter = claimData.bookApplicationType === 'Book Chapter';
        let baseIncentive = getBaseIncentive(claimData, isChapter);

        // Adjust for Editor role
        if (claimData.authorRole === 'Editor') {
            baseIncentive /= 2;
        }

        let totalIncentive = baseIncentive;
        
        // Handle multiple chapters
        if (isChapter && claimData.chaptersInSameBook && claimData.chaptersInSameBook > 1) {
            const n = claimData.chaptersInSameBook;
            // To calculate the cap, we need to know the full book's incentive
            const fullBookData = { ...claimData, bookTotalPages: 999 }; // Assume max page count for cap
            const baseBookIncentive = getBaseIncentive(fullBookData, false);
            
            let sum = 0;
            for (let k = 1; k <= n; k++) {
                sum += baseIncentive / k;
                if (sum >= baseBookIncentive) {
                    sum = baseBookIncentive;
                    break;
                }
            }
            totalIncentive = Math.min(sum, baseBookIncentive);
        }

        // Split among multiple PU authors
        const internalAuthorsCount = claimData.bookCoAuthors?.filter(a => !a.isExternal).length || 0;
        if (internalAuthorsCount > 1) {
            totalIncentive /= internalAuthorsCount;
        }

        return { success: true, amount: Math.round(totalIncentive) };
    } catch (error: any) {
        console.error("Error calculating incentive:", error);
        return { success: false, error: error.message || "An unknown error occurred during calculation." };
    }
}
