"use server"

import { getResearchDomainSuggestion, type ResearchDomainInput } from "@/ai/flows/research-domain-suggestion"
import { summarizeProject, type SummarizeProjectInput } from "@/ai/flows/project-summarization"
import { generateEvaluationPrompts, type EvaluationPromptsInput } from "@/ai/flows/evaluation-prompts"
import { findJournalWebsite, type JournalWebsiteInput } from "@/ai/flows/journal-website-finder"
import { adminDb, adminStorage } from "@/lib/admin"
import { FieldValue, getFirestore } from "firebase-admin/firestore"
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
  Evaluation,
} from "@/types"
import { sendEmail } from "@/lib/email"
import * as XLSX from "xlsx"
import fs from "fs"
import path from "path"
import { format, parse, parseISO, addDays, setHours, setMinutes, setSeconds } from "date-fns"
import type * as z from "zod"
import PizZip from "pizzip"
import Docxtemplater from "docxtemplater"

const EMAIL_STYLES = {
  background:
    'style="background: linear-gradient(135deg, #0f2027, #203a43, #2c5364); color:#ffffff; font-family:Arial, sans-serif; padding:20px; border-radius:8px;"',
  logo: '<div style="text-align:center; margin-bottom:20px;"><img src="https://c9lfgwsokvjlngjd.public.blob.vercel-storage.com/RDC-PU-LOGO.png" alt="RDC Logo" style="max-width:300px; height:auto;" /></div>',
  footer: `
    <p style="color:#b0bec5; margin-top: 30px;">Best Regards,</p>
    <p style="color:#b0bec5;">Research & Development Cell Team,</p>
    <p style="color:#b0bec5;">Parul University</p>
    <hr style="border-top: 1px solid #4f5b62; margin-top: 20px;">
    <p style="font-size:10px; color:#999999; text-align:center; margin-top:10px;">
        This is a system generated automatic email. If you feel this is an error, please report at the earliest.
    </p>`,
}

export async function getProjectSummary(input: SummarizeProjectInput) {
  try {
    const result = await summarizeProject(input)
    return { success: true, summary: result.summary }
  } catch (error) {
    console.error("Error summarizing project:", error)
    return { success: false, error: "Failed to generate summary." }
  }
}

export async function getEvaluationPrompts(input: EvaluationPromptsInput) {
  try {
    const result = await generateEvaluationPrompts(input)
    return { success: true, prompts: result }
  } catch (error) {
    console.error("Error generating evaluation prompts:", error)
    return { success: false, error: "Failed to generate prompts." }
  }
}

export async function getResearchDomain(input: ResearchDomainInput) {
  try {
    const result = await getResearchDomainSuggestion(input)
    return { success: true, domain: result.domain }
  } catch (error) {
    console.error("Error getting research domain:", error)
    return { success: false, error: "Failed to get research domain." }
  }
}

