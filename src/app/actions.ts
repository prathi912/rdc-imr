
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
} from "@/types"
import { sendEmail as sendEmailUtility } from "@/lib/email"
import fs from "fs"
import path from "path"
import { addDays, setHours, setMinutes, setSeconds, isToday } from "date-fns"
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

    const updateData: { status: Project["status"]; revisionComments?: string } = { status: newStatus }
    if (newStatus === "Revision Needed" && comments) {
      updateData.revisionComments = comments
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

    if (newStatus === "Revision Needed" && comments) {
      emailHtml += `
          <div style="margin-top:20px; padding:15px; border:1px solid #4f5b62; border-radius:6px; background-color:#2c3e50;">
            <h4 style="color:#ffffff; margin-top:0;">Evaluator's Comments for Revision:</h4>
            <p style="color:#e0e0e0; white-space: pre-wrap;">${comments}</p>
          </div>
          <p style="color:#e0e0e0; margin-top:20px;">
            Please submit the revised proposal from your project details page on the portal.
          </p>
        `
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
      throw new Error("Invalid file data URL provided.")
    }

    const bucket = adminStorage.bucket()
    const file = bucket.file(path)

    // Extract mime type and base64 data from data URL
    const match = fileDataUrl.match(/^data:(.+);base64,(.+)$/)
    if (!match || match.length < 3) {
      throw new Error("Invalid data URL format.")
    }

    const mimeType = match[1]
    const base64Data = match[2]

    if (!mimeType || !base64Data) {
      throw new Error("Could not extract file data from data URL.")
    }

    const buffer = Buffer.from(base64Data, "base64")

    // Upload the file buffer
    await file.save(buffer, {
      metadata: {
        contentType: mimeType,
      },
      public: true, // Make the file public
    })

    // Get the public URL
    const downloadUrl = file.publicUrl()

    console.log(`File uploaded successfully to ${path}, URL: ${downloadUrl}`)

    return { success: true, url: downloadUrl }
  } catch (error: any) {
    console.error("Error uploading file via admin:", error)
    await logActivity("ERROR", "File upload failed", { path, error: error.message, stack: error.stack })
    return { success: false, error: error.message || "Failed to upload file." }
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
  } catch (error: any) {
    console.error("Error notifying admins on completion request:", error)
    await logActivity("ERROR", "Failed to notify admins on completion request", {
      projectId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to notify admins." }
  }
}

export async function checkMisIdExists(
  misId: string,
  currentUid: string,
  campus: string,
): Promise<{ exists: boolean }> {
  try {
    if (!misId || typeof misId !== "string" || misId.trim() === "" || !campus) {
      return { exists: false }
    }
    const usersRef = adminDb.collection("users")
    const q = usersRef.where("misId", "==", misId).where("campus", "==", campus)
    const querySnapshot = await q.get()

    if (querySnapshot.empty) {
      return { exists: false }
    }

    const foundUserDoc = querySnapshot.docs[0]
    if (foundUserDoc.id === currentUid) {
      // The only user with this MIS ID and campus is the current user.
      return { exists: false }
    }

    // A different user with the same MIS ID and campus exists.
    return { exists: true }
  } catch (error: any) {
    console.error("Error checking MIS ID uniqueness:", error)
    await logActivity("ERROR", "Failed to check MIS ID existence", {
      misId,
      campus,
      error: error.message,
      stack: error.stack,
    })
    // Rethrow to let the client know something went wrong with the check.
    throw new Error("Failed to verify MIS ID due to a server error. Please try again.")
  }
}

export async function checkHODUniqueness(
  department: string,
  institute: string,
  currentUid: string,
): Promise<{ exists: boolean }> {
  try {
    if (!department || !institute) {
      return { exists: false } // Cannot check if required fields are missing
    }
    const usersRef = adminDb.collection("users")
    const q = usersRef
      .where("designation", "==", "HOD")
      .where("department", "==", department)
      .where("institute", "==", institute)

    const querySnapshot = await q.get()

    if (querySnapshot.empty) {
      return { exists: false }
    }

    const foundUserDoc = querySnapshot.docs[0]
    // If the found HOD is the same as the user being updated, it's not a conflict.
    if (foundUserDoc.id === currentUid) {
      return { exists: false }
    }

    // A different user is already the HOD for this department/institute.
    return { exists: true }
  } catch (error: any) {
    console.error("Error checking HOD uniqueness:", error)
    await logActivity("ERROR", "Failed to check HOD uniqueness", {
      department,
      institute,
      error: error.message,
      stack: error.stack,
    })
    // Rethrow to ensure the client-side operation fails and informs the user.
    throw new Error("A server error occurred while verifying the HOD designation. Please try again.")
  }
}

export async function fetchScopusDataByUrl(
  url: string,
  claimantName: string,
): Promise<{
  success: boolean
  data?: { title: string; journalName: string; totalAuthors: number }
  error?: string
  claimantIsAuthor?: boolean
}> {
  const apiKey = process.env.SCOPUS_API_KEY
  if (!apiKey) {
    console.error("Scopus API key is not configured.")
    return { success: false, error: "Scopus integration is not configured on the server." }
  }

  let identifier: string | null = null
  let type: "doi" | "eid" | null = null

  // Prioritize EID extraction from Scopus URLs as it's more specific
  const eidMatch = url.match(/eid=([^&]+)/)
  if (eidMatch && eidMatch[1]) {
    identifier = eidMatch[1]
    type = "eid"
  } else {
    // If no EID is found, fall back to looking for a DOI anywhere in the string
    const doiMatch = url.match(/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i)
    if (doiMatch && doiMatch[1]) {
      identifier = doiMatch[1]
      type = "doi"
    }
  }

  if (!identifier || !type) {
    return { success: false, error: "Could not find a valid Scopus EID or DOI in the provided link." }
  }

  const scopusApiUrl = `https://api.elsevier.com/content/abstract/${type}/${encodeURIComponent(identifier)}`

  try {
    const response = await fetch(scopusApiUrl, {
      headers: {
        "X-ELS-APIKey": apiKey,
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      const errorMessage = errorData?.["service-error"]?.status?.statusText || "Failed to fetch data from Scopus."
      return { success: false, error: `Scopus API Error: ${errorMessage}` }
    }

    const data = await response.json()
    const coredata = data?.["abstracts-retrieval-response"]?.coredata
    const authors = data?.["abstracts-retrieval-response"]?.authors?.author

    if (!coredata) {
      return { success: false, error: "Invalid response structure from Scopus API." }
    }

    const title = coredata["dc:title"] || ""
    const journalName = coredata["prism:publicationName"] || ""
    const totalAuthors = Array.isArray(authors) ? authors.length : 0

    const nameParts = claimantName.trim().toLowerCase().split(/\s+/)
    const claimantLastName = nameParts.pop() || "---"
    const claimantFirstName = nameParts[0] || "---"

    const isClaimantAnAuthor =
      Array.isArray(authors) &&
      authors.some((author) => {
        const indexedName = (author["ce:indexed-name"] || "").toLowerCase() // "joshi, r." or "joshi, rajesh"

        // Strategy 1: Use the indexed name which is usually reliable.
        if (indexedName.includes(",")) {
          const [scopusLastName, scopusFirstNamePart] = indexedName.split(",").map((p) => p.trim())
          if (scopusLastName === claimantLastName) {
            // Last names match. Now check first name/initial.
            if (scopusFirstNamePart.startsWith(claimantFirstName.charAt(0))) {
              return true // Match found (e.g., "joshi" and "a" from "anand")
            }
          }
        }

        // Strategy 2: Fallback to structured name fields if they exist.
        const surname = (author["ce:surname"] || "").toLowerCase()
        if (surname && surname === claimantLastName) {
          return true // Match on surname as a fallback
        }

        return false
      })

    return {
      success: true,
      data: {
        title,
        journalName,
        totalAuthors,
      },
      claimantIsAuthor: isClaimantAnAuthor,
    }
  } catch (error: any) {
    console.error("Error calling Scopus API:", error)
    await logActivity("ERROR", "Failed to fetch Scopus data", { url, error: error.message, stack: error.stack })
    return { success: false, error: error.message || "An unexpected error occurred while fetching Scopus data." }
  }
}

export async function fetchWosDataByUrl(
  url: string,
  claimantName: string,
): Promise<{
  success: boolean
  data?: { title: string; journalName: string; totalAuthors: number }
  error?: string
  claimantIsAuthor?: boolean
}> {
  const apiKey = process.env.WOS_API_KEY
  if (!apiKey) {
    console.error("Web of Science API key is not configured.")
    return { success: false, error: "Web of Science integration is not configured on the server." }
  }

  const doiMatch = url.match(/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i)
  if (!doiMatch || !doiMatch[1]) {
    return { success: false, error: "Could not find a valid DOI in the provided link." }
  }
  const doi = doiMatch[1]

  const wosApiUrl = `https://api.clarivate.com/apis/wos-starter/v1/documents?q=DO=${encodeURIComponent(doi)}`

  try {
    const response = await fetch(wosApiUrl, {
      headers: {
        "X-ApiKey": apiKey,
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      const errorMessage = errorData?.message || "Failed to fetch data from Web of Science."
      return { success: false, error: `WoS API Error: ${errorMessage}` }
    }

    const data = await response.json()
    const record = data?.data?.[0]

    if (!record) {
      return { success: false, error: "No matching record found in Web of Science for the provided DOI." }
    }

    const title = record.title || ""
    const journalName = record.source?.title || ""

    const authors = record.authors
    const authorList = Array.isArray(authors) ? authors : authors ? [authors] : []
    const totalAuthors = authorList.length

    const nameParts = claimantName.trim().toLowerCase().split(/\s+/)
    const claimantLastName = nameParts.pop() || "---"

    const isClaimantAnAuthor = authorList.some((author: any) => {
      const wosFullName = (author.name || "").toLowerCase()
      // WoS format is "Lastname, F." or "Lastname, Firstname"
      if (wosFullName.includes(",")) {
        const [wosLastName] = wosFullName.split(",").map((p: string) => p.trim())
        return wosLastName === claimantLastName
      }
      // Fallback for "Firstname Lastname" format
      return wosFullName.includes(claimantLastName)
    })

    return {
      success: true,
      data: {
        title,
        journalName,
        totalAuthors,
      },
      claimantIsAuthor: isClaimantAnAuthor,
    }
  } catch (error: any) {
    console.error("Error calling Web of Science API:", error)
    await logActivity("ERROR", "Failed to fetch WoS data", { url, error: error.message, stack: error.stack })
    return { success: false, error: error.message || "An unexpected error occurred while fetching WoS data." }
  }
}

// Function to convert Excel serial date number to JS Date
function excelDateToJSDate(serial: number) {
  const utc_days = Math.floor(serial - 25569)
  const utc_value = utc_days * 86400
  const date_info = new Date(utc_value * 1000)

  const fractional_day = serial - Math.floor(serial) + 0.0000001

  let total_seconds = Math.floor(86400 * fractional_day)

  const seconds = total_seconds % 60

  total_seconds -= seconds

  const hours = Math.floor(total_seconds / (60 * 60))
  const minutes = Math.floor(total_seconds / 60) % 60

  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds)
}

export async function bulkUploadProjects(projectsData: any[]): Promise<{
  success: boolean
  data: {
    successfulCount: number
    failures: { projectTitle: string; piName: string; error: string }[]
  }
  error?: string
}> {
  const usersRef = adminDb.collection("users")
  let successfulCount = 0
  const failures: { projectTitle: string; piName: string; error: string }[] = []

  for (const project of projectsData) {
    try {
      const projectTitle = project.project_title || "Untitled"
      const piName = project.Name_of_staff || "Unknown PI"

      if (!project.pi_email || !project.project_title || !project.status) {
        failures.push({ projectTitle, piName, error: "Missing required columns (pi_email, project_title, status)." })
        continue
      }

      let pi_uid = ""
      let faculty = project.Faculty
      let institute = project.Institute
      let departmentName = project.Department || null

      const userQuery = await usersRef.where("email", "==", project.pi_email).limit(1).get()
      if (!userQuery.empty) {
        const userDoc = userQuery.docs[0]
        const userData = userDoc.data()
        pi_uid = userDoc.id
        faculty = userData.faculty || faculty
        institute = userData.institute || institute
        departmentName = userData.department || departmentName
      }

      let submissionDate
      if (project.sanction_date) {
        if (project.sanction_date instanceof Date) {
          submissionDate = project.sanction_date.toISOString()
        } else if (typeof project.sanction_date === "number") {
          submissionDate = excelDateToJSDate(project.sanction_date).toISOString()
        } else if (typeof project.sanction_date === "string") {
          const parsedDate = new Date(project.sanction_date.replace(/(\d{2})-(\d{2})-(\d{4})/, "$3-$2-$1"))
          submissionDate = !isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString()
        } else {
          submissionDate = new Date().toISOString()
        }
      } else {
        submissionDate = new Date().toISOString()
      }

      const coPiEmails = Object.keys(project)
        .filter((key) => key.toLowerCase().startsWith("co_pi_") && key.toLowerCase().endsWith("_email"))
        .map((key) => project[key])
        .filter((email) => typeof email === "string" && email.trim() !== "")

      let coPiDetails: CoPiDetails[] = []
      let coPiUids: string[] = []

      if (coPiEmails.length > 0) {
        const coPiQuery = await usersRef.where("email", "in", coPiEmails).get()
        const coPiMap = new Map<string, { uid: string; name: string }>()
        coPiQuery.forEach((doc) => {
          const userData = doc.data()
          coPiMap.set(userData.email, { uid: doc.id, name: userData.name })
        })

        coPiDetails = coPiEmails.map((email) => {
          const coPiUser = coPiMap.get(email)
          return {
            email: email,
            name: coPiUser?.name || "Unknown User",
            uid: coPiUser?.uid,
          }
        })

        coPiUids = coPiDetails.map((d) => d.uid).filter((uid): uid is string => !!uid)
      }

      const newProjectData: Omit<Project, "id"> = {
        title: project.project_title,
        pi_email: project.pi_email,
        status: project.status,
        pi_uid: pi_uid,
        pi: piName,
        abstract: "Historical data migrated from bulk upload.",
        type: "Research",
        faculty: faculty || "N/A",
        institute: institute,
        departmentName: departmentName || "N/A",
        teamInfo: "Historical data, team info not available.", // This field is now supplemented by coPiDetails
        timelineAndOutcomes: "Historical data, outcomes not available.",
        submissionDate: submissionDate,
        isBulkUploaded: true,
        coPiDetails: coPiDetails,
        coPiUids: coPiUids,
      }

      if (project.grant_amount && project.grant_amount > 0) {
        const firstPhase: GrantPhase = {
          id: new Date().toISOString(),
          name: "Phase 1",
          amount: project.grant_amount,
          status: "Disbursed",
          disbursementDate: submissionDate,
          transactions: [],
        }
        newProjectData.grant = {
          totalAmount: project.grant_amount,
          status: "Awarded",
          sanctionNumber: project.sanction_number || "",
          phases: [firstPhase],
        }
      }

      await adminDb.collection("projects").add(newProjectData)
      successfulCount++
    } catch (error: any) {
      console.error("Error processing a single project during bulk upload:", error)
      failures.push({
        projectTitle: project.project_title || "Untitled",
        piName: project.Name_of_staff || "Unknown PI",
        error: error.message || "An unknown error occurred during saving.",
      })
    }
  }

  await logActivity("INFO", "Bulk project upload completed", { successfulCount, failureCount: failures.length })
  if (failures.length > 0) {
    await logActivity("WARNING", "Some projects failed during bulk upload", { failures })
  }

  return { success: true, data: { successfulCount, failures } }
}

export async function deleteBulkProject(projectId: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!projectId) {
      return { success: false, error: "Project ID is required." }
    }
    const projectRef = adminDb.collection("projects").doc(projectId)
    await projectRef.delete()
    await logActivity("INFO", "Bulk uploaded project deleted", { projectId })
    return { success: true }
  } catch (error: any) {
    console.error("Error deleting project:", error)
    await logActivity("ERROR", "Failed to delete bulk uploaded project", {
      projectId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to delete the project." }
  }
}

export async function fetchOrcidData(orcidId: string): Promise<{
  success: boolean
  data?: { name: string }
  error?: string
}> {
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcidId)) {
    return { success: false, error: "Invalid ORCID iD format." }
  }

  const orcidApiUrl = `https://pub.orcid.org/v3.0/${orcidId}`

  try {
    const response = await fetch(orcidApiUrl, {
      headers: {
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: "ORCID iD not found." }
      }
      const errorText = await response.text()
      return { success: false, error: `ORCID API Error: ${response.statusText} - ${errorText}` }
    }

    const data = await response.json()

    const givenName = data.person.name["given-names"]?.value || ""
    const familyName = data.person.name["family-name"]?.value || ""
    const fullName = `${givenName} ${familyName}`.trim()

    if (!fullName) {
      return { success: false, error: "Could not extract name from ORCID profile." }
    }

    return {
      success: true,
      data: {
        name: fullName,
      },
    }
  } catch (error: any) {
    console.error("Error calling ORCID API:", error)
    await logActivity("ERROR", "Failed to fetch ORCID data", { orcidId, error: error.message, stack: error.stack })
    return { success: false, error: error.message || "An unexpected error occurred while fetching ORCID data." }
  }
}

export async function linkHistoricalData(
  userData: Partial<User> & { uid: string; email: string },
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const { uid, email, institute, department, phoneNumber } = userData
    if (!uid || !email) {
      return { success: false, count: 0, error: "User UID and Email are required." }
    }

    const projectsRef = adminDb.collection("projects")
    const q = projectsRef.where("pi_email", "==", email).where("pi_uid", "in", ["", null])

    const projectsSnapshot = await q.get()

    if (projectsSnapshot.empty) {
      return { success: true, count: 0 }
    }

    const batch = adminDb.batch()
    projectsSnapshot.forEach((projectDoc) => {
      const updateData: { [key: string]: any } = { pi_uid: uid }
      if (institute) updateData.institute = institute
      if (department) updateData.departmentName = department
      if (phoneNumber) updateData.pi_phoneNumber = phoneNumber

      batch.update(projectDoc.ref, updateData)
    })

    await batch.commit()

    await logActivity("INFO", "Linked historical data for new user", {
      uid,
      email,
      count: projectsSnapshot.size,
    })

    return { success: true, count: projectsSnapshot.size }
  } catch (error: any) {
    console.error("Error linking historical project data:", error)
    await logActivity("ERROR", "Failed to link historical data", {
      uid: userData.uid,
      email: userData.email,
      error: error.message,
      stack: error.stack,
    })
    return {
      success: false,
      count: 0,
      error: error.message || "Failed to link historical data.",
    }
  }
}

export async function linkEmrInterestsToNewUser(
  uid: string,
  email: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (!uid || !email) {
      return { success: false, count: 0, error: "User UID and Email are required." }
    }

    const lowercasedEmail = email.toLowerCase()
    const interestsRef = adminDb.collection("emrInterests")
    const q = interestsRef.where("userEmail", "==", lowercasedEmail).where("userId", "in", ["", null])

    const snapshot = await q.get()

    if (snapshot.empty) {
      return { success: true, count: 0 }
    }

    const batch = adminDb.batch()
    snapshot.forEach((doc) => {
      batch.update(doc.ref, { userId: uid })
    })

    await batch.commit()

    await logActivity("INFO", "Linked historical EMR interests to new user", { uid, email, count: snapshot.size })
    return { success: true, count: snapshot.size }
  } catch (error: any) {
    console.error("Error linking EMR interests:", error)
    await logActivity("ERROR", "Failed to link EMR interests", { uid, email, error: error.message, stack: error.stack })
    return { success: false, count: 0, error: "Failed to link EMR interests." }
  }
}

