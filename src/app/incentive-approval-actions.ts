

'use server';

import { adminDb } from '@/lib/admin';
import type { IncentiveClaim, SystemSettings, ApprovalStage, User, ResearchPaper, Author } from '@/types';
import { getSystemSettings } from './actions';
import { sendEmail } from '@/lib/email';
import { FieldValue } from 'firebase-admin/firestore';

const EMAIL_STYLES = {
  background: 'style="background: linear-gradient(135deg, #0f2027, #203a43, #2c5364); color:#ffffff; font-family:Arial, sans-serif; padding:20px; border-radius:8px;"',
  logo: '<div style="text-align:center; margin-bottom:20px;"><img src="https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/RDC-PU-LOGO-WHITE.png" alt="RDC Logo" style="max-width:300px; height:auto;" /></div>',
  footer: ` 
    <p style="color:#b0bec5; margin-top: 30px;">Best Regards,</p>
    <p style="color:#b0bec5;">Research & Development Cell Team,</p>
    <p style="color:#b0bec5;">Parul University</p>
    <hr style="border-top: 1px solid #4f5b62; margin-top: 20px;">
    <p style="font-size:10px; color:#999999; text-align:center; margin-top:10px;">
        This is a system generated automatic email. If you feel this is an error, please report at the earliest.
    </p>`
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

const getClaimTypeAcronym = (claimType: string): string => {
    switch (claimType) {
        case 'Research Papers': return 'PAPER';
        case 'Patents': return 'PATENT';
        case 'Conference Presentations': return 'CONFERENCE';
        case 'Books': return 'BOOK';
        case 'Membership of Professional Bodies': return 'MEMBERSHIP';
        case 'Seed Money for APC': return 'APC';
        default: return 'GENERAL';
    }
};

export async function submitIncentiveClaim(claimData: Omit<IncentiveClaim, 'id' | 'claimId'>): Promise<{ success: boolean; error?: string, claimId?: string }> {
    try {
        const newClaimRef = adminDb.collection('incentiveClaims').doc();
        const claimId = newClaimRef.id;

        const acronym = getClaimTypeAcronym(claimData.claimType);
        const counterRef = adminDb.collection('counters').doc(`incentiveClaim_${acronym}`);
        
        const { current } = await adminDb.runTransaction(async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            const newCount = (counterDoc.data()?.current || 0) + 1;
            transaction.set(counterRef, { current: newCount }, { merge: true });
            return { current: newCount };
        });

        const standardizedClaimId = `RDC/IC/${acronym}/${String(current).padStart(4, '0')}`;
        
        const initialStatus = claimData.claimType === 'Research Papers' ? 'Pending' : 'Pending Stage 2 Approval';

        const finalClaimData: Omit<IncentiveClaim, 'id'> = {
            ...claimData,
            claimId: standardizedClaimId,
            status: claimData.status === 'Draft' ? 'Draft' : initialStatus,
            authors: claimData.authors || [],
            authorUids: (claimData.authors || []).map(a => a.uid).filter(Boolean) as string[],
        };

        // If it's a research paper, try to find the corresponding paper in the `papers` collection
        if (claimData.claimType === 'Research Papers' && claimData.paperTitle && claimData.relevantLink) {
            const papersRef = adminDb.collection('papers');
            const q = papersRef.where('url', '==', claimData.relevantLink).limit(1);
            const paperSnap = await q.get();
            if (!paperSnap.empty) {
                finalClaimData.paperId = paperSnap.docs[0].id;
            }
        }

        await newClaimRef.set(finalClaimData);

        // Send notifications to co-authors if it's not a draft
        if (finalClaimData.status !== 'Draft' && finalClaimData.authors) {
            const coAuthorsToNotify = finalClaimData.authors.filter(a => a.uid && a.uid !== claimData.uid);
            for (const coAuthor of coAuthorsToNotify) {
                const notification = {
                    uid: coAuthor.uid,
                    title: `${claimData.userName} has listed you as a co-author on an incentive claim.`,
                    createdAt: new Date().toISOString(),
                    isRead: false,
                    type: 'default',
                    projectId: '/dashboard/incentive-claim'
                };
                await adminDb.collection('notifications').add(notification);

                if (coAuthor.email) {
                    await sendEmail({
                        to: coAuthor.email,
                        subject: `You've been added as a co-author on an incentive claim`,
                        from: 'default',
                        html: `
                            <div ${EMAIL_STYLES.background}>
                                ${EMAIL_STYLES.logo}
                                <p style="color:#ffffff;">Dear ${coAuthor.name},</p>
                                <p style="color:#e0e0e0;">
                                    This is to inform you that ${claimData.userName} has submitted an incentive claim for the publication/work titled "<strong style="color:#ffffff;">${claimData.paperTitle || claimData.publicationTitle || 'N/A'}</strong>" and has listed you as a co-author.
                                </p>
                                <p style="color:#e0e0e0;">
                                    If you wish to claim your share of the incentive, please log in to the portal and visit the "Co-Author Claims" tab on the Incentive Claim page to submit your application.
                                </p>
                                ${EMAIL_STYLES.footer}
                            </div>
                        `
                    });
                }
            }
        }

        await logActivity('INFO', 'Incentive claim submitted', { claimId: standardizedClaimId, userId: claimData.uid });
        return { success: true, claimId: claimId };
    } catch (error: any) {
        console.error('Error submitting incentive claim:', error);
        await logActivity('ERROR', 'Failed to submit incentive claim', { error: error.message });
        return { success: false, error: error.message || 'An unexpected error occurred.' };
    }
}