export async function getJournalWebsite(input: JournalWebsiteInput) {
  try {
    const result = await findJournalWebsite(input)
    return { success: true, url: result.websiteUrl }
  } catch (error) {
    console.error("Error finding journal website:", error)
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
          PU Research Portal
        </a>.
      </p>
      ${EMAIL_STYLES.footer}
    </div>`

    if (project.pi_email) {
      await sendEmail({
        to: project.pi_email,
        subject: `Project Status Update: ${project.title}`,
        html: emailHtml,
        from: "default",
      })
    }

    return { success: true }
  } catch (error: any) {
    console.error("Error updating project status:", error)
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
      await sendEmail({
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
                    PU Research Portal
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
    return { success: false, error: error.message || "Failed to update status." }
  }
}

export async function scheduleMeeting(
  projectsToSchedule: { id: string; pi_uid: string; title: string; pi_email?: string }[],
  meetingDetails: { date: string; time: string; venue: string; evaluatorUids: string[] },
) {
  try {
    const batch = adminDb.batch()
    // The date is now 'yyyy-MM-dd', parse it safely.
    // Using replace is a safe way to ensure it's parsed as local time, avoiding timezone-off-by-one errors.
    const dateForFormatting = new Date(meetingDetails.date.replace(/-/g, "/"))
    const formattedDate = format(dateForFormatting, "MMMM d, yyyy")

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
        await sendEmail({
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
              <p><strong style="color: #ffffff;">Time:</strong> ${meetingDetails.time}</p>
              <p><strong style="color: #ffffff;">Venue:</strong> ${meetingDetails.venue}</p>
              <p style="color: #cccccc;">
                Please prepare for your presentation. You can view more details on the 
                <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/project/${projectData.id}" style="color: #64b5f6; text-decoration: underline;">
                  PU Research Portal
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
            await sendEmail({
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
                    <p><strong style="color: #ffffff;">Time:</strong> ${meetingDetails.time}</p>
                    <p><strong style="color: #ffffff;">Venue:</strong> ${meetingDetails.venue}</p>
                    <p style="color: #e0e0e0;">The following projects are scheduled for your review:</p>
                    <ul style="list-style-type: none; padding-left: 0;">
                        ${projectTitles}
                    </ul>
                    <p style="color: #cccccc;">
                        You can access your evaluation queue on the
                        <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/evaluator-dashboard" style="color: #64b5f6; text-decoration: underline;">
                        PU Research Portal
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
    return { success: true }
  } catch (error: any) {
    console.error("Error scheduling meeting:", error)
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
    return { success: true }
  } catch (error: any) {
    console.error("Error notifying admins:", error)
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
    return { success: true }
  } catch (error: any) {
    console.error("Error notifying Super-admins:", error)
    return { success: false, error: error.message || "Failed to notify Super-admins." }
  }
}

export async function notifySuperAdminsOnNewUser(userName: string, role: string) {
  try {
    const superAdminUsersSnapshot = await adminDb.collection("users").where("role", "==", "Super-admin").get()
    if (superAdminUsersSnapshot.empty) {
      console.log("No Super-admin users found to notify.")
      return { success: true, message: "No Super-admins to notify." }
    }

    const batch = adminDb.batch()
    const notificationTitle = `New ${role.toUpperCase()} joined: ${userName}`

    superAdminUsersSnapshot.forEach((docSnapshot) => {
      const notificationRef = adminDb.collection("notifications").doc()
      batch.set(notificationRef, {
        uid: docSnapshot.id,
        title: notificationTitle,
        createdAt: new Date().toISOString(),
        isRead: false,
      })
    })

    await batch.commit()
    return { success: true }
  } catch (error: any) {
    console.error("Error notifying Super-admins about new user:", error)
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
    return { success: true }
  } catch (error: any) {
    console.error("Error notifying admins on completion request:", error)
    return { success: false, error: error.message || "Failed to notify admins." }
  }
}

export async function checkMisIdExists(misId: string, currentUid: string): Promise<{ exists: boolean }> {
  try {
    const usersRef = adminDb.collection("users")
    const q = usersRef.where("misId", "==", misId).limit(1)
    const querySnapshot = await q.get()

    if (querySnapshot.empty) {
      return { exists: false }
    }

    const foundUserDoc = querySnapshot.docs[0]
    if (foundUserDoc.id === currentUid) {
      // The only user with this MIS ID is the current user. This can happen if they are re-saving their profile.
      return { exists: false }
    }

    // A different user has this MIS ID.
    return { exists: true }
  } catch (error: any) {
    console.error("Error checking MIS ID uniqueness:", error)
    // Rethrow to let the client know something went wrong with the check.
    throw new Error("Failed to verify MIS ID due to a server error. Please try again.")
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

export async function bulkUploadProjects(
  projectsData: any[],
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const batch = adminDb.batch()
    const usersRef = adminDb.collection("users")
    let projectCount = 0

    for (const project of projectsData) {
      // Basic validation
      if (
        !project.pi_email ||
        !project.project_title ||
        !project.status ||
        !project.sanction_number ||
        !project.Name_of_staff ||
        !project.Faculty ||
        !project.Institute
      ) {
        console.warn("Skipping incomplete project record:", project)
        continue
      }

      let pi_uid = ""
      let pi_name = project.Name_of_staff
      let faculty = project.Faculty
      let institute = project.Institute
      let departmentName = project.Department
      let campus = project.Campus || ""

      // Find user by email to get UID and profile data
      const userQuery = await usersRef.where("email", "==", project.pi_email).limit(1).get()
      if (!userQuery.empty) {
        const userDoc = userQuery.docs[0]
        const userData = userDoc.data()
        pi_uid = userDoc.id
        pi_name = userData.name || pi_name
        faculty = userData.faculty || faculty
        institute = userData.institute || institute
        departmentName = userData.department || departmentName
        campus = userData.campus || campus
      }

      const projectRef = adminDb.collection("projects").doc()

      let submissionDate
      if (project.sanction_date) {
        if (project.sanction_date instanceof Date) {
          submissionDate = project.sanction_date.toISOString()
        } else if (typeof project.sanction_date === "number") {
          // Handle Excel serial date format
          submissionDate = excelDateToJSDate(project.sanction_date).toISOString()
        } else if (typeof project.sanction_date === "string") {
          // Attempt to parse various string formats
          const parsedDate = new Date(project.sanction_date.replace(/(\d{2})-(\d{2})-(\d{4})/, "$3-$2-$1"))
          if (!isNaN(parsedDate.getTime())) {
            submissionDate = parsedDate.toISOString()
          } else {
            submissionDate = new Date().toISOString() // Fallback
          }
        } else {
          submissionDate = new Date().toISOString() // Fallback
        }
      } else {
        submissionDate = new Date().toISOString() // Fallback
      }

      const newProjectData: Partial<Project> = {
        title: project.project_title,
        pi_email: project.pi_email,
        status: project.status,
        pi_uid: pi_uid,
        pi: pi_name,
        abstract: "Historical data migrated from bulk upload.",
        type: "Research", // Default type
        faculty: faculty,
        institute: institute,
        departmentName: departmentName,
        teamInfo: "Historical data, team info not available.",
        timelineAndOutcomes: "Historical data, outcomes not available.",
        submissionDate: submissionDate,
        isBulkUploaded: true,
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
        const grant: GrantDetails = {
          totalAmount: project.grant_amount,
          status: "Awarded",
          sanctionNumber: project.sanction_number || "",
          phases: [firstPhase],
        }
        newProjectData.grant = grant
      }

      batch.set(projectRef, newProjectData as Project)
      projectCount++
    }

    await batch.commit()
    return { success: true, count: projectCount }
  } catch (error: any) {
    console.error("Error during bulk upload:", error)
    return { success: false, count: 0, error: error.message || "Failed to upload projects." }
  }
}

export async function deleteBulkProject(projectId: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!projectId) {
      return { success: false, error: "Project ID is required." }
    }
    const projectRef = adminDb.collection("projects").doc(projectId)
    await projectRef.delete()
    return { success: true }
  } catch (error: any) {
    console.error("Error deleting project:", error)
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
    return { success: false, error: error.message || "An unexpected error occurred while fetching ORCID data." }
  }
}

export async function exportClaimToExcel(
  claimId: string,
): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const claimRef = adminDb.collection("incentiveClaims").doc(claimId)
    const claimSnap = await claimRef.get()
    if (!claimSnap.exists) {
      return { success: false, error: "Claim not found." }
    }
    const claim = claimSnap.data() as IncentiveClaim

    // Fetch user data for designation and department
    let user: User | null = null
    if (claim.uid) {
      const userRef = adminDb.collection("users").doc(claim.uid)
      const userSnap = await userRef.get()
      if (userSnap.exists) {
        user = userSnap.data() as User
      }
    }

    const templatePath = path.join(process.cwd(), "format.xlsx")
    if (!fs.existsSync(templatePath)) {
      return { success: false, error: 'Template file "format.xlsx" not found in the project root directory.' }
    }
    const templateBuffer = fs.readFileSync(templatePath)
    // Add sheetStubs to create cell objects for empty but styled cells.
    const workbook = XLSX.read(templateBuffer, { type: "buffer", cellStyles: true, sheetStubs: true })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]

    const getClaimTitle = (claim: IncentiveClaim): string => {
      return (
        claim.paperTitle ||
        claim.patentTitle ||
        claim.conferencePaperTitle ||
        claim.publicationTitle ||
        claim.professionalBodyName ||
        claim.apcPaperTitle ||
        "N/A"
      )
    }

    const claimTitle = getClaimTitle(claim)
    const submissionDate = claim.submissionDate ? new Date(claim.submissionDate).toLocaleDateString() : "N/A"

    const dataMap: { [key: string]: any } = {
      B2: claim.userName,
      B3: user?.designation || "N/A",
      B4: user?.department || "N/A",
      B5: claimTitle,
      D11: submissionDate,
    }

    for (const cellAddress in dataMap) {
      if (Object.prototype.hasOwnProperty.call(dataMap, cellAddress)) {
        const value = dataMap[cellAddress]
        if (value !== undefined && value !== null) {
          if (worksheet[cellAddress]) {
            // Cell exists (even if it was empty and just styled, thanks to sheetStubs).
            // Update its value and set type to string.
            worksheet[cellAddress].v = value
            worksheet[cellAddress].t = "s"
          } else {
            // Fallback for cells that don't exist at all in the template.
            XLSX.utils.sheet_add_aoa(worksheet, [[value]], { origin: cellAddress })
          }
        }
      }
    }

    // Explicitly tell the writer to use cell styles from the workbook object
    const outputBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "base64", cellStyles: true })

    return { success: true, fileData: outputBuffer }
  } catch (error: any) {
    console.error("Error exporting claim to Excel:", error)
    return { success: false, error: error.message || "Failed to export data." }
  }
}

export async function linkHistoricalData(
  userData: Partial<User> & { uid: string; email: string },
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const { uid, email, institute, department, phoneNumber, campus } = userData
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
      if (campus) updateData.campus = campus

      batch.update(projectDoc.ref, updateData)
    })

    await batch.commit()

    console.log(`Linked and updated ${projectsSnapshot.size} historical projects for user ${email} (UID: ${uid})`)
    return { success: true, count: projectsSnapshot.size }
  } catch (error: any) {
    console.error("Error linking historical project data:", error)
    return { success: false, count: 0, error: error.message || "Failed to link historical data." }
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

    return { success: true }
  } catch (error: any) {
    console.error("Error submitting project revision:", error)
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
    return { success: true }
  } catch (error: any) {
    console.error("Error updating project duration:", error)
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
    return { success: true }
  } catch (error: any) {
    console.error("Error updating project evaluators:", error)
    return { success: false, error: "Failed to update project evaluators." }
  }
}

export async function findUserByMisId(
  misId: string,
): Promise<{ success: boolean; user?: { uid: string; name: string }; error?: string }> {
  try {
    if (!misId || misId.trim() === "") {
      return { success: false, error: "MIS ID is required." }
    }
    const usersRef = adminDb.collection("users")
    const q = usersRef.where("misId", "==", misId).limit(1)
    const querySnapshot = await q.get()

    if (querySnapshot.empty) {
      return { success: false, error: "No user found with this MIS ID." }
    }

    const userDoc = querySnapshot.docs[0]
    const userData = userDoc.data()

    // Prevent adding admins as Co-PIs
    if (userData.role === "admin" || userData.role === "Super-admin") {
      return { success: false, error: "Administrative users cannot be added as Co-PIs." }
    }

    return { success: true, user: { uid: userDoc.id, name: userData.name } }
  } catch (error: any) {
    console.error("Error finding user by MIS ID:", error)
    return { success: false, error: error.message || "Failed to search for user." }
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

    const updatedProject = { ...project, grant: updatedGrant }
    return { success: true, updatedProject }
  } catch (error: any) {
    console.error("Error adding grant phase:", error)
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
    invoiceFile?: File
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

    const updatedProject = { ...project, grant: updatedGrant }
    return { success: true, updatedProject }
  } catch (error: any) {
    console.error("Error adding transaction:", error)
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

    const updatedPhases = project.grant.phases.map((phase) => {
      if (phase.id === phaseId) {
        const updatedPhase: GrantPhase = { ...phase, status: newStatus }
        if (newStatus === "Disbursed" && !phase.disbursementDate) {
          updatedPhase.disbursementDate = new Date().toISOString()
        }
        return updatedPhase
      }
      return phase
    })

    const updatedGrant = { ...project.grant, phases: updatedPhases }
    await projectRef.update({ grant: updatedGrant })

    const updatedProject = { ...project, grant: updatedGrant }
    return { success: true, updatedProject }
  } catch (error: any) {
    console.error("Error updating phase status:", error)
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
      const usersQuery = usersRef.where(FieldValue.documentId(), "in", newCoPis)
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
              <p style="color:#e0e0e0;">You can view the project details on the PU Research Portal.</p>
              ${EMAIL_STYLES.footer}
            </div>`
          await sendEmail({
            to: coPi.email,
            subject: `You've been added to an IMR Project`,
            html: emailHtml,
            from: "default",
          })
        }
      }
      await batch.commit()
    }

    return { success: true }
  } catch (error: any) {
    console.error("Error updating Co-PIs:", error)
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
    return { success: true }
  } catch (error: any) {
    console.error("Error updating tutorial status:", error)
    return { success: false, error: "Failed to update tutorial status." }
  }
}