export async function linkEmrCoPiInterestsToNewUser(
  uid: string,
  email: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (!uid || !email) {
      return { success: false, count: 0, error: "User UID and Email are required." }
    }

    const lowercasedEmail = email.toLowerCase()
    const interestsRef = adminDb.collection("emrInterests")

    const q = interestsRef.where("coPiEmails", "array-contains", lowercasedEmail)
    const snapshot = await q.get()

    if (snapshot.empty) {
      return { success: true, count: 0 }
    }

    const batch = adminDb.batch()
    let updatedCount = 0

    snapshot.forEach((doc) => {
      const interest = doc.data() as EmrInterest
      let needsUpdate = false

      const updatedCoPiDetails = (interest.coPiDetails || []).map((coPi) => {
        // Find the Co-PI entry that matches the new user's email and doesn't have a UID yet.
        if (coPi.email.toLowerCase() === lowercasedEmail && !coPi.uid) {
          needsUpdate = true
          return { ...coPi, uid: uid }
        }
        return coPi
      })

      if (needsUpdate) {
        const updatedCoPiUids = [...new Set([...(interest.coPiUids || []), uid])]
        batch.update(doc.ref, {
          coPiDetails: updatedCoPiDetails,
          coPiUids: updatedCoPiUids,
        })
        updatedCount++
      }
    })

    if (updatedCount > 0) {
      await batch.commit()
      await logActivity("INFO", "Linked EMR Co-PI interests to new user by email", { uid, email, count: updatedCount })
    }

    return { success: true, count: updatedCount }
  } catch (error: any) {
    console.error("Error linking EMR Co-PI interests by email:", error)
    await logActivity("ERROR", "Failed to link EMR Co-PI interests by email", {
      uid,
      email,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, count: 0, error: "Failed to link EMR Co-PI interests." }
  }
}

