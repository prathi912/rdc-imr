'use server';

import { IncentiveClaim, ApprovalStage, User, ResearchPaper, Author } from "@/types"
import { isEligibleForFinancialDisbursement } from "@/lib/incentive-eligibility"
import { sendEmail as sendEmailUtility } from "@/lib/email"
import { logEvent } from "@/lib/logger"
import { GovernanceLogger } from "@/lib/governance-logger"
import { logActivity, EMAIL_STYLES } from "./utils"
import { getSystemSettings } from "./system-service"
import { FieldPath, FieldValue, Transaction } from "firebase-admin/firestore"
import { adminDb, adminAuth, adminRtdb } from "@/lib/admin";
import { getDefaultModulesForRole } from "@/lib/modules"
import { format } from "date-fns"
import ExcelJS from "exceljs"
import { checkAuth } from "@/lib/check-auth"

export async function checkPatentUniqueness(title: string, applicationNumber: string, currentClaimId?: string): Promise<{ isUnique: boolean; message?: string }> {
  try {
    const claimsRef = adminDb.collection('incentiveClaims');

    const titleQuery = claimsRef.where('patentTitle', '==', title);
    const appNumberQuery = claimsRef.where('patentApplicationNumber', '==', applicationNumber);

    const [titleSnapshot, appNumberSnapshot] = await Promise.all([
      titleQuery.get(),
      appNumberQuery.get()
    ]);

    const conflictingTitle = titleSnapshot.docs.find((doc: any) => doc.id !== currentClaimId);
    if (conflictingTitle) {
      return { isUnique: false, message: `A claim with the title "${title}" already exists.` };
    }

    const conflictingAppNumber = appNumberSnapshot.docs.find((doc: any) => doc.id !== currentClaimId);
    if (conflictingAppNumber) {
      return { isUnique: false, message: `A claim with the application number "${applicationNumber}" already exists.` };
    }

    return { isUnique: true };
  } catch (error: any) {
    console.error("Error checking patent uniqueness:", error);
    await logActivity('ERROR', 'Failed to check patent uniqueness', { title, applicationNumber, error: error.message });
    return { isUnique: true };
  }
}

export async function updateIncentiveClaimStatus(claimId: string, newStatus: IncentiveClaim["status"]) {
  try {
    const claimRef = adminDb.collection("incentiveClaims").doc(claimId)
    const claimSnap = await claimRef.get()

    if (!claimSnap.exists) {
      return { success: false, error: "Incentive claim not found." }
    }
    const claim = claimSnap.data() as IncentiveClaim

    await claimRef.update({ status: newStatus })

    try {
      const { sanitizeForRtdb } = await import('@/lib/rtdb-utils');
      const sanitizedUpdate = sanitizeForRtdb({
        status: newStatus,
        lastSyncedAt: new Date().toISOString()
      });
      await adminRtdb.ref(`incentiveClaims/${claimId}`).update(sanitizedUpdate);
    } catch (rtdbError) {
      console.error(`RTDB Sync Error (updateIncentiveClaimStatus) for claim ${claimId}:`, rtdbError);
    }
    
    await GovernanceLogger.logEntityChange(
        claimId,
        'CLAIM',
        'SYSTEM_ADMIN',
        claim,
        { ...claim, status: newStatus }
    );

    await logActivity("INFO", "Incentive claim status updated", { claimId, newStatus, userId: claim.uid })
    await logEvent('WORKFLOW', 'Incentive claim status updated', {
      metadata: { claimId, newStatus, userName: claim.userName, claimId_human: claim.claimId },
      user: { uid: claim.uid, email: claim.userEmail, role: 'faculty' },
      status: newStatus.includes('Approval') || newStatus === 'Payment Completed' ? 'success' : 'info'
    });

    const claimTitle =
      claim.paperTitle ||
      claim.patentTitle ||
      claim.conferencePaperTitle ||
      claim.publicationTitle ||
      claim.professionalBodyName ||
      claim.apcPaperTitle ||
      "Your Claim"

    const notification = {
      uid: claim.uid,
      projectId: claimId,
      title: `Your incentive claim for "${claimTitle}" was updated to: ${newStatus}`,
      createdAt: new Date().toISOString(),
      isRead: false,
    }
    await adminDb.collection("notifications").add(notification)

    if (claim.userEmail) {
      await sendEmailUtility({
        to: claim.userEmail,
        subject: `Incentive Claim Status Update: ${newStatus}`,
        html: `
            <div ${EMAIL_STYLES.background}>
                ${EMAIL_STYLES.logo}
                <p style="color:#ffffff;">Dear ${claim.userName},</p>
                <p style="color:#e0e0e0;">
                  The status of your incentive claim for 
                  "<strong style="color:#ffffff;">${claimTitle}</strong>" has been updated to 
                  <strong style="color:${newStatus === "Accepted" ? "#00e676" : newStatus === "Rejected" ? "#ff5252" : "#ffca28"};">
                    ${newStatus}
                  </strong>.
                </p>
                <p style="color:#e0e0e0;">
                  You can view your claims on the 
                  <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/incentive-claim" style="color:#64b5f6; text-decoration:underline;">
                 PU Research Projects Portal             
                  </a>.
                </p>
                ${EMAIL_STYLES.footer}
            </div>
            `,
        from: "default",
      })
    }

    return { success: true }
  } catch (error: any) {
    console.error("Error updating incentive claim status:", error)
    await logActivity("ERROR", "Failed to update incentive claim status", {
      claimId,
      newStatus,
      error: error.message,
    })
    return { success: false, error: error.message || "Failed to update status." }
  }
}

