
'use server';

import { adminDb } from '@/lib/admin';
import type { IncentiveClaim, SystemSettings, ApprovalStage, User } from '@/types';
import { getSystemSettings } from './actions';
import { sendEmail } from '@/lib/email';
import { FieldValue } from 'firebase-admin/firestore';

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

export async function processIncentiveClaimAction(
  claimId: string,
  action: 'approve' | 'reject',
  approver: User,
  stageIndex: number, // 0, 1, or 2
  data: { amount?: number; comments?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const claimRef = adminDb.collection('incentiveClaims').doc(claimId);
    const claimSnap = await claimRef.get();

    if (!claimSnap.exists) {
      return { success: false, error: 'Incentive claim not found.' };
    }
    const claim = claimSnap.data() as IncentiveClaim;
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
      status: action === 'approve' ? 'Approved' : 'Rejected',
      approvedAmount: data.amount || 0,
      comments: data.comments || '',
      timestamp: new Date().toISOString(),
      stage: stageIndex + 1,
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
      if (stageIndex === 2) { // Final approval stage
        newStatus = 'Submitted to Accounts';
      } else {
        newStatus = `Pending Stage ${stageIndex + 2} Approval` as IncentiveClaim['status'];
      }
    }

    await claimRef.update({
      approvals,
      status: newStatus,
      finalApprovedAmount: data.amount // Keep updating the final amount at each approval stage
    });
    
    // Notifications and emails to applicants are removed as per new requirement.
    
    await logActivity('INFO', `Incentive claim ${action}d`, { claimId, stage: stageIndex + 1, approver: approver.name });
    return { success: true };
  } catch (error: any) {
    console.error('Error processing incentive claim action:', error);
    await logActivity('ERROR', 'Failed to process incentive claim action', { claimId, error: error.message });
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}