export async function linkEmrInterestsByMisId(
  uid: string,
  misId: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!uid || !misId) {
    return { success: false, count: 0, error: "User UID and MIS ID are required." }
  }

  try {
    const interestsRef = adminDb.collection("emrInterests")
    const snapshot = await interestsRef.get()

    if (snapshot.empty) {
      return { success: true, count: 0 }
    }

    const batch = adminDb.batch()
    let updatedCount = 0

    snapshot.forEach((doc) => {
      const interest = doc.data() as EmrInterest
      let needsUpdate = false

      const updatedCoPiDetails = (interest.coPiDetails || []).map((coPi) => {
        if (coPi.misId === misId && !coPi.uid) {
          needsUpdate = true
          return { ...coPi, uid: uid }
        }
        return coPi
      })

      if (needsUpdate) {
        const updatedCoPiUids = [...new Set([...(interest.coPiUids || []), uid])]
        batch.update(doc.ref, {
          coPiDetails: updatedCoPiDetails,
          coPiUids: updatedCoPiUids,
        })
        updatedCount++
      }
    })

    if (updatedCount > 0) {
      await batch.commit()
      await logActivity("INFO", "Linked EMR Co-PI interests to new user by MIS ID", { uid, misId, count: updatedCount })
    }

    return { success: true, count: updatedCount }
  } catch (error: any) {
    console.error("Error linking EMR Co-PI interests by MIS ID:", error)
    await logActivity("ERROR", "Failed to link EMR Co-PI interests by MIS ID", {
      uid,
      misId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, count: 0, error: "Failed to link EMR Co-PI interests by MIS ID." }
  }
}

