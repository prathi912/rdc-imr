

'use server';

import { adminDb, adminStorage } from "@/lib/admin";
import type { Project, GrantPhase, GrantDetails, User } from "@/types";
import { sendEmail as sendEmailUtility } from "@/lib/email";

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
}


export async function awardInitialGrant(
    projectId: string,
    grantData: { 
      sanctionNumber: string; 
      totalAmount: number; 
      installmentRefNumber: string; 
      amount: number; 
    },
    pi: { uid: string; name: string; email?: string },
    projectTitle: string
): Promise<{ success: boolean; error?: string, updatedProject?: Project }> {
    try {
        const projectRef = adminDb.collection('projects').doc(projectId);

        const newPhase: GrantPhase = {
            id: new Date().toISOString(),
            name: 'Phase 1',
            amount: grantData.amount,
            installmentRefNumber: grantData.installmentRefNumber,
            status: "Pending Disbursement",
            transactions: [],
        };

        const newGrant: GrantDetails = {
            totalAmount: grantData.totalAmount,
            sanctionNumber: grantData.sanctionNumber,
            status: "Awarded",
            phases: [newPhase],
        };

        await projectRef.update({ grant: newGrant, status: 'In Progress' });

        const notification = {
            uid: pi.uid,
            title: `Congratulations! Your project "${projectTitle}" has been awarded a grant.`,
            projectId: projectId,
            createdAt: new Date().toISOString(),
            isRead: false,
        };
        await adminDb.collection('notifications').add(notification);

        if (pi.email) {
            const emailHtml = `
                <div ${EMAIL_STYLES.background}>
                    ${EMAIL_STYLES.logo}
                    <h2 style="color: #ffffff;">Congratulations, ${pi.name}!</h2>
                    <p style="color:#e0e0e0;">We are pleased to inform you that your Intramural Research (IMR) project, <strong>"${projectTitle}"</strong>, has been sanctioned and a grant has been awarded.</p>
                    <h3 style="color:#ffffff;">Grant Details:</h3>
                    <ul style="color:#e0e0e0; list-style-type: none; padding-left: 0;">
                        <li><strong>Project Sanction Number:</strong> ${newGrant.sanctionNumber}</li>
                        <li><strong>Total Sanctioned Amount:</strong> ₹${newGrant.totalAmount.toLocaleString('en-IN')}</li>
                        <li><strong>Phase 1 Installment Ref. No:</strong> ${newPhase.installmentRefNumber}</li>
                        <li><strong>Phase 1 Amount:</strong> ₹${newPhase.amount.toLocaleString('en-IN')}</li>
                    </ul>
                    <p style="color:#e0e0e0;">The first phase amount will be disbursed to your registered bank account shortly. You can now log your project expenses through the grant management section on the portal.</p>
                    ${EMAIL_STYLES.footer}
                </div>
            `;
            await sendEmailUtility({
                to: pi.email,
                subject: `Grant Awarded for Your IMR Project: ${projectTitle}`,
                html: emailHtml,
                from: 'default'
            });
        }
        
        await logActivity('INFO', 'Initial grant awarded', { projectId, sanctionNumber: grantData.sanctionNumber, totalAmount: grantData.totalAmount, phase1Amount: grantData.amount });
        
        const updatedProjectSnap = await projectRef.get();
        const updatedProject = { id: updatedProjectSnap.id, ...updatedProjectSnap.data() } as Project;

        return { success: true, updatedProject };
    } catch (error: any) {
        console.error("Error awarding grant:", error);
        await logActivity('ERROR', 'Failed to award initial grant', { projectId, error: error.message });
        return { success: false, error: error.message || "Failed to award grant." };
    }
}