// --- Migrated Logic from Legacy Actions ---

const getClaimTypeAcronym = (claimType: string): string => {
  switch (claimType) {
    case "Research Papers": return "PAPER"
    case "Patents": return "PATENT"
    case "Conference Presentations": return "CONFERENCE"
    case "Books": return "BOOK"
    case "Membership of Professional Bodies": return "MEMBERSHIP"
    case "Seed Money for APC": return "APC"
    case "EMR Sanction Project": return "EMR"
    default: return "GENERAL"
  }
}

const getClaimTitle = (claimData: Partial<IncentiveClaim>): string => {
  return claimData.paperTitle 
      || claimData.publicationTitle 
      || claimData.patentTitle 
      || claimData.conferencePaperTitle 
      || claimData.professionalBodyName 
      || claimData.apcPaperTitle 
      || claimData.emrProjectName
      || 'your recent incentive claim';
}

const isClaimEmpty = (claimData: Partial<IncentiveClaim>): boolean => {
  const fieldsToExclude = ['uid', 'userName', 'userEmail', 'faculty', 'status', 'submissionDate', 'claimType', 'benefitMode', 'authors', 'authorUids', 'authorEmails', 'calculatedIncentive', 'originalClaimId', 'id', 'claimId'];
  const hasContent = Object.entries(claimData).some(([key, value]) => {
      if (fieldsToExclude.includes(key)) return false;
      if (value === null || value === undefined) return false;
      if (typeof value === 'string') return value.trim().length > 0;
      if (typeof value === 'number') return true;
      if (typeof value === 'boolean') return true;
      return false;
  });
  return !hasContent;
}

