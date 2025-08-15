

'use server';

import { adminDb } from '@/lib/admin';
import type { ResearchPaper, Author, User, Notification } from '@/types';
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

export async function sendCoAuthorRequest(
    existingPaper: ResearchPaper, 
    requestingUser: User, 
    requesterRole: Author['role']
): Promise<{ success: boolean; error?: string }> {
    try {
        const paperRef = adminDb.collection('papers').doc(existingPaper.id);
        
        const isAlreadyAuthor = existingPaper.authors?.some(a => a.uid === requestingUser.uid && a.status === 'approved');
        const isAlreadyRequested = existingPaper.coAuthorRequests?.some(a => a.uid === requestingUser.uid);

        if (isAlreadyAuthor || isAlreadyRequested) {
            return { success: false, error: 'You are already an author or have a pending request for this paper.' };
        }

        const newAuthorRequest: Author = {
            uid: requestingUser.uid,
            email: requestingUser.email,
            name: requestingUser.name,
            role: requesterRole, 
            isExternal: false,
            status: 'pending',
        };
        
        await paperRef.update({
            coAuthorRequests: FieldValue.arrayUnion(newAuthorRequest),
        });

        if (existingPaper.mainAuthorUid) {
            const mainAuthorDoc = await adminDb.collection('users').doc(existingPaper.mainAuthorUid).get();
            const mainAuthorData = mainAuthorDoc.exists ? mainAuthorDoc.data() as User : null;
            const mainAuthorCampus = mainAuthorData?.campus;
            const profileLink = mainAuthorCampus === 'Goa' ? `/goa/${mainAuthorData?.misId}` : `/profile/${mainAuthorData?.misId}`;
            
            const notification: Omit<Notification, 'id'> = {
                uid: existingPaper.mainAuthorUid,
                title: `${requestingUser.name} has requested to be added as a co-author on your paper: "${existingPaper.title}"`,
                createdAt: new Date().toISOString(),
                isRead: false,
                type: 'coAuthorRequest',
                paperId: existingPaper.id,
                requester: newAuthorRequest,
            };
            await adminDb.collection('notifications').add(notification);
        }
        return { success: true };
    } catch (error: any) {
        console.error('Error sending co-author request:', error);
        return { success: false, error: error.message || 'Server error while sending request.' };
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
        journalName: paperData.JournalName ?? null,
        journalWebsite: paperData.JournalWebsite ?? null,
        qRating: paperData.QRating ?? null,
        impactFactor: paperData.ImpactFactor ?? null,
        createdAt: now,
        updatedAt: now,
        coAuthorRequests: [],
    };

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
        linkedPapers: ResearchPaper[];
        errors: { title: string; reason: string }[];
    };
    error?: string 
}> {
  const newPapers: { title: string }[] = [];
  const linkedPapers: ResearchPaper[] = [];
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
        linkedPapers.push(existingPaper);
      } else {
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

export async function manageCoAuthorRequest(
    paperId: string,
    requestingAuthor: Author,
    action: 'accept' | 'reject',
    assignedRole?: Author['role']
): Promise<{ success: boolean; error?: string }> {
    try {
        const paperRef = adminDb.collection('papers').doc(paperId);
        const paperSnap = await paperRef.get();
        if (!paperSnap.exists) {
            return { success: false, error: 'Paper not found.' };
        }
        const paperData = paperSnap.data() as ResearchPaper;

        // Find the specific request in the array to remove it accurately
        const requestToRemove = (paperData.coAuthorRequests || []).find(req => req.uid === requestingAuthor.uid && req.email === requestingAuthor.email);

        if (!requestToRemove) {
            return { success: false, error: 'This co-author request was not found. It may have been withdrawn or already processed.' };
        }

        if (action === 'reject') {
            await paperRef.update({
                coAuthorRequests: FieldValue.arrayRemove(requestToRemove),
            });
            return { success: true };
        }

        if (action === 'accept' && assignedRole) {
            const currentAuthors = paperData.authors || [];
            if (assignedRole === 'First Author' && currentAuthors.some(a => a.role === 'First Author' || a.role === 'First & Corresponding Author')) {
                return { success: false, error: 'A First Author already exists for this paper.' };
            }
             if (assignedRole === 'Corresponding Author' && currentAuthors.some(a => a.role === 'Corresponding Author' || a.role === 'First & Corresponding Author')) {
                return { success: false, error: 'A Corresponding Author already exists.' };
            }
             if (assignedRole === 'First & Corresponding Author' && (currentAuthors.some(a => a.role === 'First Author' || a.role === 'First & Corresponding Author') || currentAuthors.some(a => a.role === 'Corresponding Author' || a.role === 'First & Corresponding Author'))) {
                return { success: false, error: 'A First or Corresponding Author already exists.' };
            }

            const newAuthor: Author = { ...requestingAuthor, role: assignedRole, status: 'approved' };
            await paperRef.update({
                coAuthorRequests: FieldValue.arrayRemove(requestToRemove),
                authors: FieldValue.arrayUnion(newAuthor),
                authorUids: FieldValue.arrayUnion(newAuthor.uid),
                authorEmails: FieldValue.arrayUnion(newAuthor.email),
            });
            return { success: true };
        }

        return { success: false, error: 'Invalid action or missing role.' };
    } catch (error: any) {
        console.error("Error managing co-author request:", error);
        return { success: false, error: error.message || 'Server error.' };
    }
}