export async function addGrantPhase(
  projectId: string,
  phaseData: { installmentRefNumber: string; amount: number; },
): Promise<{ success: boolean; error?: string; updatedProject?: Project }> {
  try {
    const projectRef = adminDb.collection("projects").doc(projectId)
    const projectSnap = await projectRef.get()

    if (!projectSnap.exists) {
      return { success: false, error: "Project not found." }
    }

    const project = projectSnap.data() as Project
    if (!project.grant) {
      return { success: false, error: "Project does not have grant details." }
    }
    
    const nextPhaseNumber = (project.grant.phases?.length || 0) + 1;
    if (nextPhaseNumber > 5) {
        return { success: false, error: "Maximum of 5 phases can be added." };
    }
    const phaseName = `Phase ${nextPhaseNumber}`;

    const newPhase: GrantPhase = {
      id: new Date().toISOString(),
      name: phaseName,
      amount: phaseData.amount,
      installmentRefNumber: phaseData.installmentRefNumber,
      status: "Pending Disbursement",
      transactions: [],
    }

    const updatedPhases = [...(project.grant.phases || []), newPhase]
    const updatedGrant: GrantDetails = {
      ...project.grant,
      phases: updatedPhases,
    }

    await projectRef.update({ grant: updatedGrant })
    await logActivity("INFO", "Grant phase added", { projectId, phaseName, amount: phaseData.amount })

    const notification = {
      uid: project.pi_uid,
      projectId: projectId,
      title: `A new grant phase "${phaseName}" has been added to your project "${project.title}".`,
      createdAt: new Date().toISOString(),
      isRead: false,
    }
    await adminDb.collection("notifications").add(notification)

    if (project.pi_email) {
        const emailHtml = `
            <div ${EMAIL_STYLES.background}>
                ${EMAIL_STYLES.logo}
                <p style="color:#ffffff;">Dear ${project.pi},</p>
                <p style="color:#e0e0e0;">A new grant phase has been sanctioned for your project, <strong>"${project.title}"</strong>.</p>
                <h3 style="color:#ffffff;">Phase Details:</h3>
                <ul style="color:#e0e0e0; list-style-type: none; padding-left: 0;">
                    <li><strong>Phase Name:</strong> ${newPhase.name}</li>
                    <li><strong>Installment Ref. No:</strong> ${newPhase.installmentRefNumber}</li>
                    <li><strong>Amount:</strong> ₹${newPhase.amount.toLocaleString('en-IN')}</li>
                </ul>
                <p style="color:#e0e0e0;">This amount will be disbursed to your account shortly.</p>
                ${EMAIL_STYLES.footer}
            </div>
        `;
        await sendEmailUtility({
            to: project.pi_email,
            subject: `New Grant Phase Sanctioned for: ${project.title}`,
            html: emailHtml,
            from: 'default'
        });
    }

    const updatedProject = { ...project, grant: updatedGrant }
    return { success: true, updatedProject }
  } catch (error: any) {
    console.error("Error adding grant phase:", error)
    await logActivity("ERROR", "Failed to add grant phase", { projectId, error: error.message, stack: error.stack })
    return { success: false, error: error.message || "Failed to add grant phase." }
  }
}

export async function addTransaction(
  projectId: string,
  phaseId: string,
  transactionData: {
    dateOfTransaction: string;
    amount: number;
    vendorName: string;
    isGstRegistered: boolean;
    gstNumber?: string;
    description?: string;
    invoiceDataUrl: string;
    invoiceFileName: string;
  }
): Promise<{ success: boolean; error?: string; updatedProject?: Project }> {
  try {
    console.log("Server action 'addTransaction' received data for project:", projectId, "and phase:", phaseId);
    const projectRef = adminDb.collection("projects").doc(projectId);
    const projectSnap = await projectRef.get();

    if (!projectSnap.exists) {
      console.error("Project not found.");
      return { success: false, error: "Project not found." };
    }

    const project = projectSnap.data() as Project;
    if (!project.grant) {
      console.error("Project does not have grant details.");
      return { success: false, error: "Project does not have grant details." };
    }

    const phaseIndex = project.grant.phases.findIndex((p) => p.id === phaseId);
    if (phaseIndex === -1) {
      console.error("Phase not found.");
      return { success: false, error: "Phase not found." };
    }

    let invoiceUrl: string | undefined;
    if (transactionData.invoiceDataUrl) {
      console.log("Invoice data URL found, preparing to upload.");
      const path = `invoices/${projectId}/${phaseId}/${new Date().toISOString()}-${transactionData.invoiceFileName}`;
      const result = await adminStorage.uploadFileToServer(transactionData.invoiceDataUrl, path);

      if (!result.success || !result.url) {
        console.error("Invoice upload failed:", result.error);
        return { success: false, error: result.error || "Invoice upload failed" };
      }
      invoiceUrl = result.url;
      console.log("Invoice uploaded successfully. URL:", invoiceUrl);
    }

    const newTransaction: Transaction = {
      id: new Date().toISOString() + Math.random(),
      phaseId: phaseId,
      dateOfTransaction: transactionData.dateOfTransaction,
      amount: transactionData.amount,
      vendorName: transactionData.vendorName,
      isGstRegistered: transactionData.isGstRegistered,
      gstNumber: transactionData.gstNumber,
      description: transactionData.description || "",
      invoiceUrl: invoiceUrl,
    };
    console.log("New transaction object created:", newTransaction);

    const updatedPhases = project.grant.phases.map((phase, index) => {
      if (index === phaseIndex) {
        return {
          ...phase,
          transactions: [...(phase.transactions || []), newTransaction],
        };
      }
      return phase;
    });

    const updatedGrant = { ...project.grant, phases: updatedPhases };
    await projectRef.update({ grant: updatedGrant });
    console.log("Project document updated successfully in Firestore.");
    
    await logActivity("INFO", "Grant transaction added", { projectId, phaseId, amount: newTransaction.amount });

    const updatedProject = { ...project, grant: updatedGrant };
    return { success: true, updatedProject };
  } catch (error: any) {
    console.error("Error in addTransaction server action:", error);
    await logActivity("ERROR", "Failed to add grant transaction", {
      projectId,
      phaseId,
      error: error.message,
      stack: error.stack,
    });
    return { success: false, error: error.message || "Failed to add transaction." };
  }
}