export async function submitIncentiveClaim(claimData: Omit<IncentiveClaim, 'id' | 'claimId'>, claimIdToUpdate?: string): Promise<{ success: boolean; error?: string, claimId?: string }> {
  try {
      const session = await checkAuth();
      if (!session.authenticated) return { success: false, error: "Unauthorized." };
      const isAdmin = session.role === 'admin' || session.role === 'Super-admin';

      if (!isAdmin && session.uid !== claimData.uid) {
          return { success: false, error: "Unauthorized." };
      }

      const claimsRef = adminDb.collection('incentiveClaims');

      if (claimData.status === 'Draft') {
          if (isClaimEmpty(claimData)) {
              return { success: false, error: 'A completely blank application cannot be saved as a draft.' };
          }
          if (!claimIdToUpdate) {
              const draftCountSnap = await claimsRef
                  .where('uid', '==', claimData.uid)
                  .where('status', '==', 'Draft')
                  .count()
                  .get();
              if (draftCountSnap.data().count >= 10) {
                  return { success: false, error: 'You cannot have more than 10 active drafts.' };
              }
          }
      }

      if (claimData.status !== 'Draft') {
          if (claimData.claimType === 'Membership of Professional Bodies') {
              const currentYear = new Date().getFullYear();
              const startOfYear = `${currentYear}-01-01T00:00:00.000Z`;
              const endOfYear = `${currentYear}-12-31T23:59:59.999Z`;

              const membershipClaimsSnap = await claimsRef
                  .where('uid', '==', claimData.uid)
                  .where('claimType', '==', 'Membership of Professional Bodies')
                  .where('submissionDate', '>=', startOfYear)
                  .where('submissionDate', '<=', endOfYear)
                  .get();

              const existingValidClaim = membershipClaimsSnap.docs.find((doc: any) => 
                  doc.id !== claimIdToUpdate && 
                  doc.data().status !== 'Draft' && 
                  doc.data().status !== 'Rejected'
              );

              if (existingValidClaim) {
                  return { success: false, error: 'Only one Membership Incentive per calendar year is allowed.' };
              }
          }

          let fieldToCheck: keyof IncentiveClaim | null = null;
          let valueToCheck: string | undefined = undefined;

          switch (claimData.claimType) {
              case 'Research Papers': if (claimData.doi) { fieldToCheck = 'doi'; valueToCheck = claimData.doi; } break;
              case 'Books': fieldToCheck = 'publicationTitle'; valueToCheck = claimData.publicationTitle; break;
              case 'Patents': fieldToCheck = 'patentTitle'; valueToCheck = claimData.patentTitle; break;
              case 'Membership of Professional Bodies': fieldToCheck = 'membershipNumber'; valueToCheck = claimData.membershipNumber; break;
          }
          
          if (fieldToCheck && valueToCheck) {
              const existingClaimsSnap = await claimsRef.where(fieldToCheck, '==', valueToCheck).where('uid', '==', claimData.uid).get();
              const duplicateClaim = existingClaimsSnap.docs.find((doc: any) => doc.id !== claimIdToUpdate && doc.data().status !== 'Draft');
              if (duplicateClaim) {
                  return { success: false, error: `You have already submitted an incentive claim for this work.` };
              }
          }
      }

      const newClaimRef = claimIdToUpdate ? claimsRef.doc(claimIdToUpdate) : claimsRef.doc();
      const claimId = newClaimRef.id;

      let standardizedClaimId = (claimData as any).claimId;
      if (!standardizedClaimId && !claimIdToUpdate) {
          const acronym = getClaimTypeAcronym(claimData.claimType);
          const counterRef = adminDb.collection('counters').doc(`incentiveClaim_${acronym}`);
          const { current } = await adminDb.runTransaction(async (transaction: Transaction) => {
              const counterDoc = await transaction.get(counterRef);
              const newCount = (counterDoc.data()?.current || 0) + 1;
              transaction.set(counterRef, { current: newCount }, { merge: true });
              return { current: newCount };
          });
          standardizedClaimId = `RDC/IC/${acronym}/${String(current).padStart(4, '0')}`;
      }
      
      const settings = await getSystemSettings();
      const workflow = settings.incentiveApprovalWorkflows?.[claimData.claimType];
      let initialStatus: IncentiveClaim['status'] = 'Accepted';
      if (workflow && workflow.length > 0) {
          const firstStage = Math.min(...workflow);
          initialStatus = `Pending Stage ${firstStage} Approval` as IncentiveClaim['status'];
      }

      const finalClaimData: Omit<IncentiveClaim, 'id'> = {
          ...claimData,
          claimId: standardizedClaimId || (claimData as any).claimId,
          status: claimData.status === 'Draft' ? 'Draft' : initialStatus,
          authors: claimData.authors || [],
          authorUids: (claimData.authors || []).map(a => a.uid).filter(Boolean) as string[],
          authorEmails: (claimData.authors || []).map(a => a.email.toLowerCase()),
      };

      if (claimData.claimType === 'Research Papers' && claimData.paperTitle && claimData.relevantLink) {
          const paperSnap = await adminDb.collection('papers').where('url', '==', claimData.relevantLink).limit(1).get();
          if (!paperSnap.empty) finalClaimData.paperId = paperSnap.docs[0].id;
      }

      await newClaimRef.set(finalClaimData, { merge: true });

      try {
          const { sanitizeForRtdb } = await import('@/lib/rtdb-utils');
          const sanitizedData = sanitizeForRtdb({ id: claimId, ...finalClaimData, lastSyncedAt: new Date().toISOString() });
          await adminRtdb.ref(`incentiveClaims/${claimId}`).set(sanitizedData);
      } catch (e) {}

      if (!!claimData.originalClaimId === false && finalClaimData.status !== 'Draft' && finalClaimData.authors) {
          const coAuthorUidsToNotify = finalClaimData.authors.map(a => a.uid).filter((uid): uid is string => !!uid && uid !== claimData.uid);
          if (coAuthorUidsToNotify.length > 0) {
              const usersRef = adminDb.collection('users');
              for (let i = 0; i < coAuthorUidsToNotify.length; i += 30) {
                  const chunk = coAuthorUidsToNotify.slice(i, i + 30);
                  const coAuthorUsersSnapshot = await usersRef.where(FieldPath.documentId(), 'in', chunk).get();
                  for (const userDoc of coAuthorUsersSnapshot.docs) {
                      const coAuthorUser = { uid: userDoc.id, ...userDoc.data() } as User;
                      const userModules = coAuthorUser.allowedModules || getDefaultModulesForRole(coAuthorUser.role, coAuthorUser.designation);
                      if (!userModules.includes('incentive-claim')) continue;

                      const coAuthor = finalClaimData.authors.find(a => a.uid === coAuthorUser.uid);
                      if (!coAuthor) continue;

                      await adminDb.collection('notifications').add({
                          uid: coAuthor.uid,
                          title: `${claimData.userName} listed you as a co-author on an incentive claim.`,
                          createdAt: new Date().toISOString(),
                          isRead: false,
                          type: 'default',
                          projectId: '/dashboard/incentive-claim?tab=co-author'
                      });

                      if (coAuthor.email) {
                          const claimTitle = getClaimTitle(finalClaimData);
                          const isConf = finalClaimData.publicationType === 'Scopus Indexed Conference Proceedings';
                          const isEmr = finalClaimData.claimType === 'EMR Sanction Project';
                          const canApply = !isConf && !isEmr && (coAuthor.role === 'Presenting Author' || coAuthor.role === 'First & Presenting Author' || !isConf); 
                          // Wait, the logic for canApply was: !isConf || (role check)
                          // Let's simplify:
                          let message = `You can apply for your share in the portal.`;
                          if (isEmr) {
                              message = `This is for your information regarding the project records.`;
                          } else if (isConf && !(coAuthor.role === 'Presenting Author' || coAuthor.role === 'First & Presenting Author')) {
                              message = `Note: Only presenting authors are eligible for this type.`;
                          }

                          await sendEmailUtility({
                              to: coAuthor.email,
                              subject: `[${standardizedClaimId}] You've been added as a co-author on a claim`,
                              from: 'default',
                              html: `<div ${EMAIL_STYLES.background}>${EMAIL_STYLES.logo}<p>Dear ${coAuthor.name}, ${claimData.userName} submitted a claim for "${claimTitle}". ${message}</p>${EMAIL_STYLES.footer}</div>`
                          });
                      }
                  }
              }
          }
      }

      await logActivity('INFO', 'Incentive claim submitted', { claimId: standardizedClaimId, userId: claimData.uid });
      return { success: true, claimId: claimId };
  } catch (error: any) {
      await logActivity('ERROR', 'Failed to submit incentive claim', { error: error.message });
      return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}

export async function deleteIncentiveClaim(claimId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
      const session = await checkAuth();
      if (!session.authenticated) return { success: false, error: "Unauthorized." };
      const isAdmin = session.role === 'admin' || session.role === 'Super-admin';

      if (!isAdmin && session.uid !== userId) {
          return { success: false, error: "Unauthorized." };
      }

      const claimRef = adminDb.collection('incentiveClaims').doc(claimId);
      const claimSnap = await claimRef.get();
      if (!claimSnap.exists) return { success: false, error: "Claim not found." };
      const claim = claimSnap.data() as IncentiveClaim;
      if (claim.uid !== userId) return { success: false, error: "Unauthorized." };
      if (claim.status !== 'Draft') return { success: false, error: "Only drafts can be deleted." };

      await claimRef.delete();
      try { await adminRtdb.ref(`incentiveClaims/${claimId}`).remove(); } catch (e) {}
      await logActivity('INFO', 'Incentive claim draft deleted', { claimId, userId });
      return { success: true };
  } catch (error: any) {
      return { success: false, error: error.message };
  }
}