export async function updateProjectWithRevision(
  projectId: string,
  revisedProposalUrl: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!projectId || !revisedProposalUrl) {
      return { success: false, error: "Project ID and revised proposal URL are required." }
    }
    const projectRef = adminDb.collection("projects").doc(projectId)

    await projectRef.update({
      revisedProposalUrl: revisedProposalUrl,
      revisionSubmissionDate: new Date().toISOString(),
      status: "Under Review",
    })

    const projectSnap = await projectRef.get()
    if (!projectSnap.exists) {
      return { success: false, error: "Project not found after update." }
    }
    const project = projectSnap.data() as Project

    // Notify admins
    const adminRoles = ["admin", "Super-admin", "CRO"]
    const usersRef = adminDb.collection("users")
    const q = usersRef.where("role", "in", adminRoles)

    const adminUsersSnapshot = await q.get()
    if (!adminUsersSnapshot.empty) {
      const batch = adminDb.batch()
      const notificationTitle = `Revision Submitted for "${project.title}" by ${project.pi}`

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
    }

    await logActivity("INFO", "Project revision submitted", { projectId, title: project.title, piUid: project.pi_uid })
    return { success: true }
  } catch (error: any) {
    console.error("Error submitting project revision:", error)
    await logActivity("ERROR", "Failed to submit project revision", {
      projectId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to submit revision." }
  }
}

export async function updateProjectDuration(
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!projectId || !startDate || !endDate) {
      return { success: false, error: "Project ID, start date, and end date are required." }
    }
    const projectRef = adminDb.collection("projects").doc(projectId)
    await projectRef.update({
      projectStartDate: startDate,
      projectEndDate: endDate,
    })
    await logActivity("INFO", "Project duration updated", { projectId, startDate, endDate })
    return { success: true }
  } catch (error: any) {
    console.error("Error updating project duration:", error)
    await logActivity("ERROR", "Failed to update project duration", {
      projectId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: "Failed to update project duration." }
  }
}