export async function registerEmrInterest(
  callId: string,
  user: User,
  coPis?: { uid: string; name: string }[],
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!user || !user.uid || !user.faculty || !user.department) {
      return {
        success: false,
        error: "User profile is incomplete. Please update your faculty and department in Settings.",
      }
    }

    // Check if interest already registered
    const interestsRef = adminDb.collection("emrInterests")
    const q = interestsRef.where("callId", "==", callId).where("userId", "==", user.uid)
    const docSnap = await q.get()
    if (!docSnap.empty) {
      return { success: false, error: "You have already registered your interest for this call." }
    }

    // Use a transaction to get the next sequential ID
    const newInterest = await getFirestore().runTransaction(async (transaction) => {
      const counterRef = adminDb.collection("counters").doc("emrInterest")
      const counterDoc = await transaction.get(counterRef)

      let newCount = 1
      if (counterDoc.exists) {
        newCount = counterDoc.data()!.current + 1
      }
      transaction.set(counterRef, { current: newCount }, { merge: true })

      const interestId = `RDC/EMR/INTEREST/${String(newCount).padStart(5, "0")}`

      const newInterestDoc: Omit<EmrInterest, "id"> = {
        interestId: interestId,
        callId: callId,
        userId: user.uid,
        userName: user.name,
        userEmail: user.email,
        faculty: user.faculty!,
        department: user.department!,
        registeredAt: new Date().toISOString(),
        status: "Registered",
      }

      if (coPis && coPis.length > 0) {
        newInterestDoc.coPiUids = coPis.map((p) => p.uid)
        newInterestDoc.coPiNames = coPis.map((p) => p.name)
      }

      const interestRef = adminDb.collection("emrInterests").doc()
      transaction.set(interestRef, newInterestDoc)
      return { id: interestRef.id, ...newInterestDoc }
    })

    // Notify Co-PIs
    if (coPis && coPis.length > 0) {
      const callSnap = await adminDb.collection("fundingCalls").doc(callId).get()
      const callTitle = callSnap.exists() ? (callSnap.data() as FundingCall).title : "an EMR call"

      const usersRef = adminDb.collection("users")
      const usersQuery = usersRef.where(
        FieldValue.documentId(),
        "in",
        coPis.map((p) => p.uid),
      )
      const coPiDocs = await usersQuery.get()
      const batch = adminDb.batch()

      for (const userDoc of coPiDocs.docs) {
        const coPi = userDoc.data() as User
        const notificationRef = adminDb.collection("notifications").doc()
        batch.set(notificationRef, {
          uid: coPi.uid,
          title: `You've been added as a Co-PI for the EMR call: "${callTitle}"`,
          createdAt: new Date().toISOString(),
          isRead: false,
        })

        if (coPi.email) {
          await sendEmail({
            to: coPi.email,
            subject: `You've been added to an EMR Application `,
            html: `
                        <div ${EMAIL_STYLES.background}>
                            ${EMAIL_STYLES.logo}
                            <p style="color:#ffffff;">Dear ${coPi.name},</p>
                            <p style="color:#e0e0e0;">You have been added as a Co-PI by ${user.name} for the EMR funding opportunity titled "<strong style="color:#ffffff;">${callTitle}</strong>".</p>
                             ${EMAIL_STYLES.footer}
                        </div>`,
            from: "default",
          })
        }
      }
      await batch.commit()
    }

    return { success: true }
  } catch (error: any) {
    console.error("Error registering EMR interest:", error)
    return { success: false, error: error.message || "Failed to register interest." }
  }
}

