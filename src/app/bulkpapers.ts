
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
                title: `${requestingUser.name} has requested to be added as a ${requesterRole} on your paper: "${existingPaper.title}"`,
                createdAt: new Date().toISOString(),
                isRead: false,
                type: 'coAuthorRequest',
                paperId: existingPaper.id,
                requester: newAuthorRequest,
                projectId: profileLink,
            };
            await adminDb.collection('notifications').add(notification);
        }
        return { success: true };
    } catch (error: any) {
        console.error('Error sending co-author request:', error);
        return { success: false, error: error.message || 'Server error while sending request.' };
    }
}


async function createNewPaper(paperData: PaperUploadData, user: User, role: Author['role']): Promise<ResearchPaper> {
    const paperRef = adminDb.collection('papers').doc();
    const now = new Date().toISOString();

    const mainAuthor: Author = {
        uid: user.uid,
        email: user.email,
        name: user.name,
        role: role,
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
  user: User,
  role: Author['role']
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
        await createNewPaper(row, user, role);
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
    assignedRole?: Author['role'],
    mainAuthorNewRole?: Author['role']
): Promise<{ success: boolean; error?: string }> {
    try {
        const paperRef = adminDb.collection('papers').doc(paperId);
        
        return await adminDb.runTransaction(async (transaction) => {
            const paperSnap = await transaction.get(paperRef);
            if (!paperSnap.exists) {
                throw new Error('Paper not found.');
            }
            const paperData = paperSnap.data() as ResearchPaper;
            const mainAuthorUid = paperData.mainAuthorUid;

            const requestToRemove = (paperData.coAuthorRequests || []).find(req => req.uid === requestingAuthor.uid && req.email === requestingAuthor.email);
            if (!requestToRemove) {
                throw new Error('This co-author request was not found. It may have been withdrawn or already processed.');
            }

            if (action === 'reject') {
                transaction.update(paperRef, { coAuthorRequests: FieldValue.arrayRemove(requestToRemove) });
                return { success: true };
            }

            if (action === 'accept' && assignedRole) {
                let currentAuthors = paperData.authors || [];

                // Handle potential role conflicts by updating the main author's role if a new one is provided
                if (mainAuthorNewRole && mainAuthorUid) {
                    const mainAuthorIndex = currentAuthors.findIndex(author => author.uid === mainAuthorUid);
                    if (mainAuthorIndex !== -1) {
                        currentAuthors[mainAuthorIndex].role = mainAuthorNewRole;
                    }
                }
                
                const newAuthor: Author = { ...requestingAuthor, role: assignedRole, status: 'approved' };
                const updatedAuthors = [...currentAuthors, newAuthor];
                
                const updatedAuthorUids = [...new Set([...(paperData.authorUids || []), newAuthor.uid])].filter(Boolean) as string[];
                const updatedAuthorEmails = [...new Set([...(paperData.authorEmails || []), newAuthor.email.toLowerCase()])];

                transaction.update(paperRef, {
                    coAuthorRequests: FieldValue.arrayRemove(requestToRemove),
                    authors: updatedAuthors,
                    authorUids: updatedAuthorUids,
                    authorEmails: updatedAuthorEmails,
                });
                return { success: true };
            }
            
            throw new Error('Invalid action or missing role for acceptance.');
        });

    } catch (error: any) {
        console.error("Error managing co-author request:", error);
        return { success: false, error: error.message || 'Server error.' };
    }
}