async function addPaperFromApprovedClaim(claim: IncentiveClaim): Promise<void> {
    if (claim.claimType !== 'Research Papers' || !claim.paperTitle || !claim.relevantLink) {
        await logActivity('WARNING', 'Skipped paper creation from claim: not a research paper or missing title/link.', { claimId: claim.id });
        return;
    }

    try {
        const paperRef = adminDb.collection('papers').doc(); // Create a new document reference
        const now = new Date().toISOString();

        // Convert CoAuthor[] to Author[]
        const authors: Author[] = (claim.authors || []).map(bca => ({
            uid: bca.uid,
            email: bca.email,
            name: bca.name,
            role: bca.role,
            isExternal: bca.isExternal,
            status: 'approved', // Automatically approved since it comes from a sanctioned claim
        }));
        
        // Ensure the main claimant is in the authors list if not already present
        if (!authors.some(a => a.uid === claim.uid)) {
            authors.push({
                uid: claim.uid,
                email: claim.userEmail,
                name: claim.userName,
                role: 'Co-Author', // Default role, can be adjusted if more info is available
                isExternal: false,
                status: 'approved',
            });
        }
        
        const firstAuthor = authors.find(a => a.role === 'First Author' || a.role === 'First & Corresponding Author');
        const mainAuthorUid = firstAuthor?.uid || claim.uid;

        const newPaperData: Omit<ResearchPaper, 'id'> = {
            title: claim.paperTitle,
            url: claim.relevantLink,
            mainAuthorUid,
            authors,
            authorUids: authors.map(a => a.uid).filter(Boolean) as string[],
            authorEmails: authors.map(a => a.email.toLowerCase()),
            journalName: claim.journalName || null,
            journalWebsite: claim.journalWebsite || null,
            qRating: claim.journalClassification || null,
            createdAt: now,
            updatedAt: now,
        };

        await paperRef.set(newPaperData);
        await logActivity('INFO', 'Research paper automatically created from approved incentive claim.', { claimId: claim.id, paperId: paperRef.id, title: claim.paperTitle });

    } catch (error: any) {
        console.error('Error creating paper from claim:', error);
        await logActivity('ERROR', 'Failed to create paper from approved claim', { claimId: claim.id, error: error.message });
    }
}


