
'use server';

import { adminDb } from '@/lib/admin';
import type { ResearchPaper, Author, User, Notification } from '@/types';
import { FieldValue } from 'firebase-admin/firestore';
import { getResearchDomainSuggestion } from '@/ai/flows/research-domain-suggestion';
import admin from 'firebase-admin';
import { sendEmail } from '@/app/actions';

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

const EMAIL_STYLES = {
  background: 'style="background: linear-gradient(135deg, #0f2027, #203a43, #2c5364); color:#ffffff; font-family:Arial, sans-serif; padding:20px; border-radius:8px;"',
  logo: '<div style="text-align:center; margin-bottom:20px;"><img src="https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/RDC-PU-LOGO-WHITE.svg" alt="RDC Logo" style="max-width:300px; height:auto;" /></div>',
  footer: ` 
    <p style="color:#b0bec5; margin-top: 30px;">Best Regards,</p>
    <p style="color:#b0bec5;">Research & Development Cell Team,</p>
    <p style="color:#b0bec5;">Parul University</p>
    <hr style="border-top: 1px solid #4f5b62; margin-top: 20px;">
    <p style="font-size:10px; color:#999999; text-align:center; margin-top:10px;">
        This is a system generated automatic email. If you feel this is an error, please report at the earliest.
    </p>`
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
            const profileLink = `/dashboard/notifications`;
            
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
  roles: Author['role'][]
): Promise<{ 
    success: boolean; 
    data: {
        newPapers: { title: string }[];
        linkedPapers: { paper: ResearchPaper, role: Author['role'] }[];
        errors: { title: string; reason: string }[];
    };
    error?: string 
}> {
  const newPapers: { title: string }[] = [];
  const linkedPapers: { paper: ResearchPaper, role: Author['role'] }[] = [];
  const errors: { title: string; reason: string }[] = [];

  for (const [index, row] of papersData.entries()) {
    const title = row.PublicationTitle?.trim();
    const url = row.PublicationURL?.trim();
    const role = roles[index];

    if (!title || !url) {
      errors.push({ title: title || 'Untitled', reason: 'Missing title or URL.' });
      continue;
    }
    if (!role) {
      errors.push({ title, reason: 'Missing role for this paper.' });
      continue;
    }

    try {
      const existingPaper = await findExistingPaper(title, url);

      if (existingPaper) {
        linkedPapers.push({ paper: existingPaper, role: role });
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
        
        const result = await adminDb.runTransaction(async (transaction) => {
            const paperSnap = await transaction.get(paperRef);
            if (!paperSnap.exists) {
                throw new Error('Paper not found.');
            }
            const paperData = paperSnap.data() as ResearchPaper;
            const mainAuthorUid = paperData.mainAuthorUid;
            const mainAuthor = paperData.authors.find(a => a.uid === mainAuthorUid);
            if (!mainAuthor) {
                throw new Error('Main author not found on paper.');
            }

            const requestToRemove = (paperData.coAuthorRequests || []).find(req => req.uid === requestingAuthor.uid && req.email === requestingAuthor.email);
            if (!requestToRemove) {
                throw new Error('This co-author request was not found. It may have been withdrawn or already processed.');
            }

            // Always remove the request from the array
            transaction.update(paperRef, { coAuthorRequests: FieldValue.arrayRemove(requestToRemove) });

            if (action === 'accept' && assignedRole) {
                let currentAuthors = paperData.authors || [];

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
                    authors: updatedAuthors,
                    authorUids: updatedAuthorUids,
                    authorEmails: updatedAuthorEmails,
                });
            }
            
            return { paper: paperData, mainAuthor };
        });

        const { paper, mainAuthor } = result;
        const mainAuthorName = mainAuthor.name;

        // --- Send Notifications Outside Transaction ---
        if (requestingAuthor.uid) {
            const notificationTitle = action === 'accept'
                ? `${mainAuthorName} accepted your request to be a ${assignedRole} on "${paper.title}"`
                : `${mainAuthorName} rejected your co-author request for "${paper.title}"`;
            
            const notification: Omit<Notification, 'id'> = {
                uid: requestingAuthor.uid,
                title: notificationTitle,
                createdAt: new Date().toISOString(),
                isRead: false,
                type: 'default',
            };
            await adminDb.collection('notifications').add(notification);
            
            const acceptedHtml = `
                <div ${EMAIL_STYLES.background}>
                    ${EMAIL_STYLES.logo}
                    <p style="color:#ffffff;">Dear ${requestingAuthor.name},</p>
                    <p style="color:#e0e0e0;">
                        This is to inform you that ${mainAuthorName} has <strong>accepted</strong> your request to be added as a
                        <strong style="color:#ffffff;">${assignedRole}</strong> on the paper titled:
                        <br>
                        "<strong style="color:#ffffff;">${paper.title}</strong>".
                    </p>
                    <p style="color:#e0e0e0;">You have been successfully added to the list of authors.</p>
                    <p style="color:#e0e0e0;">
                        You can view your updated publication list on the 
                        <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/my-projects" style="color:#64b5f6; text-decoration:underline;">
                          PU Research Projects Portal
                        </a>.
                    </p>
                    ${EMAIL_STYLES.footer}
                </div>
            `;
            
            const rejectedHtml = `
                 <div ${EMAIL_STYLES.background}>
                    ${EMAIL_STYLES.logo}
                    <p style="color:#ffffff;">Dear ${requestingAuthor.name},</p>
                    <p style="color:#e0e0e0;">
                        This is an update regarding your co-author request for the paper titled:
                        <br>
                        "<strong style="color:#ffffff;">${paper.title}</strong>".
                    </p>
                    <p style="color:#e0e0e0;">
                        ${mainAuthorName} has <strong>rejected</strong> your request.
                    </p>
                     <p style="color:#e0e0e0;">If you believe this is a mistake, please contact the main author directly.</p>
                    ${EMAIL_STYLES.footer}
                </div>
            `;

            
            await sendEmail({
                to: requestingAuthor.email,
                subject: `Update on your co-author request for "${paper.title}"`,
                html: action === 'accept' ? acceptedHtml : rejectedHtml,
                from: 'default'
            });
        }

        return { success: true };

    } catch (error: any) {
        console.error("Error managing co-author request:", error);
        return { success: false, error: error.message || 'Server error.' };
    }
}

    