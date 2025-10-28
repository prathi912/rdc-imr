

"use server"

import { getResearchDomainSuggestion, type ResearchDomainInput } from "@/ai/flows/research-domain-suggestion"
import { summarizeProject, type SummarizeProjectInput } from "@/ai/flows/project-summarization"
import { generateEvaluationPrompts, type EvaluationPromptsInput } from "@/ai/flows/evaluation-prompts"
import { findJournalWebsite, type JournalWebsiteInput } from "@/ai/flows/journal-website-finder"
import { chat as chatAgent, type ChatInput } from "@/ai/flows/chat-agent"
import { adminDb, adminStorage } from "@/lib/admin"
import { FieldValue } from "firebase-admin/firestore"
import admin from "firebase-admin"
import type {
  Project,
  IncentiveClaim,
  User,
  GrantDetails,
  GrantPhase,
  Transaction,
  EmrInterest,
  FundingCall,
  EmrEvaluation,
  ResearchPaper,
  SystemSettings,
  LoginOtp,
  CoPiDetails,
  Author,
} from "@/types"
import { sendEmail as sendEmailUtility } from "@/lib/email"
import fs from "fs"
import path from "path"
import { addDays, setHours, setMinutes, setSeconds, isToday, format } from "date-fns"
import { formatInTimeZone } from "date-fns-tz"
import type * as z from "zod"
import PizZip from "pizzip"
import Docxtemplater from "docxtemplater"

// --- Centralized Logging Service ---
type LogLevel = "INFO" | "WARNING" | "ERROR"

async function logActivity(level: LogLevel, message: string, context: Record<string, any> = {}) {
  try {
    if (!message) {
      console.error("Log message is empty or undefined.")
      return
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    }
    await adminDb.collection("logs").add(logEntry)
  } catch (error) {
    console.error("FATAL: Failed to write to logs collection.", error)
    console.error("Original Log Entry:", { level, message, context })
  }
}