export async function updatePhaseStatus(
  projectId: string,
  phaseId: string,
  newStatus: GrantPhase["status"],
): Promise<{ success: boolean; error?: string; updatedProject?: Project }> {
  try {
    const projectRef = adminDb.collection("projects").doc(projectId)
    const projectSnap = await projectRef.get()

    if (!projectSnap.exists) {
      return { success: false, error: "Project not found." }
    }

    const project = projectSnap.data() as Project
    if (!project.grant) {
      return { success: false, error: "Project does not have grant details." }
    }

    const phaseIndex = project.grant.phases.findIndex((p) => p.id === phaseId)
    if (phaseIndex === -1) {
      return { success: false, error: "Phase not found." }
    }

    const updatedPhases = project.grant.phases.map((phase) => {
      if (phase.id === phaseId) {
        const updatedPhase: GrantPhase = { ...phase, status: newStatus }
        if (newStatus === "Disbursed" && !phase.disbursementDate) {
          updatedPhase.disbursementDate = new Date().toISOString()
        }
        if (newStatus === "Utilization Submitted") {
          updatedPhase.utilizationSubmissionDate = new Date().toISOString()
        }
        return updatedPhase
      }
      return phase
    })

    const updatedGrant = { ...project.grant, phases: updatedPhases }
    await projectRef.update({ grant: updatedGrant })
    await logActivity("INFO", "Grant phase status updated", { projectId, phaseId, newStatus })

    // Add notification for grant phase status update for the PI
    const piNotification = {
      uid: project.pi_uid,
      projectId: projectId,
      title: `Grant phase "${updatedPhases[phaseIndex].name}" for project "${project.title}" was updated to: ${newStatus}`,
      createdAt: new Date().toISOString(),
      isRead: false,
    }
    await adminDb.collection("notifications").add(piNotification)

    // Add notification for admins if utilization is submitted
    if (newStatus === "Utilization Submitted") {
      const adminRoles = ["Super-admin", "admin"]
      const usersRef = adminDb.collection("users")
      const q = usersRef.where("role", "in", adminRoles)
      const adminUsersSnapshot = await q.get()

      if (!adminUsersSnapshot.empty) {
        const batch = adminDb.batch()
        const notificationTitle = `${project.pi} requested the next grant phase for "${project.title}".`
        adminUsersSnapshot.forEach((userDoc) => {
          const notificationRef = adminDb.collection("notifications").doc()
          batch.set(notificationRef, {
            uid: userDoc.id,
            projectId,
            title: notificationTitle,
            createdAt: new Date().toISOString(),
            isRead: false,
          })
        })
        await batch.commit()
        await logActivity("INFO", "Admins notified for next phase disbursement", { projectId })
      }
    }

    const updatedProject = { ...project, grant: updatedGrant }
    return { success: true, updatedProject }
  } catch (error: any) {
    console.error("Error updating phase status:", error)
    await logActivity("ERROR", "Failed to update grant phase status", {
      projectId,
      phaseId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to update phase status." }
  }
}
