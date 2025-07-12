
"use server"

import { getResearchDomainSuggestion, type ResearchDomainInput } from "@/ai/flows/research-domain-suggestion"
import { summarizeProject, type SummarizeProjectInput } from "@/ai/flows/project-summarization"
import { generateEvaluationPrompts, type EvaluationPromptsInput } from "@/ai/flows/evaluation-prompts"
import { findJournalWebsite, type JournalWebsiteInput } from "@/ai/flows/journal-website-finder"
import { adminDb, adminStorage } from "@/lib/admin"
import type { Project, IncentiveClaim, User, GrantDetails, GrantPhase, Transaction } from "@/types"
import { sendEmail } from "@/lib/email"
import * as XLSX from "xlsx"
import fs from "fs"
import path from "path"
import { format } from "date-fns"

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
      <div style="background: linear-gradient(135deg, #0f2027, #203a43, #2c5364); color:#ffffff; font-family:Arial, sans-serif; padding:20px; border-radius:8px;">
        <div style="text-align:center; margin-bottom:20px;">
          <img src="https://c9lfgwsokvjlngjd.public.blob.vercel-storage.com/RDC-PU-LOGO.png" alt="RDC Logo" style="max-width:300px; height:auto;" />
        </div>
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
      <p style="color:#b0bec5;">Thank you,</p>
      <p style="color:#b0bec5;">Research & Development Cell - PU</p>
    </div>`

    if (project.pi_email) {
      await sendEmail({
        to: project.pi_email,
        subject: `Project Status Update: ${project.title}`,
        html: emailHtml,
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
                  <div style="background:linear-gradient(135deg, #0f2027, #203a43, #2c5364); color:#ffffff; font-family:Arial, sans-serif; padding:20px; border-radius:10px;">
                    <div style="text-align:center; margin-bottom:20px;">
                      <img src="https://c9lfgwsokvjlngjd.public.blob.vercel-storage.com/RDC-PU-LOGO.png" alt="RDC-PU Logo" style="max-width:200px; height:auto;" />
                    </div>
                
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
                
                    <p style="color:#b0bec5;">Thank you,</p>
                    <p style="color:#b0bec5;">Research & Development Cell - PU</p>
                  </div>
                `,
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

    for (const project of projectsToSchedule) {
      const projectRef = adminDb.collection("projects").doc(project.id)
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
        uid: project.pi_uid,
        projectId: project.id,
        title: `IMR meeting scheduled for your project: "${project.title}"`,
        createdAt: new Date().toISOString(),
        isRead: false,
      })

      if (project.pi_email) {
        await sendEmail({
          to: project.pi_email,
          subject: `IMR Meeting Scheduled for Your Project: ${project.title}`,
          html: `
            <div style="background: linear-gradient(135deg, #0f2027, #203a43, #2c5364); color: #ffffff; font-family: Arial, sans-serif; padding: 20px; border-radius: 8px;">
              <div style="text-align: center; margin-bottom: 20px;">
                <img src="https://c9lfgwsokvjlngjd.public.blob.vercel-storage.com/RDC-PU-LOGO.png" alt="RDC Logo" style="max-width: 300px; height: auto;" />
              </div>

              <p style="color: #ffffff;">Dear Researcher,</p>

              <p style="color: #e0e0e0;">
                An <strong style="color: #ffffff;">IMR evaluation meeting</strong> has been scheduled for your project, 
                "<strong style="color: #ffffff;">${project.title}</strong>".
              </p>

              <p><strong style="color: #ffffff;">Date:</strong> ${formattedDate}</p>
              <p><strong style="color: #ffffff;">Time:</strong> ${meetingDetails.time}</p>
              <p><strong style="color: #ffffff;">Venue:</strong> ${meetingDetails.venue}</p>

              <p style="color: #cccccc;">
                Please prepare for your presentation. You can view more details on the 
                <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/project/${project.id}" style="color: #64b5f6; text-decoration: underline;">
                  PU Research Portal
                </a>.
              </p>

          <p style="color:#b0bec5;">Thank you,</p>
          <p style="color:#b0bec5;">Research & Development Cell - PU</p>
            </div>
          `,
        })
      }
    }

    // Notify evaluators
    if (meetingDetails.evaluatorUids && meetingDetails.evaluatorUids.length > 0) {
      const evaluatorDocs = await Promise.all(
        meetingDetails.evaluatorUids.map((uid) => adminDb.collection("users").doc(uid).get()),
      )

      const projectTitles = projectsToSchedule.map((p) => `<li style="color: #cccccc;">${p.title}</li>`).join("")

      for (const evaluatorDoc of evaluatorDocs) {
        if (evaluatorDoc.exists) {
          const evaluator = evaluatorDoc.data() as User

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
                <div style="background: linear-gradient(135deg, #0f2027, #203a43, #2c5364); color: #ffffff; font-family: Arial, sans-serif; padding: 20px; border-radius: 8px;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <img src="https://c9lfgwsokvjlngjd.public.blob.vercel-storage.com/RDC-PU-LOGO.png" alt="RDC Logo" style="max-width: 300px; height: auto;" />
                    </div>
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
                    <p style="color:#b0bec5;">Thank you,</p>
                    <p style="color:#b0bec5;">Research & Development Cell - PU</p>
                </div>
              `,
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

    adminUsersSnapshot.forEach((userDoc) => {
      // userDoc.id is the UID of the admin user
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

    superAdminUsersSnapshot.forEach((userDoc) => {
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
    console.error("Error notifying Super-admins:", error)
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
        !project.Faculty
      ) {
        console.warn("Skipping incomplete project record:", project)
        continue
      }

      let pi_uid = ""
      let pi_name = project.Name_of_staff
      let faculty = project.Faculty
      let institute = "Unknown"
      let departmentName = "Unknown"

      // Find user by email to get UID and profile data
      const userQuery = await usersRef.where("email", "==", project.pi_email).limit(1).get()
      if (!userQuery.empty) {
        const userDoc = userQuery.docs[0]
        const userData = userDoc.data()
        pi_uid = userDoc.id
        pi_name = userData.name || pi_name
        faculty = userData.faculty || faculty
        institute = userData.institute || "Unknown"
        departmentName = userData.department || "Unknown"
      }

      const projectRef = adminDb.collection("projects").doc()
      const submissionDate =
        project.sanction_date && !isNaN(new Date(project.sanction_date).getTime())
          ? new Date(project.sanction_date).toISOString()
          : new Date().toISOString()

      const newProjectData: any = {
        title: project.project_title,
        pi_email: project.pi_email,
        status: project.status,
        pi_uid: pi_uid, // Will be empty if user not found yet
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

      batch.set(projectRef, newProjectData)
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

export async function fetchOrcidData(
  orcidId: string,
): Promise<{ success: boolean; data?: { name: string }; error?: string }> {
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
    if (!projectSnap.exists() || !projectSnap.data()?.meetingDetails) {
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
    description: string
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
      description: transactionData.description,
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