export async function deleteImrProject(
  projectId: string,
  reason: string,
  deletedBy: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const projectRef = adminDb.collection("projects").doc(projectId)
    const projectSnap = await projectRef.get()

    if (!projectSnap.exists) {
      return { success: false, error: "Project not found." }
    }
    const project = projectSnap.data() as Project

    // --- Clean up subcollections ---
    const evaluationsRef = projectRef.collection("evaluations")
    const evaluationsSnap = await evaluationsRef.get()
    const batch = adminDb.batch()
    evaluationsSnap.docs.forEach((doc) => batch.delete(doc.ref))
    await batch.commit()

    // --- Clean up associated files in Storage ---
    const bucket = adminStorage.bucket()
    const prefix = `projects/${projectId}/`
    await bucket.deleteFiles({ prefix })

    // --- Delete the main project document ---
    await projectRef.delete()

    // --- Notify the PI ---
    if (project.pi_email) {
      const emailHtml = `
        <div ${EMAIL_STYLES.background}>
            ${EMAIL_STYLES.logo}
            <p style="color:#ffffff;">Dear ${project.pi},</p>
            <p style="color:#e0e0e0;">
                This is to inform you that your IMR project submission, "<strong style="color:#ffffff;">${project.title}</strong>," has been deleted from the portal by an administrator.
            </p>
            <div style="margin-top:20px; padding:15px; border:1px solid #4f5b62; border-radius:6px; background-color:#2c3e50;">
                <h4 style="color:#ffffff; margin-top:0;">Reason for Deletion:</h4>
                <p style="color:#e0e0e0; white-space: pre-wrap;">${reason}</p>
            </div>
            <p style="color:#e0e0e0; margin-top:20px;">
                If you believe this is an error or have any questions, please contact the RDC office.
            </p>
            ${EMAIL_STYLES.footer}
        </div>`

      await sendEmailUtility({
        to: project.pi_email,
        subject: `Regarding Your IMR Project Submission: ${project.title}`,
        html: emailHtml,
        from: "default",
      })
    }
    
    await logActivity("INFO", "IMR project deleted", { projectId, title: project.title, deletedBy, reason });
    return { success: true }
  } catch (error: any) {
    console.error("Error deleting IMR project:", error)
    await logActivity("ERROR", "Failed to delete IMR project", {
      projectId,
      deletedBy,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Could not delete project." }
  }
}

export async function checkPatentUniqueness(title: string, applicationNumber: string, currentClaimId?: string): Promise<{ isUnique: boolean; message?: string }> {
    try {
        const claimsRef = adminDb.collection('incentiveClaims');
        
        const titleQuery = claimsRef.where('patentTitle', '==', title);
        const appNumberQuery = claimsRef.where('patentApplicationNumber', '==', applicationNumber);

        const [titleSnapshot, appNumberSnapshot] = await Promise.all([
            titleQuery.get(),
            appNumberQuery.get()
        ]);
        
        const conflictingTitle = titleSnapshot.docs.find(doc => doc.id !== currentClaimId);
        if (conflictingTitle) {
            return { isUnique: false, message: `A claim with the title "${title}" already exists.` };
        }

        const conflictingAppNumber = appNumberSnapshot.docs.find(doc => doc.id !== currentClaimId);
        if (conflictingAppNumber) {
            return { isUnique: false, message: `A claim with the application number "${applicationNumber}" already exists.` };
        }

        return { isUnique: true };
    } catch (error: any) {
        console.error("Error checking patent uniqueness:", error);
        await logActivity('ERROR', 'Failed to check patent uniqueness', { title, applicationNumber, error: error.message });
        // Fail open to avoid blocking users due to server errors, but log it.
        return { isUnique: true }; 
    }
}

export async function bulkGrantModuleAccess(
  userIds: string[],
  moduleId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!userIds || userIds.length === 0 || !moduleId) {
      return { success: false, error: "User IDs and a module ID are required." }
    }
    const batch = adminDb.batch()
    const usersRef = adminDb.collection("users")

    userIds.forEach((uid) => {
      const userRef = usersRef.doc(uid)
      batch.update(userRef, {
        allowedModules: FieldValue.arrayUnion(moduleId),
      })
    })

    await batch.commit()
    await logActivity("INFO", "Bulk module access granted", { userIds, moduleId })
    return { success: true }
  } catch (error: any) {
    console.error("Error in bulkGrantModuleAccess:", error)
    await logActivity("ERROR", "Failed to grant bulk module access", {
      userIds,
      moduleId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to update user permissions." }
  }
}

export async function bulkRevokeModuleAccess(
  userIds: string[],
  moduleId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!userIds || userIds.length === 0 || !moduleId) {
      return { success: false, error: "User IDs and a module ID are required." }
    }
    const batch = adminDb.batch()
    const usersRef = adminDb.collection("users")

    userIds.forEach((uid) => {
      const userRef = usersRef.doc(uid)
      batch.update(userRef, {
        allowedModules: FieldValue.arrayRemove(moduleId),
      })
    })

    await batch.commit()
    await logActivity("INFO", "Bulk module access revoked", { userIds, moduleId })
    return { success: true }
  } catch (error: any) {
    console.error("Error in bulkRevokeModuleAccess:", error)
    await logActivity("ERROR", "Failed to revoke bulk module access", {
      userIds,
      moduleId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to update user permissions." }
  }
}

export async function getEmrInterests(callId: string): Promise<EmrInterest[]> {
  try {
    const interestsRef = adminDb.collection("emrInterests")
    const q = interestsRef.where("callId", "==", callId)
    const snapshot = await q.get()
    const interests: EmrInterest[] = []
    snapshot.forEach((doc) => {
      interests.push({ id: doc.id, ...(doc.data() as EmrInterest) })
    })
    return interests
  } catch (error) {
    console.error("Error fetching EMR interests:", error)
    return []
  }
}

export async function getAllUsers(): Promise<User[]> {
  try {
    const usersRef = adminDb.collection("users")
    const snapshot = await usersRef.get()
    const users: User[] = []
    snapshot.forEach((doc) => {
      users.push({ uid: doc.id, ...(doc.data() as User) })
    })
    return users
  } catch (error) {
    console.error("Error fetching users:", error)
    return []
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

export async function sendEmail(options: { to: string; subject: string; html: string; from: "default" | "rdc" }) {
  return await sendEmailUtility(options)
}

// --- 2FA & System Settings ---
export async function getSystemSettings(): Promise<SystemSettings> {
  try {
    const settingsRef = adminDb.collection("system").doc("settings")
    const settingsSnap = await settingsRef.get()
    if (settingsSnap.exists) {
      return settingsSnap.data() as SystemSettings
    }
    // Default settings if none are found
    return { is2faEnabled: false, allowedDomains: [], croAssignments: [] }
  } catch (error) {
    console.error("Error fetching system settings:", error)
    // Return default settings on error to ensure app functionality
    return { is2faEnabled: false, allowedDomains: [], croAssignments: [] }
  }
}

export async function updateSystemSettings(settings: SystemSettings): Promise<{ success: boolean; error?: string }> {
  try {
    const settingsRef = adminDb.collection("system").doc("settings")
    await settingsRef.set(settings, { merge: true })
    await logActivity("INFO", "System settings updated", { newSettings: settings })
    return { success: true }
  } catch (error: any) {
    console.error("Error updating system settings:", error)
    await logActivity("ERROR", "Failed to update system settings", { error: error.message, stack: error.stack })
    return { success: false, error: error.message || "Failed to update settings." }
  }
}

export async function sendLoginOtp(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = Date.now() + 10 * 60 * 1000 // 10 minutes from now

    const otpData: LoginOtp = { email, otp, expiresAt }
    await adminDb.collection("loginOtps").doc(email).set(otpData)

    const emailHtml = `
      <div ${EMAIL_STYLES.background}>
        ${EMAIL_STYLES.logo}
        <p style="color:#ffffff; text-align:center; font-size:18px;">Your Verification Code</p>
        <p style="color:#e0e0e0; text-align:center;">Please use the following code to complete your login. This code will expire in 10 minutes.</p>
        <div style="text-align:center; margin: 20px 0;">
            <p style="background-color:#2c3e50; color:#ffffff; display:inline-block; padding: 10px 20px; font-size:24px; letter-spacing: 5px; border-radius: 5px;">
                ${otp}
            </p>
        </div>
        ${EMAIL_STYLES.footer}
      </div>
    `

    await sendEmailUtility({
      to: email,
      subject: "Your Login Verification Code for PU Research Projects Portal",
      html: emailHtml,
      from: "default",
    })

    return { success: true }
  } catch (error: any) {
    console.error("Error sending OTP:", error)
    return { success: false, error: "Failed to send OTP email." }
  }
}

export async function verifyLoginOtp(email: string, otp: string): Promise<{ success: boolean; error?: string }> {
  try {
    const otpRef = adminDb.collection("loginOtps").doc(email)
    const otpSnap = await otpRef.get()

    if (!otpSnap.exists) {
      return { success: false, error: "Invalid or expired OTP. Please try again." }
    }

    const otpData = otpSnap.data() as LoginOtp

    if (otpData.otp !== otp) {
      return { success: false, error: "The OTP you entered is incorrect." }
    }

    if (Date.now() > otpData.expiresAt) {
      await otpRef.delete() // Clean up expired OTP
      return { success: false, error: "Your OTP has expired. Please log in again to receive a new one." }
    }

    await otpRef.delete() // OTP is valid and used, so delete it
    return { success: true }
  } catch (error: any) {
    console.error("Error verifying OTP:", error)
    return { success: false, error: "An unexpected error occurred during verification." }
  }
}

export async function saveProjectSubmission(
  projectId: string,
  projectData: Omit<Project, "id">,
): Promise<{ success: boolean; error?: string }> {
  try {
    const projectRef = adminDb.collection("projects").doc(projectId)
    await projectRef.set(projectData, { merge: true })

    // Notify admins only on final submission, not on saving drafts
    if (projectData.status === "Submitted") {
      await notifyAdminsOnProjectSubmission(projectId, projectData.title, projectData.pi)
    }

    await logActivity("INFO", `Project ${projectData.status}`, { projectId, title: projectData.title })
    return { success: true }
  } catch (error: any) {
    console.error("Error saving project submission:", error)
    await logActivity("ERROR", "Failed to save project submission", {
      projectId,
      title: projectData.title,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to save project." }
  }
}

export async function runChatAgent(input: ChatInput): Promise<{ success: boolean; response?: string; error?: string }> {
  try {
    const result = await chatAgent(input)
    return { success: true, response: result }
  } catch (error: any) {
    console.error("Error running chat agent:", error)
    await logActivity("ERROR", "Error in runChatAgent", {
      userId: input.user.uid,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to get response from AI agent." }
  }
}

export async function linkPapersToNewUser(
  uid: string,
  email: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (!uid || !email) {
      return { success: false, count: 0, error: "User ID and email are required." }
    }

    const lowercasedEmail = email.toLowerCase()
    const papersRef = adminDb.collection("papers")

    // This is the correct way to query for a value within an array.
    const papersQuery = papersRef.where("authorEmails", "array-contains", lowercasedEmail)

    const snapshot = await papersQuery.get()
    if (snapshot.empty) {
      console.log(`No papers found to link for new user: ${email}`)
      return { success: true, count: 0 }
    }

    console.log(`Found ${snapshot.docs.length} papers to link for new user: ${email}`)

    const batch = adminDb.batch()
    let updatedCount = 0

    snapshot.forEach((doc) => {
      const paper = doc.data() as ResearchPaper
      let needsUpdate = false

      const updatedAuthors = paper.authors.map((author) => {
        // Find the author entry that matches the new user's email and doesn't have a UID yet.
        if (author.email.toLowerCase() === lowercasedEmail && !author.uid) {
          needsUpdate = true
          return { ...author, uid: uid, isExternal: false } // Update UID and mark as internal
        }
        return author
      })

      if (needsUpdate) {
        const paperRef = doc.ref
        // Add the new UID to the authorUids array for future queries.
        const updatedAuthorUids = [...new Set([...(paper.authorUids || []), uid])]
        batch.update(paperRef, { authors: updatedAuthors, authorUids: updatedAuthorUids })
        updatedCount++
      }
    })

    if (updatedCount > 0) {
      await batch.commit()
      console.log(`Successfully committed updates for ${updatedCount} papers for user ${email}.`)
    }

    return { success: true, count: updatedCount }
  } catch (error: any) {
    console.error("Error linking papers to new user:", error)
    await logActivity("ERROR", "Failed to link papers to new user", {
      uid,
      email,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, count: 0, error: error.message || "Failed to link papers." }
  }
}

export async function getProjectSummary(input: SummarizeProjectInput) {
  try {
    const result = await summarizeProject(input)
    return { success: true, summary: result.summary }
  } catch (error) {
    console.error("Error summarizing project:", error)
    await logActivity("ERROR", "Failed to summarize project", { title: input.title, error: (error as Error).message })
    return { success: false, error: "Failed to generate summary." }
  }
}

export async function getEvaluationPrompts(input: EvaluationPromptsInput) {
  try {
    const result = await generateEvaluationPrompts(input)
    return { success: true, prompts: result }
  } catch (error) {
    console.error("Error generating evaluation prompts:", error)
    await logActivity("ERROR", "Failed to generate evaluation prompts", {
      title: input.title,
      error: (error as Error).message,
    })
    return { success: false, error: "Failed to generate prompts." }
  }
}

export async function getResearchDomain(input: ResearchDomainInput) {
  try {
    const result = await getResearchDomainSuggestion(input)
    return { success: true, domain: result.domain }
  } catch (error) {
    console.error("Error getting research domain:", error)
    await logActivity("ERROR", "Failed to get research domain suggestion", { error: (error as Error).message })
    return { success: false, error: "Failed to get research domain." }
  }
}

export async function getJournalWebsite(input: JournalWebsiteInput) {
  try {
    const result = await findJournalWebsite(input)
    return { success: true, url: result.websiteUrl }
  } catch (error) {
    console.error("Error finding journal website:", error)
    await logActivity("ERROR", "Failed to find journal website", {
      journalName: input.journalName,
      error: (error as Error).message,
    })
    return { success: false, error: "Failed to find journal website." }
  }
}

export async function updateProjectStatus(projectId: string, newStatus: Project["status"], comments?: string) {
  try {
    const projectRef = adminDb.collection("projects").doc(projectId)
    const projectSnap = await projectRef.get()

    if (!projectSnap.exists) {
      return { success: false, error: "Project not found." }
    }
    const project = projectSnap.data() as Project

    const updateData: { [key: string]: any } = { status: newStatus }
    if (comments) {
      if (newStatus === "Revision Needed") {
        updateData.revisionComments = comments
      } else if (newStatus === "Not Recommended") {
        updateData.rejectionComments = comments
      }
    }

    await projectRef.update(updateData)
    await logActivity("INFO", "Project status updated", { projectId, newStatus, piUid: project.pi_uid })

    const notification = {
      uid: project.pi_uid,
      projectId: projectId,
      title: `Your project "${project.title}" status was updated to: ${newStatus}`,
      createdAt: new Date().toISOString(),
      isRead: false,
    }
    await adminDb.collection("notifications").add(notification)

    let emailHtml = `
      <div ${EMAIL_STYLES.background}>
        ${EMAIL_STYLES.logo}
        <p style="color:#ffffff;">Dear ${project.pi},</p>
        <p style="color:#e0e0e0;">
          The status of your project, "<strong style="color:#ffffff;">${project.title}</strong>" has been updated to 
          <strong style="color:#ffca28;">${newStatus}</strong>.
        </p>
    `

    if (comments) {
      const reasonTitle = newStatus === 'Revision Needed' ? "Evaluator's Comments for Revision:" : "Reason for Decision:";
      emailHtml += `
          <div style="margin-top:20px; padding:15px; border:1px solid #4f5b62; border-radius:6px; background-color:#2c3e50;">
            <h4 style="color:#ffffff; margin-top:0;">${reasonTitle}</h4>
            <p style="color:#e0e0e0; white-space: pre-wrap;">${comments}</p>
          </div>
        `
      if (newStatus === 'Revision Needed') {
         emailHtml += `<p style="color:#e0e0e0; margin-top:20px;">Please submit the revised proposal from your project details page on the portal.</p>`
      }
    }

    emailHtml += `
      <p style="color:#e0e0e0;">
        You can view your project details on the 
        <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/project/${projectId}" style="color:#64b5f6; text-decoration:underline;">
          PU Research Projects Portal
        </a>.
      </p>
      ${EMAIL_STYLES.footer}
    </div>`

    if (project.pi_email) {
      await sendEmailUtility({
        to: project.pi_email,
        subject: `Project Status Update: ${project.title}`,
        html: emailHtml,
        from: "default",
      })
    }

    return { success: true }
  } catch (error: any) {
    console.error("Error updating project status:", error)
    await logActivity("ERROR", "Failed to update project status", {
      projectId,
      newStatus,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to update status." }
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
    await logActivity("INFO", "Incentive claim status updated", { claimId, newStatus, userId: claim.uid })

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
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to update status." }
  }
}

export async function scheduleMeeting(
  projectsToSchedule: { id: string; pi_uid: string; title: string; pi_email?: string }[],
  meetingDetails: { date: string; time: string; venue: string; evaluatorUids: string[] },
) {
  try {
    const batch = adminDb.batch()
    const timeZone = "Asia/Kolkata"
    // Combine date and time into a single string for robust parsing
    const meetingDateTimeString = `${meetingDetails.date}T${meetingDetails.time}:00`

    const formattedDate = formatInTimeZone(meetingDateTimeString, timeZone, "MMMM d, yyyy")
    const formattedTime = formatInTimeZone(meetingDateTimeString, timeZone, "h:mm a (z)")

    for (const projectData of projectsToSchedule) {
      const projectRef = adminDb.collection("projects").doc(projectData.id)
      batch.update(projectRef, {
        meetingDetails: {
          date: meetingDetails.date,
          time: meetingDetails.time,
          venue: meetingDetails.venue,
          assignedEvaluators: meetingDetails.evaluatorUids,
        },
        status: "Under Review",
      })

      const notificationRef = adminDb.collection("notifications").doc()
      batch.set(notificationRef, {
        uid: projectData.pi_uid,
        projectId: projectData.id,
        title: `IMR meeting scheduled for your project: "${projectData.title}"`,
        createdAt: new Date().toISOString(),
        isRead: false,
      })

      if (projectData.pi_email) {
        await sendEmailUtility({
          to: projectData.pi_email,
          subject: `IMR Meeting Scheduled for Your Project: ${projectData.title}`,
          html: `
            <div ${EMAIL_STYLES.background}>
              ${EMAIL_STYLES.logo}
              <p style="color: #ffffff;">Dear Researcher,</p>
              <p style="color: #e0e0e0;">
                An <strong style="color: #ffffff;">IMR evaluation meeting</strong> has been scheduled for your project, 
                "<strong style="color: #ffffff;">${projectData.title}</strong>".
              </p>
              <p><strong style="color: #ffffff;">Date:</strong> ${formattedDate}</p>
              <p><strong style="color: #ffffff;">Time:</strong> ${formattedTime}</p>
              <p><strong style="color: #ffffff;">Venue:</strong> ${meetingDetails.venue}</p>
              <p style="color: #cccccc;">
                Please prepare for your presentation. You can view more details on the 
                <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/project/${projectData.id}" style="color: #64b5f6; text-decoration: underline;">
                  PU Research Projects Portal
                </a>.
              </p>
              ${EMAIL_STYLES.footer}
            </div>
          `,
          from: "default",
        })
      }
    }

    // Notify evaluators
    if (meetingDetails.evaluatorUids && meetingDetails.evaluatorUids.length > 0) {
      const evaluatorDocs = await Promise.all(
        meetingDetails.evaluatorUids.map((uid) => adminDb.collection("users").doc(uid).get()),
      )

      const projectTitles = projectsToSchedule.map((p) => `<li style="color: #cccccc;">${p.title}</li>`).join("")

      for (const evaluatorDocSnapshot of evaluatorDocs) {
        if (evaluatorDocSnapshot.exists) {
          const evaluator = evaluatorDocSnapshot.data() as User

          const evaluatorNotificationRef = adminDb.collection("notifications").doc()
          batch.set(evaluatorNotificationRef, {
            uid: evaluator.uid,
            projectId: projectsToSchedule[0].id,
            title: `You've been assigned to an IMR evaluation on ${formattedDate}`,
            createdAt: new Date().toISOString(),
            isRead: false,
          })

          if (evaluator.email) {
            await sendEmailUtility({
              to: evaluator.email,
              subject: "IMR Evaluation Committee Assignment",
              html: `
                <div ${EMAIL_STYLES.background}>
                    ${EMAIL_STYLES.logo}
                    <p style="color: #ffffff;">Dear Evaluator,</p>
                    <p style="color: #e0e0e0;">
                        You have been assigned to the IMR evaluation committee for a meeting with the following details. You are requested to be present.
                    </p>
                    <p><strong style="color: #ffffff;">Date:</strong> ${formattedDate}</p>
                    <p><strong style="color: #ffffff;">Time:</strong> ${formattedTime}</p>
                    <p><strong style="color: #ffffff;">Venue:</strong> ${meetingDetails.venue}</p>
                    <p style="color: #e0e0e0;">The following projects are scheduled for your review:</p>
                    <ul style="list-style-type: none; padding-left: 0;">
                        ${projectTitles}
                    </ul>
                    <p style="color: #cccccc;">
                        You can access your evaluation queue on the
                        <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/evaluator-dashboard" style="color: #64b5f6; text-decoration: underline;">
                       
                        </a>.
                    </p>
                    ${EMAIL_STYLES.footer}
                </div>
              `,
              from: "default",
            })
          }
        }
      }
    }

    await batch.commit()
    await logActivity("INFO", "IMR meeting scheduled", {
      projectIds: projectsToSchedule.map((p) => p.id),
      meetingDate: meetingDetails.date,
    })
    return { success: true }
  } catch (error: any) {
    console.error("Error scheduling meeting:", error)
    await logActivity("ERROR", "Failed to schedule IMR meeting", { error: error.message, stack: error.stack })
    return { success: false, error: error.message || "Failed to schedule meeting." }
  }
}

export async function uploadFileToServer(
  fileDataUrl: string,
  path: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!fileDataUrl || typeof fileDataUrl !== "string") {
      throw new Error("Invalid file data URL provided.");
    }

    const bucket = adminStorage.bucket();
    const file = bucket.file(path);

    const match = fileDataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match || match.length < 3) {
      throw new Error("Invalid data URL format.");
    }

    const mimeType = match[1];
    const base64Data = match[2];

    if (!mimeType || !base64Data) {
      throw new Error("Could not extract file data from data URL.");
    }

    const buffer = Buffer.from(base64Data, "base64");

    // The modern, correct way to upload and get a public URL
    await file.save(buffer, {
      metadata: {
        contentType: mimeType,
      },
    });

    // Make the file public
    await file.makePublic();
    
    // Get the public URL
    const publicUrl = file.publicUrl();

    console.log(`File uploaded successfully to ${path}, URL: ${publicUrl}`);

    return { success: true, url: publicUrl };

  } catch (error: any) {
    console.error("Error uploading file via admin:", error);
    await logActivity("ERROR", "File upload failed", { path, error: error.message, stack: error.stack });
    return { success: false, error: error.message || "Failed to upload file." };
  }
}


export async function notifyAdminsOnProjectSubmission(projectId: string, projectTitle: string, piName: string) {
  try {
    const adminRoles = ["admin", "Super-admin", "CRO"]
    const usersRef = adminDb.collection("users")
    const q = usersRef.where("role", "in", adminRoles)

    const adminUsersSnapshot = await q.get()
    if (adminUsersSnapshot.empty) {
      console.log("No admin users found to notify.")
      return { success: true, message: "No admins to notify." }
    }

    const batch = adminDb.batch()
    const notificationTitle = `New Project Submitted: "${projectTitle}" by ${piName}`

    adminUsersSnapshot.forEach((userDocSnapshot) => {
      // userDocSnapshot.id is the UID of the admin user
      const notificationRef = adminDb.collection("notifications").doc()
      batch.set(notificationRef, {
        uid: userDocSnapshot.id,
        projectId: projectId,
        title: notificationTitle,
        createdAt: new Date().toISOString(),
        isRead: false,
      })
    })

    await batch.commit()
    await logActivity("INFO", "New project submission notification sent to admins", { projectId, projectTitle })
    return { success: true }
  } catch (error: any) {
    console.error("Error notifying admins:", error)
    await logActivity("ERROR", "Failed to notify admins on project submission", {
      projectId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to notify admins." }
  }
}

export async function notifySuperAdminsOnEvaluation(projectId: string, projectName: string, evaluatorName: string) {
  try {
    const superAdminUsersSnapshot = await adminDb.collection("users").where("role", "==", "Super-admin").get()
    if (superAdminUsersSnapshot.empty) {
      console.log("No Super-admin users found to notify.")
      return { success: true, message: "No Super-admins to notify." }
    }

    const batch = adminDb.batch()
    const notificationTitle = `Evaluation submitted for "${projectName}" by ${evaluatorName}`

    superAdminUsersSnapshot.forEach((userDocSnapshot) => {
      const notificationRef = adminDb.collection("notifications").doc()
      batch.set(notificationRef, {
        uid: userDocSnapshot.id,
        projectId: projectId,
        title: notificationTitle,
        createdAt: new Date().toISOString(),
        isRead: false,
      })
    })

    await batch.commit()
    await logActivity("INFO", "Evaluation submission notification sent to super-admins", {
      projectId,
      projectName,
      evaluatorName,
    })
    return { success: true }
  } catch (error: any) {
    console.error("Error notifying Super-admins:", error)
    await logActivity("ERROR", "Failed to notify super-admins on evaluation", {
      projectId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to notify Super-admins." }
  }
}

export async function notifyAdminsOnCompletionRequest(projectId: string, projectTitle: string, piName: string) {
  try {
    const adminRoles = ["admin", "Super-admin"]
    const usersRef = adminDb.collection("users")
    const q = usersRef.where("role", "in", adminRoles)

    const adminUsersSnapshot = await q.get()
    if (adminUsersSnapshot.empty) {
      console.log("No admin users found to notify for completion request.")
      return { success: true, message: "No admins to notify." }
    }

    const batch = adminDb.batch()
    const notificationTitle = `Project Completion Requested: "${projectTitle}" by ${piName}`

    adminUsersSnapshot.forEach((userDoc) => {
      const notificationRef = adminDb.collection("notifications").doc()
      batch.set(notificationRef, {
        uid: userDoc.id,
        projectId: projectId,
        title: notificationTitle,
        createdAt: new Date().toISOString(),
        isRead: false,
      })
    })

    await batch.commit()
    await logActivity("INFO", "Completion request notification sent to admins", { projectId, projectTitle })
    return { success: true }
  } catch (error: any