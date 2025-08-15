

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

async function linkAuthorToPaper(existingPaper: ResearchPaper, user: User) {
    const paperRef = adminDb.collection('papers').doc(existingPaper.id);
    
    // Check if user is already an author (approved or pending)
    const isAlreadyAuthor = existingPaper.authors?.some(a => a.uid === user.uid);
    const isAlreadyRequested = existingPaper.coAuthorRequests?.some(a => a.uid === user.uid);

    if (isAlreadyAuthor || isAlreadyRequested) {
        console.log(`User ${user.email} is already linked or has a pending request for paper ${existingPaper.id}.`);
        return; // Already linked or requested
    }

    const newAuthorRequest: Author = {
        uid: user.uid,
        email: user.email,
        name: user.name,
        role: 'Co-Author', // Default role for requests
        isExternal: false,
        status: 'pending',
    };
    
    await paperRef.update({
        coAuthorRequests: FieldValue.arrayUnion(newAuthorRequest),
    });

    // Notify the main author
    if (existingPaper.mainAuthorUid) {
        const notification = {
            uid: existingPaper.mainAuthorUid,
            projectId: `/profile/${user.misId}`, // Link to requester's profile
            title: `${user.name} has requested to be added as a co-author on your paper: "${existingPaper.title}"`,
            createdAt: new Date().toISOString(),
            isRead: false,
        };
        await adminDb.collection('notifications').add(notification);
    }
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
        status: 'approved',
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
        coAuthorRequests: [],
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
        // Paper exists, create a request to link the user to it
        await linkAuthorToPaper(existingPaper, user);
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