async function addPaperFromApprovedClaim(claim: IncentiveClaim): Promise<void> {
  if (claim.claimType !== 'Research Papers' || !claim.paperTitle || !claim.relevantLink) return;
  try {
      const authors: Author[] = (claim.authors || []).map(bca => ({
          uid: bca.uid, email: bca.email, name: bca.name, role: bca.role, isExternal: bca.isExternal, status: 'approved',
      }));
      if (!authors.some(a => a.uid === claim.uid)) {
          authors.push({ uid: claim.uid, email: claim.userEmail, name: claim.userName, role: 'Co-Author', status: 'approved', isExternal: false });
      }
      const mainAuthorUid = authors.find(a => a.role === 'First Author' || a.role === 'First & Corresponding Author')?.uid || claim.uid;
      const now = new Date().toISOString();
      await adminDb.collection('papers').add({
          title: claim.paperTitle, url: claim.relevantLink, mainAuthorUid, authors,
          authorUids: authors.map(a => a.uid).filter(Boolean), authorEmails: authors.map(a => a.email.toLowerCase()),
          journalName: claim.journalName, createdAt: now, updatedAt: now,
      });
  } catch (e) {}
}

async function addEmrProjectFromApprovedClaim(claim: IncentiveClaim): Promise<void> {
  if (claim.claimType !== 'EMR Sanction Project' || !claim.emrProjectName) return;
  try {
      const now = new Date().toISOString();
      const newEmrProject: any = {
          callId: "ADMIN_ADDED_VIA_INCENTIVE", callTitle: claim.emrProjectName, agency: claim.sanctionFrom || 'N/A',
          userId: claim.uid, userName: claim.userName, userEmail: claim.userEmail, faculty: claim.faculty || 'N/A',
          registeredAt: now, status: "Sanctioned", sanctionDate: claim.sanctionDate || now,
          proofUrl: claim.sanctionProofUrl || null,
      };
      if (claim.authors && claim.authors.length > 0) {
          const internalCoPis = claim.authors.map(a => ({ uid: a.uid, name: a.name, email: a.email, isExternal: false }));
          newEmrProject.coPiDetails = internalCoPis;
          newEmrProject.coPiUids = internalCoPis.map(c => c.uid).filter(Boolean);
      }
      await adminDb.collection('emrInterests').add(newEmrProject);
  } catch (e) {}
}

