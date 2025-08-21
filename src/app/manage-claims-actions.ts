
'use server';

import { adminDb } from '@/lib/admin';
import type { IncentiveClaim } from '@/types';
import { sendEmail as sendEmailUtility } from "@/lib/email";

// --- Centralized Logging Service ---
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

const EMAIL_STYLES = {
  background:
    'style="background: linear-gradient(135deg, #0f2027, #203a43, #2c5364); color:#ffffff; font-family:Arial, sans-serif; padding:20px; border-radius:8px;"',
  logo: '<div style="text-align:center; margin-bottom:20px;"><img src="https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/RDC-PU-LOGO-WHITE.png" alt="RDC Logo" style="max-width:300px; height:auto;" /></div>',
  footer: ` 
    <p style="color:#b0bec5; margin-top: 30px;">Best Regards,</p>
    <p style="color:#b0bec5;">Research & Development Cell Team,</p>
    <p style="color:#b0bec5;">Parul University</p>
    <hr style="border-top: 1px solid #4f5b62; margin-top: 20px;">
    <p style="font-size:10px; color:#999999; text-align:center; margin-top:10px;">
        This is a system generated automatic email. If you feel this is an error, please report at the earliest.
    </p>`,
};


export async function markPaymentsCompleted(claimIds: string[]): Promise<{ success: boolean; error?: string }> {
  if (!claimIds || claimIds.length === 0) {
    return { success: false, error: 'No claim IDs provided.' };
  }

  try {
    const claimsRef = adminDb.collection('incentiveClaims');
    const batch = adminDb.batch();
    
    const claimsQuery = await claimsRef.where(adminDb.firestore.FieldPath.documentId(), 'in', claimIds).get();
    
    for (const doc of claimsQuery.docs) {
      const claim = { id: doc.id, ...doc.data() } as IncentiveClaim;
      
      if(claim.status !== 'Submitted to Accounts') {
          console.warn(`Skipping claim ${claim.id} for payment completion as its status is not 'Submitted to Accounts'.`);
          continue;
      }
      
      // Update status in the batch
      batch.update(doc.ref, { status: 'Payment Completed' });
      
      // Prepare notification and email
      const claimTitle = claim.paperTitle || claim.publicationTitle || claim.patentTitle || 'your recent incentive claim';

      const notification = {
        uid: claim.uid,
        title: `Payment for your claim "${claimTitle}" has been processed.`,
        createdAt: new Date().toISOString(),
        isRead: false,
      };
      const notificationRef = adminDb.collection('notifications').doc();
      batch.set(notificationRef, notification);

      if (claim.userEmail) {
        const emailHtml = `
            <div ${EMAIL_STYLES.background}>
                ${EMAIL_STYLES.logo}
                <p style="color:#ffffff;">Dear ${claim.userName},</p>
                <p style="color:#e0e0e0;">
                    We are pleased to inform you that the payment for your incentive claim for "<strong style="color:#ffffff;">${claimTitle}</strong>" has been successfully processed.
                </p>
                <p style="color:#e0e0e0;">
                    The approved amount of <strong style="color:#ffffff;">₹${claim.finalApprovedAmount?.toLocaleString('en-IN') || 'N/A'}</strong> has been disbursed to your registered bank account.
                </p>
                <p style="color:#e0e0e0;">Thank you for your contribution to research at Parul University.</p>
                ${EMAIL_STYLES.footer}
            </div>
        `;
        
        await sendEmailUtility({
            to: claim.userEmail,
            subject: `Payment Processed for Your Incentive Claim`,
            html: emailHtml,
            from: 'default'
        });
      }
    }

    await batch.commit();
    await logActivity('INFO', 'Marked incentive payments as completed', { claimIds, count: claimIds.length });

    return { success: true };
  } catch (error: any) {
    console.error('Error marking payments as completed:', error);
    await logActivity('ERROR', 'Failed to mark payments as completed', { claimIds, error: error.message });
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}

export async function submitToAccounts(claimIds: string[]): Promise<{ success: boolean; error?: string }> {
  if (!claimIds || claimIds.length === 0) {
    return { success: false, error: 'No claim IDs provided.' };
  }
  
  try {
    const claimsRef = adminDb.collection('incentiveClaims');
    const batch = adminDb.batch();
    
    const claimsQuery = await claimsRef.where(adminDb.firestore.FieldPath.documentId(), 'in', claimIds).get();
    
    for (const doc of claimsQuery.docs) {
        const claim = doc.data() as IncentiveClaim;
        if(claim.status !== 'Accepted') {
            console.warn(`Skipping claim ${doc.id} for submission to accounts as its status is not 'Accepted'.`);
            continue;
        }
        batch.update(doc.ref, { status: 'Submitted to Accounts' });
    }

    await batch.commit();
    await logActivity('INFO', 'Submitted claims to accounts', { claimIds, count: claimIds.length });

    return { success: true };
  } catch (error: any) {
    console.error('Error submitting claims to accounts:', error);
    await logActivity('ERROR', 'Failed to submit claims to accounts', { claimIds, error: error.message });
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}