export async function updateProjectEvaluators(
  projectId: string,
  evaluatorUids: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!projectId || !evaluatorUids) {
      return { success: false, error: "Project ID and evaluator UIDs are required." }
    }
    const projectRef = adminDb.collection("projects").doc(projectId)
    const projectSnap = await projectRef.get()
    if (!projectSnap.exists || !projectSnap.data()?.meetingDetails) {
      return { success: false, error: "Project or its meeting details not found." }
    }
    await projectRef.update({
      "meetingDetails.assignedEvaluators": evaluatorUids,
    })
    await logActivity("INFO", "Project evaluators updated", { projectId, evaluatorUids })
    return { success: true }
  } catch (error: any) {
    console.error("Error updating project evaluators:", error)
    await logActivity("ERROR", "Failed to update project evaluators", {
      projectId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: "Failed to update project evaluators." }
  }
}

type FoundUser = { uid: string | null; name: string; email: string; misId: string; campus: string }

export async function findUserByMisId(misId: string): Promise<{
  success: boolean
  user?: FoundUser
  users?: FoundUser[]
  error?: string
}> {
  try {
    if (!misId || misId.trim() === "") {
      return { success: false, error: "MIS ID is required." }
    }

    const allFound = new Map<string, FoundUser>()

    // 1. Search existing users in Firestore
    const usersRef = adminDb.collection("users")
    const q = usersRef.where("misId", "==", misId)
    const querySnapshot = await q.get()

    querySnapshot.forEach((doc) => {
      const userData = doc.data() as User
      if (userData.role !== "admin" && userData.role !== "Super-admin") {
        const userResult = {
          uid: doc.id,
          name: userData.name,
          email: userData.email,
          misId: userData.misId!,
          campus: userData.campus || "Vadodara",
        }
        allFound.set(userResult.email, userResult)
      }
    })

    // 2. Search staff data files via API
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:9002"
    const response = await fetch(`${baseUrl}/api/get-staff-data?misId=${encodeURIComponent(misId)}&fetchAll=true`)
    const staffResult = await response.json()

    if (staffResult.success && Array.isArray(staffResult.data)) {
      staffResult.data.forEach((staff: any) => {
        if (!allFound.has(staff.email)) {
          allFound.set(staff.email, {
            uid: null, // No UID for staff not yet registered
            name: staff.name,
            email: staff.email,
            misId: staff.misId,
            campus: staff.campus,
          })
        }
      })
    }

    const foundUsers = Array.from(allFound.values())
    
    if (foundUsers.length > 0) {
        if(foundUsers.length === 1) {
            return { success: true, user: foundUsers[0] };
        }
        return { success: true, users: foundUsers };
    }
    
    return { success: false, error: "No user found with this MIS ID across any campus. Please check the MIS ID or ask them to sign up first." };

  } catch (error: any) {
    console.error("Error finding user by MIS ID:", error)
    await logActivity("ERROR", "Failed to find user by MIS ID", { misId, error: error.message, stack: error.stack })
    return { success: false, error: error.message || "Failed to search for user." }
  }
}