export async function scheduleEmrMeeting(
  callId: string,
  meetingDetails: { date: string; time: string; venue: string; evaluatorUids: string[] },
  applicantUids: string[],
) {
  try {
    const { date, time, venue, evaluatorUids } = meetingDetails

    if (!evaluatorUids || evaluatorUids.length === 0) {
      return { success: false, error: "An evaluation committee must be assigned." }
    }

    const callRef = adminDb.collection("fundingCalls").doc(callId)
    const callSnap = await callRef.get()
    if (!callSnap.exists) {
      return { success: false, error: "Funding call not found." }
    }
    const call = callSnap.data() as FundingCall

    const batch = adminDb.batch()
    const emailPromises = []

    const meetingTime = parse(time, "HH:mm", parseISO(date))

    // Update meeting details on the call document itself
    batch.update(callRef, {
      status: "Meeting Scheduled",
      meetingDetails: { date, venue, assignedEvaluators: evaluatorUids },
    })

    for (const userId of applicantUids) {
      // Find the interest document for this user and call
      const interestsRef = adminDb.collection("emrInterests")
      const q = interestsRef.where("callId", "==", callId).where("userId", "==", userId)
      const interestSnapshot = await q.get()

      if (interestSnapshot.empty) continue

      const interestDoc = interestSnapshot.docs[0]
      const interestRef = interestDoc.ref
      const interest = interestDoc.data() as EmrInterest

      batch.update(interestRef, {
        meetingSlot: { date, time },
        status: "Evaluation Pending",
      })

      const notificationRef = adminDb.collection("notifications").doc()
      batch.set(notificationRef, {
        uid: interest.userId,
        title: `Your EMR Presentation for "${call.title}" has been scheduled.`,
        createdAt: new Date().toISOString(),
        isRead: false,
      })

      const emailHtml = `
          <div ${EMAIL_STYLES.background}>
              ${EMAIL_STYLES.logo}
              <p style="color: #ffffff;">Dear ${interest.userName},</p>
              <p style="color: #e0e0e0;">
                  A presentation slot has been scheduled for you for the EMR funding opportunity, "<strong style="color: #ffffff;">${call.title}</strong>".
              </p>
              <p><strong style="color: #ffffff;">Date:</strong> ${format(meetingTime, "MMMM d, yyyy")}</p>
              <p><strong style="color: #ffffff;">Time:</strong> ${format(meetingTime, "h:mm a")}</p>
              <p><strong style="color: #ffffff;">Venue:</strong> ${venue}</p>
              <p style="color: #cccccc;">Please prepare for your presentation.</p>
              ${EMAIL_STYLES.footer}
          </div>
      `

      if (interest.userEmail) {
        emailPromises.push(
          sendEmail({
            to: interest.userEmail,
            subject: `Your EMR Presentation Slot for: ${call.title}`,
            html: emailHtml,
            from: "default",
          }),
        )
      }
    }

    // Notify evaluators once
    if (evaluatorUids && evaluatorUids.length > 0) {
      const evaluatorDocs = await Promise.all(evaluatorUids.map((uid) => adminDb.collection("users").doc(uid).get()))

      for (const evaluatorDoc of evaluatorDocs) {
        if (evaluatorDoc.exists) {
          const evaluator = evaluatorDoc.data() as User

          const evaluatorNotificationRef = adminDb.collection("notifications").doc()
          batch.set(evaluatorNotificationRef, {
            uid: evaluator.uid,
            title: `You've been assigned to an EMR evaluation meeting for "${call.title}"`,
            createdAt: new Date().toISOString(),
            isRead: false,
          })

          if (evaluator.email) {
            emailPromises.push(
              sendEmail({
                to: evaluator.email,
                subject: `EMR Evaluation Assignment: ${call.title}`,
                html: `
                <div ${EMAIL_STYLES.background}>
                    ${EMAIL_STYLES.logo}
                    <p style="color: #ffffff;">Dear Evaluator,</p>
                    <p style="color: #e0e0e0;">You have been assigned to an EMR evaluation committee.</p>
                    <p><strong style="color: #ffffff;">Date:</strong> ${format(parseISO(date), "MMMM d, yyyy")}</p>
                     <p><strong style="color: #ffffff;">Time:</strong> ${format(meetingTime, "h:mm a")}</p>
                    <p><strong style="color: #ffffff;">Venue:</strong> ${venue}</p>
                    <p style="color: #cccccc;">Please review the assigned presentations on the PU Research Portal.</p>
                    ${EMAIL_STYLES.footer}
                </div>
              `,
                from: "default",
              }),
            )
          }
        }
      }
    }

    await batch.commit()
    await Promise.all(emailPromises)

    return { success: true }
  } catch (error: any) {
    console.error("Error scheduling EMR meeting:", error)
    return { success: false, error: error.message || "Failed to schedule EMR meeting." }
  }
}