export async function processIncentiveClaimAction(
  claimId: string,
  action: 'approve' | 'reject' | 'verify',
  approver: User,
  stageIndex: number, // 0, 1, 2, or 3
  data: { amount?: number; comments?: string, verifiedFields?: { [key: string]: boolean } }
): Promise<{ success: boolean; error?: string }> {
  try {
    const claimRef = adminDb.collection('incentiveClaims').doc(claimId);
    const claimSnap = await claimRef.get();

    if (!claimSnap.exists) {
      return { success: false, error: 'Incentive claim not found.' };
    }
    const claim = { id: claimSnap.id, ...claimSnap.data() } as IncentiveClaim;
    const settings = await getSystemSettings();
    
    if (!settings.incentiveApprovers || settings.incentiveApprovers.length <= stageIndex) {
        return { success: false, error: 'Approval workflow is not configured correctly.' };
    }
    const currentStageApprover = settings.incentiveApprovers.find(a => a.stage === stageIndex + 1);
    if (!currentStageApprover || approver.email?.toLowerCase() !== currentStageApprover.email.toLowerCase()) {
        return { success: false, error: 'You are not authorized to perform this action for this stage.' };
    }


    const newApproval: ApprovalStage = {
      approverUid: approver.uid,
      approverName: approver.name,
      status: action === 'reject' ? 'Rejected' : 'Approved',
      approvedAmount: data.amount || 0,
      comments: data.comments || '',
      timestamp: new Date().toISOString(),
      stage: stageIndex + 1,
      verifiedFields: data.verifiedFields || {},
    };
    
    const approvals = claim.approvals || [];
    // Ensure the array is long enough, fill with null if needed
    while (approvals.length <= stageIndex) {
        approvals.push(null as any); 
    }
    approvals[stageIndex] = newApproval;


    let newStatus: IncentiveClaim['status'];
    if (action === 'reject') {
      newStatus = 'Rejected';
    } else {
        const isChecklistStage = (stageIndex === 0 || stageIndex === 1) && claim.claimType === 'Research Papers';

        if (isChecklistStage && (action === 'verify' || action === 'approve')) {
             newStatus = `Pending Stage ${stageIndex + 2} Approval` as IncentiveClaim['status'];
        } else if (stageIndex === 3) { // Final approval stage is now 3 (for stage 4)
             newStatus = 'Accepted';
        } else {
             newStatus = `Pending Stage ${stageIndex + 2} Approval` as IncentiveClaim['status'];
        }
    }

    const updateData: { [key: string]: any } = {
        approvals,
        status: newStatus,
    };
    
    // Only update the final amount from Stage 2 onwards
    if (stageIndex > 1 && action === 'approve') {
        updateData.finalApprovedAmount = data.amount;
    }

    await claimRef.update(updateData);
    
    const claimTitle = claim.paperTitle || claim.publicationTitle || claim.patentTitle || 'your recent incentive claim';

    if (action === 'reject' && claim.userEmail) {
        await sendEmail({
            to: claim.userEmail,
            subject: `Update on Your Incentive Claim: ${claimTitle}`,
            from: 'default',
            html: `
                <div ${EMAIL_STYLES.background}>
                    ${EMAIL_STYLES.logo}
                    <p style="color:#ffffff;">Dear ${claim.userName},</p>
                    <p style="color:#e0e0e0;">
                        This email is to inform you about a decision on your recent incentive claim for "<strong style="color:#ffffff;">${claimTitle}</strong>".
                    </p>
                    <p style="color:#e0e0e0;">
                        After careful review, your application has been <strong style="color:#ff5252;">rejected</strong>.
                    </p>
                    <p style="color:#e0e0e0;">For more information, please visit the portal or contact the RDC office.</p>
                    ${EMAIL_STYLES.footer}
                </div>
            `
        });
    }

    if (action === 'approve' && stageIndex === 3) { // Final approval
        if (claim.userEmail) {
            await sendEmail({
                to: claim.userEmail,
                subject: `Congratulations! Your Incentive Claim for "${claimTitle}" has been Approved`,
                from: 'default',
                html: `
                    <div ${EMAIL_STYLES.background}>
                        ${EMAIL_STYLES.logo}
                        <p style="color:#ffffff;">Dear ${claim.userName},</p>
                        <p style="color:#e0e0e0;">
                            We are pleased to inform you that your incentive claim for "<strong style="color:#ffffff;">${claimTitle}</strong>" has been successfully approved by all committees.
                        </p>
                        <p style="color:#e0e0e0;">
                            The final approved incentive amount is <strong style="color:#ffffff;">₹${data.amount?.toLocaleString('en-IN') || 'N/A'}</strong>. The amount will be processed by the accounts department shortly.
                        </p>
                        <p style="color:#e0e0e0;">Congratulations on your achievement!</p>
                        ${EMAIL_STYLES.footer}
                    </div>
                `
            });
        }
        
        // If it's a research paper, add it to the papers collection for profiles.
        if (claim.claimType === 'Research Papers') {
            await addPaperFromApprovedClaim(claim);
        }
    }
    
    await logActivity('INFO', `Incentive claim action processed`, { claimId, action, stage: stageIndex + 1, approver: approver.name });
    return { success: true };
  } catch (error: any) {
    console.error('Error processing incentive claim action:', error);
    await logActivity('ERROR', 'Failed to process incentive claim action', { claimId, error: error.message });
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}