export async function processIncentiveClaimAction(
  claimId: string, action: 'approve' | 'reject' | 'verify', approver: User, stageIndex: number,
  data: { amount?: number; comments?: string, verifiedFields?: { [key: string]: boolean }, suggestions?: { [key: string]: string } }
): Promise<{ success: boolean; error?: string }> {
  try {
    const claimRef = adminDb.collection('incentiveClaims').doc(claimId);
    const claimSnap = await claimRef.get();
    if (!claimSnap.exists) return { success: false, error: 'Not found.' };
    const claim = { id: claimSnap.id, ...claimSnap.data() } as IncentiveClaim;
    const effectiveApprovedAmount = isEligibleForFinancialDisbursement(claim) ? (data.amount || 0) : 0;
    const settings = await getSystemSettings();
    
    const currentStageApprover = settings.incentiveApprovers?.find(a => a.stage === stageIndex + 1);
    if (!currentStageApprover || approver.email?.toLowerCase() !== currentStageApprover.email.toLowerCase()) {
        return { success: false, error: 'Unauthorized.' };
    }

    const approvals = claim.approvals || [];
    while (approvals.length <= stageIndex) approvals.push(null as any); 
    approvals[stageIndex] = {
      approverUid: approver.uid, approverName: approver.name, status: action === 'reject' ? 'Rejected' : 'Approved',
      approvedAmount: effectiveApprovedAmount, comments: data.comments || '', timestamp: new Date().toISOString(),
      stage: stageIndex + 1, verifiedFields: data.verifiedFields || {}, suggestions: data.suggestions || {},
    };

    let newStatus = (action === 'reject') ? 'Rejected' : 'Accepted';
    const workflow = settings.incentiveApprovalWorkflows?.[claim.claimType] || [1, 2, 3, 4];
    if (action !== 'reject') {
        const nextStage = workflow.find(stage => stage > (stageIndex + 1));
        if (nextStage) newStatus = `Pending Stage ${nextStage} Approval` as any;
    }

    const updateData: any = { approvals, status: newStatus };
    if (stageIndex >= 1 && (action === 'approve' || action === 'verify')) updateData.finalApprovedAmount = effectiveApprovedAmount;

    await claimRef.update(updateData);
    try {
        const { sanitizeForRtdb } = await import('@/lib/rtdb-utils');
        await adminRtdb.ref(`incentiveClaims/${claimId}`).update(sanitizeForRtdb({ ...updateData, lastSyncedAt: new Date().toISOString() }));
    } catch (e) {}

    const systemAmount = claim.calculatedIncentive || 0;
    if (systemAmount > 0 && Math.abs(effectiveApprovedAmount - systemAmount) / systemAmount > 0.2) {
        await GovernanceLogger.logPolicyTrace({ policyName: 'INCENTIVE_OVERRIDE', entityId: claimId, inputs: { systemAmount, humanAmount: effectiveApprovedAmount }, outputs: { action: 'FLAGGED' }, logicVersion: '1.0.0' });
    }

    if (newStatus === 'Accepted' && claim.userEmail) {
        await sendEmailUtility({ to: claim.userEmail, subject: `Claim Approved: ${getClaimTitle(claim)}`, from: 'default', html: `<div ${EMAIL_STYLES.background}>${EMAIL_STYLES.logo}<p>Approved! Amount: ₹${effectiveApprovedAmount}</p>${EMAIL_STYLES.footer}</div>` });
        if (claim.claimType === 'Research Papers') await addPaperFromApprovedClaim(claim);
        else if (claim.claimType === 'EMR Sanction Project') await addEmrProjectFromApprovedClaim(claim);
    }

    await logActivity('INFO', `Incentive claim action processed`, { claimId, action, stage: stageIndex + 1 });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function markPaymentsCompleted(claimIds: string[]): Promise<{ success: boolean; error?: string; processedCount?: number }> {
    try {
      const claimsRef = adminDb.collection('incentiveClaims');
      const batch = adminDb.batch();
      const claimsQuery = await claimsRef.where(FieldPath.documentId(), 'in', claimIds).get();
      let count = 0;
  
      for (const doc of claimsQuery.docs) {
        const claim = doc.data() as IncentiveClaim;
        if (!isEligibleForFinancialDisbursement(claim) || claim.status !== 'Submitted to Accounts') continue;
  
        batch.update(doc.ref, { status: 'Payment Completed' });
        try {
            const { sanitizeForRtdb } = await import('@/lib/rtdb-utils');
            await adminRtdb.ref(`incentiveClaims/${doc.id}`).update(sanitizeForRtdb({ status: 'Payment Completed', lastSyncedAt: new Date().toISOString() }));
        } catch (e) {}

        const { ref: ledgerRef, data: ledgerData } = GovernanceLogger.prepareFinancialLedger({
          source: 'INCENTIVE', entityId: doc.id, userId: claim.uid, amount: claim.finalApprovedAmount || 0, type: 'CREDIT', status: 'PROCESSED',
        });
        batch.set(ledgerRef, ledgerData);
        await adminDb.collection('notifications').add({ uid: claim.uid, title: `Payment processed for "${getClaimTitle(claim)}".`, createdAt: new Date().toISOString(), isRead: false });

        if (claim.userEmail) {
            await sendEmailUtility({ to: claim.userEmail, subject: `Payment Processed`, from: 'default', html: `<div ${EMAIL_STYLES.background}>${EMAIL_STYLES.logo}<p>Disbursed: ₹${claim.finalApprovedAmount}</p>${EMAIL_STYLES.footer}</div>` });
        }
        count++;
      }
      await batch.commit();
      return { success: true, processedCount: count };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
}

export async function submitToAccounts(claimIds: string[]): Promise<{ success: boolean; error?: string; processedCount?: number }> {
    try {
      const claimsRef = adminDb.collection('incentiveClaims');
      const batch = adminDb.batch();
      const claimsQuery = await claimsRef.where(FieldPath.documentId(), 'in', claimIds).get();
      let count = 0;
      for (const doc of claimsQuery.docs) {
          const claim = doc.data() as IncentiveClaim;
          if (claim.status === 'Accepted' && claim.paymentSheetRef) {
              batch.update(doc.ref, { status: 'Submitted to Accounts' });
              count++;
          }
      }
      await batch.commit();
      return { success: true, processedCount: count };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
}

export async function generateIncentivePaymentSheet(claimIds: string[], remarks: Record<string, string>, referenceNumber: string) {
    try {
      const claimsRef = adminDb.collection('incentiveClaims');
      const claimsSnap = await claimsRef.where(FieldPath.documentId(), 'in', claimIds).get();
      const payableClaims = claimsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() } as IncentiveClaim)).filter(isEligibleForFinancialDisbursement);
      if (payableClaims.length === 0) return { success: false, error: "No valid claims." };

      const settings = await getSystemSettings();
      const templateUrl = settings.templateUrls?.INCENTIVE_PAYMENT_SHEET;
      if (!templateUrl) return { success: false, error: 'Not configured.' };

      const { getTemplateContentFromUrl } = await import('@/lib/template-manager');
      const templateContent = await getTemplateContentFromUrl(templateUrl);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(templateContent as any);
      const worksheet = workbook.worksheets[0];

      const batch = adminDb.batch();
      for (const claim of payableClaims) {
          batch.update(adminDb.collection('incentiveClaims').doc(claim.id), { paymentSheetRef: referenceNumber, paymentSheetRemarks: remarks[claim.id] || '' });
      }
      await batch.commit();
      const buffer = await workbook.xlsx.writeBuffer();
      return { success: true, fileData: Buffer.from(buffer).toString('base64'), includedCount: payableClaims.length };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
}

export async function downloadPaymentSheetByRef(referenceNumber: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const path = `payment-sheets/${referenceNumber.replace(/\//g, '_')}.xlsx`
    const { getSecureDocumentUrl } = await import("./storage-service")
    
    // We'll need a way to get the current user ID for the proxy to work, 
    // but here we can just return the proxy path if we assume the caller will route through the proxy API
    // However, the proxy API now requires a session.
    
    // For now, let's return the proxy URL directly
    return { success: true, url: `/api/documents/${path}` };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to locate payment sheet." }
  }
}