export async function uploadEmrPpt(
  interestId: string,
  pptDataUrl: string,
  originalFileName: string,
  userName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!interestId || !pptDataUrl) {
      return { success: false, error: "Interest ID and file data are required." }
    }

    const interestRef = adminDb.collection("emrInterests").doc(interestId)
    const interestSnap = await interestRef.get()
    if (!interestSnap.exists) {
      return { success: false, error: "Interest registration not found." }
    }
    const interest = interestSnap.data() as EmrInterest

    // Standardize the filename
    const fileExtension = path.extname(originalFileName)
    const standardizedName = `emr_${userName.replace(/\s+/g, "_")}${fileExtension}`

    const filePath = `emr-presentations/${interest.callId}/${interest.userId}/${standardizedName}`
    const result = await uploadFileToServer(pptDataUrl, filePath)

    if (!result.success || !result.url) {
      throw new Error(result.error || "PPT upload failed.")
    }

    await interestRef.update({
      pptUrl: result.url,
      pptSubmissionDate: new Date().toISOString(),
      status: "PPT Submitted",
    })

    return { success: true }
  } catch (error: any) {
    console.error("Error uploading EMR presentation:", error)
    return { success: false, error: error.message || "Failed to upload presentation." }
  }
}

export async function removeEmrPpt(interestId: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!interestId) {
      return { success: false, error: "Interest ID is required." }
    }

    const interestRef = adminDb.collection("emrInterests").doc(interestId)
    const interestSnap = await interestRef.get()
    if (!interestSnap.exists) {
      return { success: false, error: "Interest registration not found." }
    }
    const interest = interestSnap.data() as EmrInterest

    if (interest.pptUrl) {
      const bucket = adminStorage.bucket()
      const url = new URL(interest.pptUrl)
      const filePath = decodeURIComponent(url.pathname.substring(url.pathname.indexOf("/o/") + 3))

      try {
        await bucket.file(filePath).delete()
        console.log(`Deleted file from Storage: ${filePath}`)
      } catch (storageError: any) {
        // If the file doesn't exist, we can ignore the error and proceed.
        if (storageError.code !== 404) {
          throw storageError
        }
        console.warn(`Storage file not found during deletion, but proceeding: ${filePath}`)
      }
    }

    await interestRef.update({
      pptUrl: FieldValue.delete(),
      pptSubmissionDate: FieldValue.delete(),
    })

    return { success: true }
  } catch (error: any) {
    console.error("Error removing EMR presentation:", error)
    return { success: false, error: error.message || "Failed to remove presentation." }
  }
}

export async function withdrawEmrInterest(interestId: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!interestId) {
      return { success: false, error: "Interest ID is required." }
    }

    const interestRef = adminDb.collection("emrInterests").doc(interestId)
    const interestSnap = await interestRef.get()

    if (!interestSnap.exists) {
      return { success: false, error: "Interest registration not found." }
    }
    const interest = interestSnap.data() as EmrInterest

    // If a presentation was uploaded, delete it from storage first.
    if (interest.pptUrl) {
      await removeEmrPpt(interest.id)
    }

    // Delete the interest document from Firestore.
    await interestRef.delete()

    return { success: true }
  } catch (error: any) {
    console.error("Error withdrawing EMR interest:", error)
    return { success: false, error: error.message || "Failed to withdraw interest." }
  }
}

export async function deleteEmrInterest(
  interestId: string,
  remarks: string,
  adminName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!interestId) return { success: false, error: "Interest ID is required." }

    const interestRef = adminDb.collection("emrInterests").doc(interestId)
    const interestSnap = await interestRef.get()
    if (!interestSnap.exists) return { success: false, error: "Interest registration not found." }

    const interest = interestSnap.data() as EmrInterest
    const callRef = adminDb.collection("fundingCalls").doc(interest.callId)
    const callSnap = await callRef.get()
    const callTitle = callSnap.exists ? (callSnap.data() as FundingCall).title : "an EMR call"

    // Withdraw interest to also handle file deletion
    await withdrawEmrInterest(interestId)

    // Notify the user
    const notification = {
      uid: interest.userId,
      title: `Your EMR registration for "${callTitle}" was removed.`,
      createdAt: new Date().toISOString(),
      isRead: false,
    }
    await adminDb.collection("notifications").add(notification)

    if (interest.userEmail) {
      await sendEmail({
        to: interest.userEmail,
        subject: `Update on your EMR Interest for: ${callTitle}`,
        html: `
                    <div ${EMAIL_STYLES.background}>
                        ${EMAIL_STYLES.logo}
                        <p style="color:#ffffff;">Dear ${interest.userName},</p>
                        <p style="color:#e0e0e0;">Your registration of interest for the EMR funding call, "<strong style="color:#ffffff;">${callTitle}</strong>," has been removed by the administration.</p>
                        <div style="margin-top: 20px; padding: 15px; border: 1px solid #4f5b62; border-radius: 6px; background-color:#2c3e50;">
                            <h4 style="color:#ffffff; margin-top: 0;">Remarks from ${adminName}:</h4>
                            <p style="color:#e0e0e0;">${remarks}</p>
                        </div>
                        <p style="color:#e0e0e0;">If you have any questions, please contact the RDC helpdesk.</p>
                        ${EMAIL_STYLES.footer}
                    </div>
                `,
        from: "default",
      })
    }

    return { success: true }
  } catch (error: any) {
    console.error("Error deleting EMR interest:", error)
    return { success: false, error: error.message || "Failed to delete interest." }
  }
}

