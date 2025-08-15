
'use server';

import { adminDb } from '@/lib/admin';
import type { ResearchPaper, Author, User } from '@/types';
import { FieldValue } from 'firebase-admin/firestore';
import { getResearchDomainSuggestion } from '@/ai/flows/research-domain-suggestion';
import admin from 'firebase-admin';

type PaperUploadData = {
    PublicationTitle: string;
    PublicationURL: string;
    PublicationYear?: number;
    PublicationMonthName?: string;
    ImpactFactor?: number;
    JournalName?: string;
    JournalWebsite?: string;
    QRating?: string;
};

async function findExistingPaper(title: string, url: string): Promise<ResearchPaper | null> {
    const papersRef = adminDb.collection('papers');
    const titleQuery = papersRef.where('title', '==', title);
    const urlQuery = papersRef.where('url', '==', url);

    const [titleSnapshot, urlSnapshot] = await Promise.all([
        titleQuery.get(),
        urlQuery.get()
    ]);

    if (!titleSnapshot.empty) {
        return { id: titleSnapshot.docs[0].id, ...titleSnapshot.docs[0].data() } as ResearchPaper;
    }
    if (!urlSnapshot.empty) {
        return { id: urlSnapshot.docs[0].id, ...urlSnapshot.docs[0].data() } as ResearchPaper;
    }

    return null;
}

async function linkAuthorToPaper(paperId: string, user: User) {
    const paperRef = adminDb.collection('papers').doc(paperId);
    
    // Use a transaction to safely update the author arrays
    await adminDb.runTransaction(async (transaction) => {
        const paperDoc = await transaction.get(paperRef);
        if (!paperDoc.exists) {
            throw new Error("Paper not found");
        }
        const paperData = paperDoc.data() as ResearchPaper;
        
        // Check if user is already an author
        if (paperData.authorUids?.includes(user.uid)) {
            return; // Already linked
        }

        const newAuthor: Author = {
            uid: user.uid,
            email: user.email,
            name: user.name,
            role: 'Co-Author', // Default role when linking
            isExternal: false,
        };
        
        transaction.update(paperRef, {
            authors: FieldValue.arrayUnion(newAuthor),
            authorUids: FieldValue.arrayUnion(user.uid),
            authorEmails: FieldValue.arrayUnion(user.email.toLowerCase()),
        });
    });
}

async function createNewPaper(paperData: PaperUploadData, user: User): Promise<ResearchPaper> {
    const paperRef = adminDb.collection('papers').doc();
    const now = new Date().toISOString();

    const mainAuthor: Author = {
        uid: user.uid,
        email: user.email,
        name: user.name,
        role: 'First Author', // Default for new submissions
        isExternal: false,
    };

    const newPaper: Omit<ResearchPaper, 'id'> = {
        title: paperData.PublicationTitle,
        url: paperData.PublicationURL,
        mainAuthorUid: user.uid,
        authors: [mainAuthor],
        authorUids: [user.uid],
        authorEmails: [user.email.toLowerCase()],
        journalName: paperData.JournalName,
        journalWebsite: paperData.JournalWebsite,
        qRating: paperData.QRating,
        impactFactor: paperData.ImpactFactor,
        createdAt: now,
        updatedAt: now,
    };

    // AI Domain Suggestion
    try {
        const domainResult = await getResearchDomainSuggestion({ paperTitles: [newPaper.title] });
        newPaper.domain = domainResult.domain;
        await adminDb.collection('users').doc(user.uid).update({ researchDomain: domainResult.domain });
    } catch (aiError: any) {
        console.warn("AI domain suggestion failed for new paper:", aiError.message);
    }
    
    await paperRef.set(newPaper);
    return { id: paperRef.id, ...newPaper };
}


export async function bulkUploadPapers(
  papersData: PaperUploadData[],
  user: User
): Promise<{ 
    success: boolean; 
    data: {
        newPapers: { title: string }[];
        linkedPapers: { title: string }[];
        errors: { title: string; reason: string }[];
    };
    error?: string 
}> {
  const newPapers: { title: string }[] = [];
  const linkedPapers: { title: string }[] = [];
  const errors: { title: string; reason: string }[] = [];

  for (const row of papersData) {
    const title = row.PublicationTitle?.trim();
    const url = row.PublicationURL?.trim();

    if (!title || !url) {
      errors.push({ title: title || 'Untitled', reason: 'Missing title or URL.' });
      continue;
    }

    try {
      const existingPaper = await findExistingPaper(title, url);

      if (existingPaper) {
        // Paper exists, link the user to it
        await linkAuthorToPaper(existingPaper.id, user);
        linkedPapers.push({ title });
      } else {
        // Paper doesn't exist, create it
        await createNewPaper(row, user);
        newPapers.push({ title });
      }
    } catch (error: any) {
      console.error(`Error processing paper "${title}":`, error);
      errors.push({ title, reason: error.message || "An unknown server error occurred." });
    }
  }

  return { success: true, data: { newPapers, linkedPapers, errors } };
}