export async function isEmailDomainAllowed(
  email: string,
): Promise<{ allowed: boolean; isCro: boolean; croFaculty?: string; croCampus?: string }> {
  try {
    const settings = await getSystemSettings()
    const allowedDomains = settings.allowedDomains || ["@paruluniversity.ac.in", "@goa.paruluniversity.ac.in"]
    const croAssignments = settings.croAssignments || []

    // Special case for primary super admin
    if (email === "rathipranav07@gmail.com") {
      return { allowed: true, isCro: false }
    }

    const isAllowed = allowedDomains.some((domain) => email.endsWith(domain))
    const croAssignment = croAssignments.find((c) => c.email.toLowerCase() === email.toLowerCase())

    if (croAssignment) {
      return { allowed: true, isCro: true, croFaculty: croAssignment.faculty, croCampus: croAssignment.campus }
    }

    return { allowed: isAllowed, isCro: false }
  } catch (error) {
    console.error("Error checking email domain:", error)
    // Default to original domains on error
    const defaultAllowed = email.endsWith("@paruluniversity.ac.in") || email.endsWith("@goa.paruluniversity.ac.in")
    return { allowed: defaultAllowed, isCro: false }
  }
}

// New server actions for grant management
export async function addGrantPhase(
  projectId: string,
  phaseName: string,
  amount: number,
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

    const newPhase: GrantPhase = {
      id: new Date().toISOString(),
      name: phaseName,
      amount: amount,
      status: "Pending Disbursement",
      transactions: [],
    }

    const updatedPhases = [...(project.grant.phases || []), newPhase]
    const updatedGrant: GrantDetails = {
      ...project.grant,
      phases: updatedPhases,
      totalAmount: updatedPhases.reduce((acc, p) => acc + p.amount, 0),
    }

    await projectRef.update({ grant: updatedGrant })
    await logActivity("INFO", "Grant phase added", { projectId, phaseName, amount })

    // Add notification for new grant phase
    const notification = {
      uid: project.pi_uid,
      projectId: projectId,
      title: `A new grant phase "${phaseName}" has been added to your project "${project.title}".`,
      createdAt: new Date().toISOString(),
      isRead: false,
    }
    await adminDb.collection("notifications").add(notification)

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
    dateOfTransaction: string
    amount: number
    vendorName: string
    isGstRegistered: boolean
    gstNumber?: string
    description?: string
    invoiceFile: File
  },
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

    let invoiceUrl: string | undefined
    if (transactionData.invoiceFile) {
      // Convert file to data URL for upload
      const buffer = await transactionData.invoiceFile.arrayBuffer()
      const base64 = Buffer.from(buffer).toString("base64")
      const dataUrl = `data:${transactionData.invoiceFile.type};base64,${base64}`

      const path = `invoices/${projectId}/${phaseId}/${new Date().toISOString()}-${transactionData.invoiceFile.name}`
      const result = await uploadFileToServer(dataUrl, path)

      if (!result.success || !result.url) {
        return { success: false, error: result.error || "Invoice upload failed" }
      }
      invoiceUrl = result.url
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
    }

    const updatedPhases = project.grant.phases.map((phase, index) => {
      if (index === phaseIndex) {
        return {
          ...phase,
          transactions: [...(phase.transactions || []), newTransaction],
        }
      }
      return phase
    })

    const updatedGrant = { ...project.grant, phases: updatedPhases }
    await projectRef.update({ grant: updatedGrant })
    await logActivity("INFO", "Grant transaction added", { projectId, phaseId, amount: newTransaction.amount })

    const updatedProject = { ...project, grant: updatedGrant }
    return { success: true, updatedProject }
  } catch (error: any) {
    console.error("Error adding transaction:", error)
    await logActivity("ERROR", "Failed to add grant transaction", {
      projectId,
      phaseId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to add transaction." }
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

export async function updateCoInvestigators(
  projectId: string,
  coPiUids: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!projectId) {
      return { success: false, error: "Project ID is required." }
    }
    const projectRef = adminDb.collection("projects").doc(projectId)
    const projectSnap = await projectRef.get()
    if (!projectSnap.exists) {
      return { success: false, error: "Project not found." }
    }
    const project = projectSnap.data() as Project
    const existingCoPis = project.coPiUids || []

    await projectRef.update({
      coPiUids: coPiUids,
    })

    const newCoPis = coPiUids.filter((uid) => !existingCoPis.includes(uid))

    if (newCoPis.length > 0) {
      const usersRef = adminDb.collection("users")
      const usersQuery = usersRef.where(admin.firestore.FieldPath.documentId(), "in", newCoPis)
      const newCoPiDocs = await usersQuery.get()

      const batch = adminDb.batch()

      for (const userDoc of newCoPiDocs.docs) {
        const coPi = userDoc.data() as User

        // In-app notification
        const notificationRef = adminDb.collection("notifications").doc()
        batch.set(notificationRef, {
          uid: coPi.uid,
          projectId: projectId,
          title: `You have been added as a Co-PI to the IMR project: "${project.title}"`,
          createdAt: new Date().toISOString(),
          isRead: false,
        })

        // Email notification
        if (coPi.email) {
          const emailHtml = `
            <div ${EMAIL_STYLES.background}>
              ${EMAIL_STYLES.logo}
              <p style="color:#ffffff;">Dear ${coPi.name},</p>
              <p style="color:#e0e0e0;">You have been added as a Co-PI to the IMR project titled "<strong style="color:#ffffff;">${project.title}</strong>" by ${project.pi}.</p>
              <p style="color:#e0e0e0;">You can view the project details on the PU Research Projects Portal</p>
              ${EMAIL_STYLES.footer}
            </div>`
          await sendEmailUtility({
            to: coPi.email,
            subject: `You've been added to an IMR Project`,
            html: emailHtml,
            from: "default",
          })
        }
      }
      await batch.commit()
    }
    await logActivity("INFO", "Co-investigators updated", { projectId, coPiUids })
    return { success: true }
  } catch (error: any) {
    console.error("Error updating Co-PIs:", error)
    await logActivity("ERROR", "Failed to update co-investigators", {
      projectId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: "Failed to update Co-PIs." }
  }
}

export async function updateUserTutorialStatus(uid: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!uid) {
      return { success: false, error: "User ID is required." }
    }
    const userRef = adminDb.collection("users").doc(uid)
    await userRef.update({ hasCompletedTutorial: true })
    await logActivity("INFO", "User completed tutorial", { uid })
    return { success: true }
  } catch (error: any) {
    console.error("Error updating tutorial status:", error)
    await logActivity("ERROR", "Failed to update user tutorial status", {
      uid,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: "Failed to update tutorial status." }
  }
}

export async function generateOfficeNotingForm(
  projectId: string,
  formData: {
    projectDuration: string
    phases: { name: string; amount: number }[]
  },
): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const projectRef = adminDb.collection("projects").doc(projectId)
    const projectSnap = await projectRef.get()
    if (!projectSnap.exists()) {
      return { success: false, error: "Project not found." }
    }
    const project = { id: projectSnap.id, ...projectSnap.data() } as Project

    const piUserRef = adminDb.collection("users").doc(project.pi_uid)
    const piUserSnap = await piUserRef.get()
    const piUser = piUserSnap.exists ? (piUserSnap.data() as User) : null

    let coPi1User: User | null = null
    if (project.coPiDetails && project.coPiDetails.length > 0 && project.coPiDetails[0].uid) {
      const coPi1UserRef = adminDb.collection("users").doc(project.coPiDetails[0].uid!)
      const coPi1UserSnap = await coPi1UserRef.get()
      if (coPi1UserSnap.exists) {
        coPi1User = coPi1UserSnap.data() as User
      }
    }

    const templatePath = path.join(process.cwd(), "src", "templates", "IMR_OFFICE_NOTING_TEMPLATE.docx")
    if (!fs.existsSync(templatePath)) {
      return { success: false, error: "Office Notings form template not found on the server." }
    }
    const content = fs.readFileSync(templatePath)

    const zip = new PizZip(content)

    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })

    const coPiData: { [key: string]: string } = {}
    const coPiNames = project.coPiDetails?.map((c) => c.name) || []
    for (let i = 0; i < 4; i++) {
      coPiData[`co-pi${i + 1}`] = coPiNames[i] || ""
    }

    const phaseData: { [key: string]: string } = {}
    let totalAmount = 0
    for (let i = 0; i < 4; i++) {
      if (formData.phases[i]) {
        phaseData[`phase${i + 1}_amount`] = formData.phases[i].amount.toLocaleString("en-IN")
        totalAmount += formData.phases[i].amount
      } else {
        phaseData[`phase${i + 1}_amount`] = "N/A"
      }
    }

    const data = {
      pi_name: project.pi,
      pi_designation: piUser?.designation || "N/A",
      pi_department: piUser?.department || project.departmentName || "N/A",
      pi_phone: project.pi_phoneNumber || piUser?.phoneNumber || "N/A",
      pi_email: project.pi_email,
      ...coPiData,
      copi_designation: coPi1User?.designation || "N/A",
      copi_department: coPi1User?.department || "N/A",
      project_title: project.title,
      project_duration: formData.projectDuration,
      ...phaseData,
      total_amount: totalAmount.toLocaleString("en-IN"),
      presentation_date: project.meetingDetails?.date
        ? formatInTimeZone(`${project.meetingDetails.date}T00:00:00`, "Asia/Kolkata", "dd/MM/yyyy")
        : "N/A",
      presentation_time: project.meetingDetails?.time || "N/A",
    }

    doc.setData(data)

    try {
      doc.render()
    } catch (error: any) {
      console.error("Docxtemplater render error:", error)
      if (error.properties && error.properties.errors) {
        console.error("Template errors:", JSON.stringify(error.properties.errors))
      }
      return { success: false, error: "Failed to render the document template." }
    }

    const buf = doc.getZip().generate({ type: "nodebuffer" })
    const base64 = buf.toString("base64")

    if (project.status === "Recommended") {
      await projectRef.update({
        projectDuration: formData.projectDuration,
        phases: formData.phases,
      })
    }

    return { success: true, fileData: base64 }
  } catch (error: any) {
    console.error("Error generating office notings form:", error)
    await logActivity("ERROR", "Failed to generate office notings form", {
      projectId,
      error: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Failed to generate the form." }
  }
}

export async function fetchEvaluatorProjectsForUser(
  evaluatorUid: string,
  piUid: string,
): Promise<{ success: boolean; projects?: Project[]; error?: string }> {
  try {
    const projectsRef = adminDb.collection("projects")
    const q = projectsRef
      .where("pi_uid", "==", piUid)
      .where("meetingDetails.assignedEvaluators", "array-contains", evaluatorUid)

    const snapshot = await q.get()
    const projects = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Project)

    const projectsForToday = projects.filter(
      (p) => p.meetingDetails?.date && isToday(new Date(p.meetingDetails.date.replace(/-/g, "/"))),
    )

    return { success: true, projects: projectsForToday }
  } catch (error: any) {
    console.error("Error fetching projects for evaluator/pi combo:", error)
    return { success: false, error: error.message || "Failed to fetch projects." }
  }
}

    