export async function addEmrEvaluation(
  interestId: string,
  evaluator: User,
  evaluationData: { recommendation: EmrEvaluation["recommendation"]; comments: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const evaluationRef = adminDb
      .collection("emrInterests")
      .doc(interestId)
      .collection("evaluations")
      .doc(evaluator.uid)

    const newEvaluation: EmrEvaluation = {
      evaluatorUid: evaluator.uid,
      evaluatorName: evaluator.name,
      evaluationDate: new Date().toISOString(),
      ...evaluationData,
    }

    await evaluationRef.set(newEvaluation, { merge: true })

    // Notify Super Admins
    const interestSnap = await adminDb.collection("emrInterests").doc(interestId).get()
    if (interestSnap.exists) {
      const interest = interestSnap.data() as EmrInterest
      const superAdminUsersSnapshot = await adminDb.collection("users").where("role", "==", "Super-admin").get()
      if (!superAdminUsersSnapshot.empty) {
        const batch = adminDb.batch()
        const notificationTitle = `EMR evaluation submitted for ${interest.userName} by ${evaluator.name}`
        superAdminUsersSnapshot.forEach((userDoc) => {
          const notificationRef = adminDb.collection("notifications").doc()
          batch.set(notificationRef, {
            uid: userDoc.id,
            title: notificationTitle,
            createdAt: new Date().toISOString(),
            isRead: false,
          })
        })
        await batch.commit()
      }
    }

    return { success: true }
  } catch (error: any) {
    console.error("Error adding EMR evaluation:", error)
    return { success: false, error: error.message || "Failed to submit evaluation." }
  }
}

export async function createFundingCall(
  callData: z.infer<any>, // Using any because the zod schema is on the client
): Promise<{ success: boolean; error?: string }> {
  try {
    const newCallDocRef = adminDb.collection("fundingCalls").doc()
    const attachments: { name: string; url: string }[] = []

    if (callData.attachments && callData.attachments.length > 0) {
      for (let i = 0; i < callData.attachments.length; i++) {
        const file = callData.attachments[i]
        const dataUrl = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`
        const path = `emr-attachments/${newCallDocRef.id}/${file.name}`
        const result = await uploadFileToServer(dataUrl, path)
        if (result.success && result.url) {
          attachments.push({ name: file.name, url: result.url })
        } else {
          throw new Error(`Failed to upload attachment: ${file.name}`)
        }
      }
    }

    // Transaction to generate a new sequential ID
    const newCallData = await getFirestore().runTransaction(async (transaction) => {
      const counterRef = adminDb.collection("counters").doc("emrCall")
      const counterDoc = await transaction.get(counterRef)

      let newCount = 1
      if (counterDoc.exists) {
        newCount = counterDoc.data()!.current + 1
      }
      transaction.set(counterRef, { current: newCount }, { merge: true })

      const callIdentifier = `RDC/EMR/CALL/${String(newCount).padStart(5, "0")}`

      const newCall: Omit<FundingCall, "id"> = {
        callIdentifier: callIdentifier,
        title: callData.title,
        agency: callData.agency,
        description: callData.description,
        callType: callData.callType,
        applyDeadline: callData.applyDeadline.toISOString(),
        interestDeadline: callData.interestDeadline.toISOString(),
        detailsUrl: callData.detailsUrl,
        attachments: attachments,
        createdAt: new Date().toISOString(),
        createdBy: "Super-admin",
        status: "Open",
        isAnnounced: callData.notifyAllStaff,
      }

      transaction.set(newCallDocRef, newCall)
      return { id: newCallDocRef.id, ...newCall }
    })

    if (callData.notifyAllStaff) {
      await announceEmrCall(newCallData.id)
    }

    return { success: true }
  } catch (error: any) {
    console.error("Error creating funding call:", error)
    return { success: false, error: error.message || "Failed to create funding call." }
  }
}

export async function announceEmrCall(callId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const allStaffEmail = process.env.ALL_STAFF_EMAIL
    if (!allStaffEmail) {
      return {
        success: false,
        error: "The 'All Staff' email address is not configured on the server. Please add it to the .env file.",
      }
    }

    const callRef = adminDb.collection("fundingCalls").doc(callId)
    const callSnap = await callRef.get()

    if (!callSnap.exists) {
      return { success: false, error: "Funding call not found." }
    }
    const call = callSnap.data() as FundingCall

    const emailAttachments = (call.attachments || []).map((att) => ({ filename: att.name, path: att.url }))

    const emailHtml = `
      <div ${EMAIL_STYLES.background}>
        ${EMAIL_STYLES.logo}
        <h2 style="color: #ffffff; text-align: center;">New Funding Opportunity: ${call.title}</h2>
        <p style="color:#e0e0e0;">A new funding call from <strong style="color:#ffffff;">${call.agency}</strong> has been posted on the PU Research Portal.</p>
        <div style="padding: 15px; border: 1px solid #4f5b62; border-radius: 8px; margin-top: 20px; background-color:#2c3e50;">
          <div style="color:#e0e0e0;" class="prose prose-sm">${call.description || "No description provided."}</div>
          <p style="color:#e0e0e0;"><strong>Register Interest By:</strong> ${format(parseISO(call.interestDeadline), "PPp")}</p>
          <p style="color:#e0e0e0;"><strong>Agency Deadline:</strong> ${format(parseISO(call.applyDeadline), "PP")}</p>
        </div>
        <p style="color:#e0e0e0; margin-top: 20px;">Please find the relevant documents attached to this email.</p>
        <p style="margin-top: 20px; text-align: center;">
          <a href="${call.detailsUrl || process.env.NEXT_PUBLIC_BASE_URL + "/dashboard/emr-calendar"}" style="background-color: #64B5F6; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">
            View Full Details on the Portal
          </a>
        </p>
        ${EMAIL_STYLES.footer}
      </div>
    `

    await sendEmail({
      to: allStaffEmail,
      subject: `New Funding Opportunity: ${call.title}`,
      html: emailHtml,
      attachments: emailAttachments,
      from: "default",
    })

    await callRef.update({ isAnnounced: true })

    return { success: true }
  } catch (error: any) {
    console.error("Error announcing EMR call:", error)
    return { success: false, error: error.message || "Failed to announce funding call." }
  }
}

export async function saveSidebarOrder(uid: string, order: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    if (!uid || !Array.isArray(order)) {
      return { success: false, error: "Invalid user ID or order provided." }
    }
    const userRef = adminDb.collection("users").doc(uid)
    await userRef.update({ sidebarOrder: order })
    return { success: true }
  } catch (error: any) {
    console.error("Error saving sidebar order:", error)
    return { success: false, error: error.message || "Failed to save sidebar order." }
  }
}

export async function sendMeetingReminders(): Promise<{ success: boolean; error?: string }> {
  try {
    const tomorrow = addDays(new Date(), 1)
    const tomorrowDateString = format(tomorrow, "yyyy-MM-dd")

    // Find IMR projects with meetings tomorrow
    const imrProjectsSnapshot = await adminDb
      .collection("projects")
      .where("meetingDetails.date", "==", tomorrowDateString)
      .get()

    // Find EMR interests with meetings tomorrow
    const emrInterestsSnapshot = await adminDb
      .collection("emrInterests")
      .where("meetingSlot.date", "==", tomorrowDateString)
      .get()

    const emailPromises = []

    // Process IMR projects
    for (const projectDoc of imrProjectsSnapshot.docs) {
      const project = projectDoc.data() as Project
      if (project.pi_email && project.meetingDetails) {
        const meetingDateTime = setHours(setMinutes(setSeconds(tomorrow, 0), 0), 0)
        const [hours, minutes] = project.meetingDetails.time.split(":").map(Number)
        const finalMeetingTime = setHours(setMinutes(meetingDateTime, minutes), hours)

        const emailHtml = `
          <div ${EMAIL_STYLES.background}>
            ${EMAIL_STYLES.logo}
            <p style="color:#ffffff;">Dear ${project.pi},</p>
            <p style="color:#e0e0e0;">This is a reminder that your IMR evaluation meeting for the project "<strong style="color:#ffffff;">${project.title}</strong>" is scheduled for tomorrow.</p>
            <p><strong style="color:#ffffff;">Date:</strong> ${format(finalMeetingTime, "MMMM d, yyyy")}</p>
            <p><strong style="color:#ffffff;">Time:</strong> ${format(finalMeetingTime, "h:mm a")}</p>
            <p><strong style="color:#ffffff;">Venue:</strong> ${project.meetingDetails.venue}</p>
            <p style="color:#e0e0e0;">Please ensure you are prepared for your presentation.</p>
            ${EMAIL_STYLES.footer}
          </div>
        `

        emailPromises.push(
          sendEmail({
            to: project.pi_email,
            subject: `Reminder: IMR Meeting Tomorrow for ${project.title}`,
            html: emailHtml,
            from: "default",
          }),
        )
      }
    }

    // Process EMR interests
    for (const interestDoc of emrInterestsSnapshot.docs) {
      const interest = interestDoc.data() as EmrInterest
      if (interest.userEmail && interest.meetingSlot) {
        const meetingDateTime = setHours(setMinutes(setSeconds(tomorrow, 0), 0), 0)
        const [hours, minutes] = interest.meetingSlot.time.split(":").map(Number)
        const finalMeetingTime = setHours(setMinutes(meetingDateTime, minutes), hours)

        // Get call details
        const callSnap = await adminDb.collection("fundingCalls").doc(interest.callId).get()
        const callTitle = callSnap.exists ? (callSnap.data() as FundingCall).title : "EMR Call"

        const emailHtml = `
          <div ${EMAIL_STYLES.background}>
            ${EMAIL_STYLES.logo}
            <p style="color:#ffffff;">Dear ${interest.userName},</p>
            <p style="color:#e0e0e0;">This is a reminder that your EMR presentation for "<strong style="color:#ffffff;">${callTitle}</strong>" is scheduled for tomorrow.</p>
            <p><strong style="color:#ffffff;">Date:</strong> ${format(finalMeetingTime, "MMMM d, yyyy")}</p>
            <p><strong style="color:#ffffff;">Time:</strong> ${format(finalMeetingTime, "h:mm a")}</p>
            <p style="color:#e0e0e0;">Please ensure you are prepared for your presentation.</p>
            ${EMAIL_STYLES.footer}
          </div>
        `

        emailPromises.push(
          sendEmail({
            to: interest.userEmail,
            subject: `Reminder: EMR Presentation Tomorrow for ${callTitle}`,
            html: emailHtml,
            from: "default",
          }),
        )
      }
    }

    await Promise.all(emailPromises)

    console.log(`Sent ${emailPromises.length} meeting reminder emails for ${tomorrowDateString}`)
    return { success: true }
  } catch (error: any) {
    console.error("Error sending meeting reminders:", error)
    return { success: false, error: error.message || "Failed to send meeting reminders." }
  }
}

export async function uploadEndorsementForm(
  interestId: string,
  endorsementDataUrl: string,
  originalFileName: string,
  userName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!interestId || !endorsementDataUrl) {
      return { success: false, error: "Interest ID and file data are required." }
    }

    const interestRef = adminDb.collection("emrInterests").doc(interestId)
    const interestSnap = await interestRef.get()
    if (!interestSnap.exists) {
      return { success: false, error: "Interest registration not found." }
    }
    const interest = interestSnap.data() as EmrInterest

    // Standardize the filename
    const fileExtension = path.extname(originalFileName)
    const standardizedName = `endorsement_${userName.replace(/\s+/g, "_")}${fileExtension}`

    const filePath = `emr-endorsements/${interest.callId}/${interest.userId}/${standardizedName}`
    const result = await uploadFileToServer(endorsementDataUrl, filePath)

    if (!result.success || !result.url) {
      throw new Error(result.error || "Endorsement form upload failed.")
    }

    await interestRef.update({
      endorsementFormUrl: result.url,
      endorsementSubmissionDate: new Date().toISOString(),
    })

    return { success: true }
  } catch (error: any) {
    console.error("Error uploading endorsement form:", error)
    return { success: false, error: error.message || "Failed to upload endorsement form." }
  }
}

export async function submitToAgency(
  interestId: string,
  submissionData: {
    agencySubmissionUrl?: string
    agencySubmissionDate: string
    submissionNotes?: string
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!interestId) {
      return { success: false, error: "Interest ID is required." }
    }

    const interestRef = adminDb.collection("emrInterests").doc(interestId)
    const interestSnap = await interestRef.get()
    if (!interestSnap.exists) {
      return { success: false, error: "Interest registration not found." }
    }
    const interest = interestSnap.data() as EmrInterest

    await interestRef.update({
      agencySubmissionUrl: submissionData.agencySubmissionUrl || "",
      agencySubmissionDate: submissionData.agencySubmissionDate,
      submissionNotes: submissionData.submissionNotes || "",
      status: "Submitted to Agency",
    })

    // Notify the user
    const callRef = adminDb.collection("fundingCalls").doc(interest.callId)
    const callSnap = await callRef.get()
    const callTitle = callSnap.exists ? (callSnap.data() as FundingCall).title : "EMR Call"

    const notification = {
      uid: interest.userId,
      title: `Your EMR application for "${callTitle}" has been submitted to the funding agency`,
      createdAt: new Date().toISOString(),
      isRead: false,
    }
    await adminDb.collection("notifications").add(notification)

    if (interest.userEmail) {
      const emailHtml = `
        <div ${EMAIL_STYLES.background}>
          ${EMAIL_STYLES.logo}
          <p style="color:#ffffff;">Dear ${interest.userName},</p>
          <p style="color:#e0e0e0;">
            Your EMR application for "<strong style="color:#ffffff;">${callTitle}</strong>" has been successfully submitted to the funding agency.
          </p>
          ${
            submissionData.agencySubmissionUrl
              ? `
            <p style="color:#e0e0e0;">
              Agency Submission URL: <a href="${submissionData.agencySubmissionUrl}" style="color:#64b5f6; text-decoration:underline;">${submissionData.agencySubmissionUrl}</a>
            </p>
          `
              : ""
          }
          ${
            submissionData.submissionNotes
              ? `
            <div style="margin-top: 20px; padding: 15px; border: 1px solid #4f5b62; border-radius: 6px; background-color:#2c3e50;">
              <h4 style="color:#ffffff; margin-top: 0;">Submission Notes:</h4>
              <p style="color:#e0e0e0;">${submissionData.submissionNotes}</p>
            </div>
          `
              : ""
          }
          <p style="color:#e0e0e0;">You will be notified of any updates regarding your application status.</p>
          ${EMAIL_STYLES.footer}
        </div>
      `
      await sendEmail({
        to: interest.userEmail,
        subject: `EMR Application Submitted: ${callTitle}`,
        html: emailHtml,
        from: "default",
      })
    }

    return { success: true }
  } catch (error: any) {
    console.error("Error submitting to agency:", error)
    return { success: false, error: error.message || "Failed to submit to agency." }
  }
}

export async function uploadRevisedEmrPpt(
  interestId: string,
  pptDataUrl: string,
  originalFileName: string,
  userName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!interestId || !pptDataUrl) {
      return { success: false, error: "Interest ID and file data are required." }
    }

    const interestRef = adminDb.collection("emrInterests").doc(interestId)
    const interestSnap = await interestRef.get()
    if (!interestSnap.exists) {
      return { success: false, error: "Interest registration not found." }
    }
    const interest = interestSnap.data() as EmrInterest

    // Standardize the filename for revised presentation
    const fileExtension = path.extname(originalFileName)
    const standardizedName = `emr_revised_${userName.replace(/\s+/g, "_")}${fileExtension}`

    const filePath = `emr-presentations/${interest.callId}/${interest.userId}/${standardizedName}`
    const result = await uploadFileToServer(pptDataUrl, filePath)

    if (!result.success || !result.url) {
      throw new Error(result.error || "Revised PPT upload failed.")
    }

    await interestRef.update({
      revisedPptUrl: result.url,
      revisedPptSubmissionDate: new Date().toISOString(),
      status: "Revised PPT Submitted",
    })

    return { success: true }
  } catch (error: any) {
    console.error("Error uploading revised EMR presentation:", error)
    return { success: false, error: error.message || "Failed to upload revised presentation." }
  }
}

export async function generateImrRecommendationDocument(
  projectId: string,
  evaluations: Evaluation[],
  projectData: Project,
): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const templatePath = path.join(process.cwd(), "IMR_RECOMMENDATION_TEMPLATE.docx")
    if (!fs.existsSync(templatePath)) {
      return {
        success: false,
        error: 'Template file "IMR_RECOMMENDATION_TEMPLATE.docx" not found in the project root directory.',
      }
    }

    const templateBuffer = fs.readFileSync(templatePath)
    const zip = new PizZip(templateBuffer)
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    })

    // Calculate overall recommendation
    const recommendedCount = evaluations.filter((e) => e.recommendation === "Recommended").length
    const totalEvaluations = evaluations.length
    const overallRecommendation = recommendedCount > totalEvaluations / 2 ? "Recommended" : "Not Recommended"

    // Prepare evaluator data
    const evaluatorData = evaluations.map((evaluation, index) => ({
      evaluatorName: evaluation.evaluatorName,
      recommendation: evaluation.recommendation,
      comments: evaluation.comments || "No comments provided",
      serialNumber: index + 1,
    }))

    // Prepare template data
    const templateData = {
      projectTitle: projectData.title,
      piName: projectData.pi,
      faculty: projectData.faculty,
      institute: projectData.institute,
      department: projectData.departmentName || "N/A",
      grantAmount: projectData.grant?.totalAmount ? `₹${projectData.grant.totalAmount.toLocaleString()}` : "N/A",
      evaluationDate: format(new Date(), "MMMM d, yyyy"),
      overallRecommendation: overallRecommendation,
      evaluators: evaluatorData,
      recommendedCount: recommendedCount,
      totalEvaluators: totalEvaluations,
    }

    doc.render(templateData)

    const buffer = doc.getZip().generate({
      type: "base64",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })

    return { success: true, fileData: buffer }
  } catch (error: any) {
    console.error("Error generating IMR recommendation document:", error)
    return { success: false, error: error.message || "Failed to generate document." }
  }
}
