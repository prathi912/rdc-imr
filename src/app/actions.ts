

"use server"

import { getResearchDomainSuggestion, type ResearchDomainInput } from "@/ai/flows/research-domain-suggestion"
import { summarizeProject, type SummarizeProjectInput } from "@/ai/flows/project-summarization"
import { generateEvaluationPrompts, type EvaluationPromptsInput } from "@/ai/flows/evaluation-prompts"
import { findJournalWebsite, type JournalWebsiteInput } from "@/ai/flows/journal-website-finder"
import { chat as chatAgent, type ChatInput } from "@/ai/flows/chat-agent"
import { adminDb, adminStorage } from "@/lib/admin"
import { FieldValue } from 'firebase-admin/firestore';
import admin from 'firebase-admin';
import type { Project, IncentiveClaim, User, GrantDetails, GrantPhase, Transaction, EmrInterest, FundingCall, EmrEvaluation, Evaluation, Author, ResearchPaper } from "@/types"
import { sendEmail as sendEmailUtility } from "@/lib/email"
import * as XLSX from "xlsx"
import fs from "fs"
import path from "path"
import { format, addMinutes, parse, parseISO, addDays, setHours, setMinutes, setSeconds, isToday } from "date-fns"
import * as z from 'zod';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { getDoc } from "firebase-admin/firestore"

// --- Centralized Logging Service ---
type LogLevel = 'INFO' | 'WARNING' | 'ERROR';

async function logActivity(level: LogLevel, message: string, context: Record<string, any> = {}) {
  try {
    if (!message) {
      console.error("Log message is empty or undefined.");
      return;
    }
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };
    await adminDb.collection('logs').add(logEntry);
  } catch (error) {
    console.error("FATAL: Failed to write to logs collection.", error);
    console.error("Original Log Entry:", { level, message, context });
  }
}


const EMAIL_STYLES = {
  background: 'style="background: linear-gradient(135deg, #0f2027, #203a43, #2c5364); color:#ffffff; font-family:Arial, sans-serif; padding:20px; border-radius:8px;"',
  logo: '<div style="text-align:center; margin-bottom:20px;"><img src="https://c9lfgwsokvjlngjd.public.blob.vercel-storage.com/RDC-PU-LOGO.png" alt="RDC Logo" style="max-width:300px; height:auto;" /></div>',
  footer: `
    <p style="color:#b0bec5; margin-top: 30px;">Best Regards,</p>
    <p style="color:#b0bec5;">Research & Development Cell Team,</p>
    <p style="color:#b0bec5;">Parul University</p>
    <hr style="border-top: 1px solid #4f5b62; margin-top: 20px;">
    <p style="font-size:10px; color:#999999; text-align:center; margin-top:10px;">
        This is a system generated automatic email. If you feel this is an error, please report at the earliest.
    </p>`
};

export async function sendEmail(options: { to: string; subject: string; html: string; from: 'default' | 'rdc' }) {
    return await sendEmailUtility(options);
}

export async function saveProjectSubmission(
  projectId: string,
  projectData: Omit<Project, 'id'>
): Promise<{ success: boolean; error?: string }> {
  try {
    const projectRef = adminDb.collection('projects').doc(projectId);
    await projectRef.set(projectData, { merge: true });
    
    // Notify admins only on final submission, not on saving drafts
    if (projectData.status === 'Submitted') {
      await notifyAdminsOnProjectSubmission(projectId, projectData.title, projectData.pi);
    }
    
    await logActivity('INFO', `Project ${projectData.status}`, { projectId, title: projectData.title });
    return { success: true };

  } catch (error: any) {
    console.error("Error saving project submission:", error);
    await logActivity('ERROR', 'Failed to save project submission', { projectId, title: projectData.title, error: error.message, stack: error.stack });
    return { success: false, error: error.message || 'Failed to save project.' };
  }
}

export async function runChatAgent(input: ChatInput): Promise<{ success: boolean, response?: string, error?: string }> {
    try {
        const result = await chatAgent(input);
        return { success: true, response: result };
    } catch (error: any) {
        console.error("Error running chat agent:", error);
        await logActivity('ERROR', 'Error in runChatAgent', { userId: input.user.uid, error: error.message, stack: error.stack });
        return { success: false, error: error.message || "Failed to get response from AI agent." };
    }
}


export async function linkPapersToNewUser(uid: string, email: string): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (!uid || !email) {
      return { success: false, count: 0, error: 'User ID and email are required.' };
    }

    const lowercasedEmail = email.toLowerCase();
    const papersRef = adminDb.collection('papers');
    
    // This is the correct way to query for a value within an array.
    const papersQuery = papersRef.where('authorEmails', 'array-contains', lowercasedEmail);
    
    const snapshot = await papersQuery.get();
    if (snapshot.empty) {
      console.log(`No papers found to link for new user: ${email}`);
      return { success: true, count: 0 };
    }

    console.log(`Found ${snapshot.docs.length} papers to link for new user: ${email}`);

    const batch = adminDb.batch();
    let updatedCount = 0;

    snapshot.forEach(doc => {
      const paper = doc.data() as ResearchPaper;
      let needsUpdate = false;
      
      const updatedAuthors = paper.authors.map(author => {
        // Find the author entry that matches the new user's email and doesn't have a UID yet.
        if (author.email.toLowerCase() === lowercasedEmail && !author.uid) {
          needsUpdate = true;
          return { ...author, uid: uid, isExternal: false }; // Update UID and mark as internal
        }
        return author;
      });

      if (needsUpdate) {
        const paperRef = doc.ref;
        // Add the new UID to the authorUids array for future queries.
        const updatedAuthorUids = [...new Set([...(paper.authorUids || []), uid])];
        batch.update(paperRef, { authors: updatedAuthors, authorUids: updatedAuthorUids });
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      await batch.commit();
      console.log(`Successfully committed updates for ${updatedCount} papers for user ${email}.`);
    }

    return { success: true, count: updatedCount };
  } catch (error: any) {
    console.error("Error linking papers to new user:", error);
    await logActivity('ERROR', 'Failed to link papers to new user', { uid, email, error: error.message, stack: error.stack });
    return { success: false, count: 0, error: error.message || 'Failed to link papers.' };
  }
}


export async function addResearchPaper(
  title: string,
  url: string,
  mainAuthorUid: string,
  authors: Author[]
): Promise<{ success: boolean; paper?: ResearchPaper; error?: string }> {
  try {
    const paperRef = adminDb.collection('papers').doc();
    const now = new Date().toISOString();
    
    // Create an array of UIDs and emails for efficient querying
    const authorUids = authors.map((a) => a.uid).filter(Boolean) as string[];
    const authorEmails = authors.map((a) => a.email.toLowerCase());

    const paperData: Omit<ResearchPaper, 'id'> = {
      title,
      url,
      mainAuthorUid,
      authors,
      authorUids,
      authorEmails,
      createdAt: now,
      updatedAt: now,
    };
    
    // 1. AI Domain Suggestion
    try {
      if (authorUids.length > 0) {
        const allPapersQuery = await adminDb
          .collection('papers')
          .where('authorUids', 'array-contains-any', authorUids)
          .get();
        const existingTitles = allPapersQuery.docs.map(doc => doc.data().title);
        const allTitles = [...new Set([title, ...existingTitles])];

        if (allTitles.length > 0) {
          const domainResult = await getResearchDomainSuggestion({ paperTitles: allTitles });
          paperData.domain = domainResult.domain;

          const batch = adminDb.batch();
          const userDocs = await adminDb
            .collection('users')
            .where(admin.firestore.FieldPath.documentId(), 'in', authorUids)
            .get();
            
          userDocs.forEach(doc => {
            batch.update(doc.ref, { researchDomain: domainResult.domain });
          });
          await batch.commit();
        }
      }
    } catch (aiError: any) {
      console.warn("AI domain suggestion failed, but proceeding to save paper. Error:", aiError.message);
      await logActivity('WARNING', 'AI domain suggestion failed during paper creation', { paperTitle: title, error: aiError.message });
    }

    // 2. Save paper
    await paperRef.set(paperData);
    await logActivity('INFO', 'Research paper added', { paperId: paperRef.id, title, mainAuthorUid });

    // 3. Notify co-authors
    const mainAuthorDoc = await adminDb.collection('users').doc(mainAuthorUid).get();
    const mainAuthorName = mainAuthorDoc.exists ? mainAuthorDoc.data()?.name : 'A colleague';
    const mainAuthorMisId = mainAuthorDoc.exists ? mainAuthorDoc.data()?.misId : null;

    const notificationBatch = adminDb.batch();
    authors.forEach((author) => {
      if (author.uid && author.uid !== mainAuthorUid) {
        const notificationRef = adminDb.collection('notifications').doc();
        notificationBatch.set(notificationRef, {
          uid: author.uid,
          title: `${mainAuthorName} added you as a co-author on the paper: "${title}"`,
          createdAt: new Date().toISOString(),
          isRead: false,
          projectId: mainAuthorMisId ? `/profile/${mainAuthorMisId}` : `/dashboard/my-projects`,
        });
      }
    });
    await notificationBatch.commit();

    return { success: true, paper: { id: paperRef.id, ...paperData } };

  } catch (error: any) {
    console.error("Error adding research paper:", error);
    await logActivity('ERROR', 'Failed to add research paper', { title, mainAuthorUid, error: error.message, stack: error.stack });
    return { success: false, error: error.message || "Failed to add research paper." };
  }
}

export async function updateResearchPaper(
  paperId: string,
  userId: string, // This is the UID of the user performing the edit (main author)
  data: { title: string; url: string; authors: Author[] }
): Promise<{ success: boolean; paper?: ResearchPaper; error?: string }> {
  try {
    const paperRef = adminDb.collection('papers').doc(paperId);
    const paperSnap = await paperRef.get();

    if (!paperSnap.exists) {
      return { success: false, error: "Paper not found." };
    }

    const paperData = paperSnap.data() as ResearchPaper;
    const oldAuthors = paperData.authors || [];

    if (paperData.mainAuthorUid !== userId) {
      return { success: false, error: "You do not have permission to edit this paper." };
    }
    
    const authorUids = data.authors.map((a) => a.uid).filter(Boolean) as string[];
    const authorEmails = data.authors.map((a) => a.email.toLowerCase());


    const updatedData: Partial<ResearchPaper> = {
      title: data.title,
      url: data.url,
      authors: data.authors,
      authorUids: authorUids,
      authorEmails: authorEmails,
      updatedAt: new Date().toISOString(),
    };

    await paperRef.update(updatedData);
    await logActivity('INFO', 'Research paper updated', { paperId, userId, title: data.title });

    // Notify newly added co-authors
    const mainAuthorDoc = await adminDb.collection('users').doc(userId).get();
    const mainAuthorName = mainAuthorDoc.exists ? mainAuthorDoc.data()?.name : 'A colleague';
    const mainAuthorMisId = mainAuthorDoc.exists ? mainAuthorDoc.data()?.misId : null;
    const oldAuthorUids = new Set(oldAuthors.map(a => a.uid));

    const notificationBatch = adminDb.batch();
    data.authors.forEach(author => {
      // Notify if the author is new, registered (has UID), and not the main author
      if (author.uid && author.uid !== userId && !oldAuthorUids.has(author.uid)) {
        const notificationRef = adminDb.collection('notifications').doc();
        notificationBatch.set(notificationRef, {
          uid: author.uid,
          title: `${mainAuthorName} added you as a co-author on the paper: "${data.title}"`,
          createdAt: new Date().toISOString(),
          isRead: false,
          projectId: mainAuthorMisId ? `/profile/${mainAuthorMisId}` : `/dashboard/my-projects`,
        });
      }
    });
    await notificationBatch.commit();
    
    return { success: true, paper: { ...paperData, ...updatedData, id: paperId } };

  } catch (error: any) {
    console.error("Error updating research paper:", error);
    await logActivity('ERROR', 'Failed to update research paper', { paperId, userId, error: error.message, stack: error.stack });
    return { success: false, error: error.message || "Failed to update paper." };
  }
}

export async function deleteResearchPaper(paperId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const paperRef = adminDb.collection('papers').doc(paperId);
    const paperSnap = await paperRef.get();

    if (!paperSnap.exists) {
      return { success: false, error: "Paper not found." };
    }

    const paperData = paperSnap.data() as ResearchPaper;

    if (paperData.mainAuthorUid !== userId) {
      return { success: false, error: "You do not have permission to delete this paper." };
    }

    await paperRef.delete();
    await logActivity('INFO', 'Research paper deleted', { paperId, userId, title: paperData.title });
    return { success: true };

  } catch (error: any) {
    console.error("Error deleting research paper:", error);
    await logActivity('ERROR', 'Failed to delete research paper', { paperId, userId, error: error.message, stack: error.stack });
    return { success: false, error: error.message || "Failed to delete paper." };
  }
}


export async function checkUserOrStaff(email: string): Promise<{ success: boolean; name: string | null; uid: string | null }> {
  try {
    const lowercasedEmail = email.toLowerCase();

    // 1. Check existing users in Firestore
    const usersRef = adminDb.collection('users');
    const userQuery = usersRef.where('email', '==', lowercasedEmail);
    const userSnapshot = await userQuery.get();

    if (!userSnapshot.empty) {
      const userDoc = userSnapshot.docs[0];
      const userData = userDoc.data();
      return { success: true, name: userData.name, uid: userDoc.id };
    }

    // 2. Check staffdata via API route
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002';
    const response = await fetch(`${baseUrl}/api/get-staff-data?email=${encodeURIComponent(lowercasedEmail)}`);
    const staffResult = await response.json();
    
    if (staffResult.success && staffResult.data) {
      return { success: true, name: staffResult.data.name, uid: null }; // No UID because they haven't signed up
    }

    // 3. Not found in either
    return { success: true, name: null, uid: null };

  } catch (error) {
    console.error("Error checking user/staff:", error);
    return { success: false, name: null, uid: null };
  }
}


export async function getProjectSummary(input: SummarizeProjectInput) {
  try {
    const result = await summarizeProject(input)
    return { success: true, summary: result.summary }
  } catch (error) {
    console.error("Error summarizing project:", error)
    await logActivity('ERROR', 'Failed to summarize project', { title: input.title, error: (error as Error).message });
    return { success: false, error: "Failed to generate summary." }
  }
}

export async function getEvaluationPrompts(input: EvaluationPromptsInput) {
  try {
    const result = await generateEvaluationPrompts(input)
    return { success: true, prompts: result }
  } catch (error) {
    console.error("Error generating evaluation prompts:", error)
    await logActivity('ERROR', 'Failed to generate evaluation prompts', { title: input.title, error: (error as Error).message });
    return { success: false, error: "Failed to generate prompts." }
  }
}

export async function getResearchDomain(input: ResearchDomainInput) {
  try {
    const result = await getResearchDomainSuggestion(input)
    return { success: true, domain: result.domain }
  } catch (error) {
    console.error("Error getting research domain:", error)
    await logActivity('ERROR', 'Failed to get research domain suggestion', { error: (error as Error).message });
    return { success: false, error: "Failed to get research domain." }
  }
}

export async function getJournalWebsite(input: JournalWebsiteInput) {
  try {
    const result = await findJournalWebsite(input)
    return { success: true, url: result.websiteUrl }
  } catch (error) {
    console.error("Error finding journal website:", error)
    await logActivity('ERROR', 'Failed to find journal website', { journalName: input.journalName, error: (error as Error).message });
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
    await logActivity('INFO', 'Project status updated', { projectId, newStatus, piUid: project.pi_uid });

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
      await sendEmailUtility({
        to: project.pi_email,
        subject: `Project Status Update: ${project.title}`,
        html: emailHtml,
        from: 'default'
      })
    }

    return { success: true }
  } catch (error: any) {
    console.error("Error updating project status:", error)
    await logActivity('ERROR', 'Failed to update project status', { projectId, newStatus, error: error.message, stack: error.stack });
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
    await logActivity('INFO', 'Incentive claim status updated', { claimId, newStatus, userId: claim.uid });

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
                    PU Research Portal
                  </a>.
                </p>
                ${EMAIL_STYLES.footer}
            </div>
            `,
        from: 'default'
      })
    }

    return { success: true }
  } catch (error: any) {
    console.error("Error updating incentive claim status:", error)
    await logActivity('ERROR', 'Failed to update incentive claim status', { claimId, newStatus, error: error.message, stack: error.stack });
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
          from: 'default'
        })
      }
    }

    // Notify evaluators
    if (meetingDetails.evaluatorUids && meetingDetails.evaluatorUids.length > 0) {
      const evaluatorDocs = await Promise.all(
        meetingDetails.evaluatorUids.map((uid) => adminDb.collection("users").doc(uid).get()),
      )

      const projectTitles = projectsToSchedule.map((p) => `<li style="color: #cccccc;">${p.title}</li>`).join("");

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
              from: 'default'
            })
          }
        }
      }
    }

    await batch.commit()
    await logActivity('INFO', 'IMR meeting scheduled', { projectIds: projectsToSchedule.map(p => p.id), meetingDate: meetingDetails.date });
    return { success: true }
  } catch (error: any) {
    console.error("Error scheduling meeting:", error)
    await logActivity('ERROR', 'Failed to schedule IMR meeting', { error: error.message, stack: error.stack });
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
    await logActivity('ERROR', 'File upload failed', { path, error: error.message, stack: error.stack });
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
    await logActivity('INFO', 'New project submission notification sent to admins', { projectId, projectTitle });
    return { success: true }
  } catch (error: any) {
    console.error("Error notifying admins:", error)
    await logActivity('ERROR', 'Failed to notify admins on project submission', { projectId, error: error.message, stack: error.stack });
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
    await logActivity('INFO', 'Evaluation submission notification sent to super-admins', { projectId, projectName, evaluatorName });
    return { success: true }
  } catch (error: any) {
    console.error("Error notifying Super-admins:", error)
    await logActivity('ERROR', 'Failed to notify super-admins on evaluation', { projectId, error: error.message, stack: error.stack });
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
    await logActivity('INFO', 'Completion request notification sent to admins', { projectId, projectTitle });
    return { success: true }
  } catch (error: any) {
    console.error("Error notifying admins on completion request:", error)
    await logActivity('ERROR', 'Failed to notify admins on completion request', { projectId, error: error.message, stack: error.stack });
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
    await logActivity('ERROR', 'Failed to check MIS ID existence', { misId, error: error.message, stack: error.stack });
    // Rethrow to let the client know something went wrong with the check.
    throw new Error("Failed to verify MIS ID due to a server error. Please try again.")
  }
}

export async function checkHODUniqueness(department: string, institute: string, currentUid: string): Promise<{ exists: boolean }> {
    try {
        if (!department || !institute) {
            return { exists: false }; // Cannot check if required fields are missing
        }
        const usersRef = adminDb.collection("users");
        const q = usersRef
            .where("designation", "==", "HOD")
            .where("department", "==", department)
            .where("institute", "==", institute)
            .limit(1);

        const querySnapshot = await q.get();

        if (querySnapshot.empty) {
            return { exists: false };
        }

        const foundUserDoc = querySnapshot.docs[0];
        // If the found HOD is the same as the user being updated, it's not a conflict.
        if (foundUserDoc.id === currentUid) {
            return { exists: false };
        }
        
        // A different user is already the HOD for this department/institute.
        return { exists: true };
    } catch (error: any) {
        console.error("Error checking HOD uniqueness:", error);
        await logActivity('ERROR', 'Failed to check HOD uniqueness', { department, institute, error: error.message, stack: error.stack });
        // Rethrow to ensure the client-side operation fails and informs the user.
        throw new Error("A server error occurred while verifying the HOD designation. Please try again.");
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
    await logActivity('ERROR', 'Failed to fetch Scopus data', { url, error: error.message, stack: error.stack });
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
    await logActivity('ERROR', 'Failed to fetch WoS data', { url, error: error.message, stack: error.stack });
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
): Promise<{ 
    success: boolean; 
    data: {
        successfulCount: number;
        failures: { projectTitle: string; piName: string; error: string }[];
    };
    error?: string 
}> {
  const usersRef = adminDb.collection("users");
  let successfulCount = 0;
  const failures: { projectTitle: string; piName: string; error: string }[] = [];
  
  for (const project of projectsData) {
      try {
          const projectTitle = project.project_title || 'Untitled';
          const piName = project.Name_of_staff || 'Unknown PI';

          if (!project.pi_email || !project.project_title || !project.status) {
              failures.push({ projectTitle, piName, error: 'Missing required columns (pi_email, project_title, status).' });
              continue;
          }

          let pi_uid = "";
          let faculty = project.Faculty;
          let institute = project.Institute;
          let departmentName = project.Department || null;

          const userQuery = await usersRef.where("email", "==", project.pi_email).limit(1).get();
          if (!userQuery.empty) {
              const userDoc = userQuery.docs[0];
              const userData = userDoc.data();
              pi_uid = userDoc.id;
              faculty = userData.faculty || faculty;
              institute = userData.institute || institute;
              departmentName = userData.department || departmentName;
          }
          
          let submissionDate;
          if (project.sanction_date) {
            if (project.sanction_date instanceof Date) {
              submissionDate = project.sanction_date.toISOString();
            } else if (typeof project.sanction_date === "number") {
              submissionDate = excelDateToJSDate(project.sanction_date).toISOString();
            } else if (typeof project.sanction_date === "string") {
              const parsedDate = new Date(project.sanction_date.replace(/(\d{2})-(\d{2})-(\d{4})/, '$3-$2-$1'));
              submissionDate = !isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString();
            } else {
              submissionDate = new Date().toISOString();
            }
          } else {
            submissionDate = new Date().toISOString();
          }

          const newProjectData: Omit<Project, 'id'> = {
              title: project.project_title, pi_email: project.pi_email, status: project.status,
              pi_uid: pi_uid, pi: piName, abstract: "Historical data migrated from bulk upload.",
              type: "Research", faculty: faculty, institute: institute, departmentName: departmentName,
              teamInfo: "Historical data, team info not available.",
              timelineAndOutcomes: "Historical data, outcomes not available.",
              submissionDate: submissionDate, isBulkUploaded: true,
          };

          if (project.grant_amount && project.grant_amount > 0) {
              const firstPhase: GrantPhase = {
                  id: new Date().toISOString(), name: "Phase 1", amount: project.grant_amount,
                  status: "Disbursed", disbursementDate: submissionDate, transactions: [],
              };
              newProjectData.grant = {
                  totalAmount: project.grant_amount, status: "Awarded",
                  sanctionNumber: project.sanction_number || "", phases: [firstPhase],
              };
          }
          
          await adminDb.collection('projects').add(newProjectData);
          successfulCount++;

      } catch (error: any) {
          console.error("Error processing a single project during bulk upload:", error);
          failures.push({ 
              projectTitle: project.project_title || 'Untitled', 
              piName: project.Name_of_staff || 'Unknown PI', 
              error: error.message || "An unknown error occurred during saving." 
          });
      }
  }
  
  await logActivity('INFO', 'Bulk project upload completed', { successfulCount, failureCount: failures.length });
  if (failures.length > 0) {
      await logActivity('WARNING', 'Some projects failed during bulk upload', { failures });
  }

  return { success: true, data: { successfulCount, failures } };
}


export async function deleteBulkProject(projectId: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!projectId) {
      return { success: false, error: "Project ID is required." }
    }
    const projectRef = adminDb.collection("projects").doc(projectId)
    await projectRef.delete()
    await logActivity('INFO', 'Bulk uploaded project deleted', { projectId });
    return { success: true }
  } catch (error: any) {
    console.error("Error deleting project:", error)
    await logActivity('ERROR', 'Failed to delete bulk uploaded project', { projectId, error: error.message, stack: error.stack });
    return { success: false, error: error.message || "Failed to delete the project." }
  }
}

export async function fetchOrcidData(
  orcidId: string,
): Promise<{
  success: boolean
  data?: { name: string }; error?: string
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
    await logActivity('ERROR', 'Failed to fetch ORCID data', { orcidId, error: error.message, stack: error.stack });
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
    await logActivity('ERROR', 'Failed to export claim to Excel', { claimId, error: error.message, stack: error.stack });
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
    projectsSnapshot.forEach((projectDoc) {
      const updateData: { [key: string]: any } = { pi_uid: uid }
      if (institute) updateData.institute = institute
      if (department) updateData.departmentName = department
      if (phoneNumber) updateData.pi_phoneNumber = phoneNumber

      batch.update(projectDoc.ref, updateData)
    })

    await batch.commit()

    await logActivity('INFO', 'Linked historical data for new user', { uid, email, count: projectsSnapshot.size });
    return { success: true, count: projectsSnapshot.size }
  } catch (error: any) {
    console.error("Error linking historical project data:", error)
    await logActivity('ERROR', 'Failed to link historical data', { uid: userData.uid, email: userData.email, error: error.message, stack: error.stack });
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
    
    await logActivity('INFO', 'Project revision submitted', { projectId, title: project.title, piUid: project.pi_uid });
    return { success: true }
  } catch (error: any) {
    console.error("Error submitting project revision:", error)
    await logActivity('ERROR', 'Failed to submit project revision', { projectId, error: error.message, stack: error.stack });
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
    await logActivity('INFO', 'Project duration updated', { projectId, startDate, endDate });
    return { success: true }
  } catch (error: any) {
    console.error("Error updating project duration:", error)
    await logActivity('ERROR', 'Failed to update project duration', { projectId, error: error.message, stack: error.stack });
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
    await logActivity('INFO', 'Project evaluators updated', { projectId, evaluatorUids });
    return { success: true }
  } catch (error: any) {
    console.error("Error updating project evaluators:", error)
    await logActivity('ERROR', 'Failed to update project evaluators', { projectId, error: error.message, stack: error.stack });
    return { success: false, error: "Failed to update project evaluators." }
  }
}

export async function findUserByMisId(
  misId: string,
): Promise<{ 
  success: boolean; 
  user?: { uid: string; name: string; email: string; }; 
  staff?: { name: string; email: string; };
  error?: string 
}> {
  try {
    if (!misId || misId.trim() === "") {
      return { success: false, error: "MIS ID is required." };
    }

    // 1. Check registered users in Firestore
    const usersRef = adminDb.collection("users");
    const q = usersRef.where("misId", "==", misId).limit(1);
    const querySnapshot = await q.get();

    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data() as User;
      if (userData.role === "admin" || userData.role === "Super-admin") {
        return { success: false, error: "Administrative users cannot be added as Co-PIs." };
      }
      return { success: true, user: { uid: userDoc.id, name: userData.name, email: userData.email } };
    }

    // 2. Fallback to staffdata.xlsx via API route
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002';
    const response = await fetch(`${baseUrl}/api/get-staff-data?misId=${encodeURIComponent(misId)}`);
    const staffResult = await response.json();

    if (staffResult.success && staffResult.data) {
        return { success: true, staff: { name: staffResult.data.name, email: staffResult.data.email } };
    }

    return { success: false, error: "No registered user or staff member found with this MIS ID. Please ask them to sign up for the portal." };

  } catch (error: any) {
    console.error("Error finding user by MIS ID:", error);
    await logActivity('ERROR', 'Failed to find user by MIS ID', { misId, error: error.message, stack: error.stack });
    return { success: false, error: error.message || "Failed to search for user." };
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
    await logActivity('INFO', 'Grant phase added', { projectId, phaseName, amount });

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
    await logActivity('ERROR', 'Failed to add grant phase', { projectId, error: error.message, stack: error.stack });
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
    await logActivity('INFO', 'Grant transaction added', { projectId, phaseId, amount: newTransaction.amount });

    const updatedProject = { ...project, grant: updatedGrant }
    return { success: true, updatedProject }
  } catch (error: any) {
    console.error("Error adding transaction:", error)
    await logActivity('ERROR', 'Failed to add grant transaction', { projectId, phaseId, error: error.message, stack: error.stack });
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
    await logActivity('INFO', 'Grant phase status updated', { projectId, phaseId, newStatus });

    // Add notification for grant phase status update
    const notification = {
      uid: project.pi_uid,
      projectId: projectId,
      title: `The status of grant phase has been updated to "${newStatus}" for your project "${project.title}".`,
      createdAt: new Date().toISOString(),
      isRead: false,
    }
    await adminDb.collection("notifications").add(notification)

    const updatedProject = { ...project, grant: updatedGrant }
    return { success: true, updatedProject }
  } catch (error: any) {
    console.error("Error updating phase status:", error)
    await logActivity('ERROR', 'Failed to update grant phase status', { projectId, phaseId, error: error.message, stack: error.stack });
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
    const projectSnap = await projectRef.get();
    if (!projectSnap.exists) {
        return { success: false, error: "Project not found." };
    }
    const project = projectSnap.data() as Project;
    const existingCoPis = project.coPiUids || [];

    await projectRef.update({
      coPiUids: coPiUids,
    })

    const newCoPis = coPiUids.filter(uid => !existingCoPis.includes(uid));

    if (newCoPis.length > 0) {
      const usersRef = adminDb.collection("users");
        const usersQuery = usersRef.where(admin.firestore.FieldPath.documentId(), "in", newCoPis);
      const newCoPiDocs = await usersQuery.get();
      
      const batch = adminDb.batch();

      for (const userDoc of newCoPiDocs.docs) {
        const coPi = userDoc.data() as User;
        
        // In-app notification
        const notificationRef = adminDb.collection("notifications").doc();
        batch.set(notificationRef, {
            uid: coPi.uid,
            projectId: projectId,
            title: `You have been added as a Co-PI to the IMR project: "${project.title}"`,
            createdAt: new Date().toISOString(),
            isRead: false,
        });

        // Email notification
        if (coPi.email) {
          const emailHtml = `
            <div ${EMAIL_STYLES.background}>
              ${EMAIL_STYLES.logo}
              <p style="color:#ffffff;">Dear ${coPi.name},</p>
              <p style="color:#e0e0e0;">You have been added as a Co-PI to the IMR project titled "<strong style="color:#ffffff;">${project.title}</strong>" by ${project.pi}.</p>
              <p style="color:#e0e0e0;">You can view the project details on the PU Research Portal.</p>
              ${EMAIL_STYLES.footer}
            </div>`;
          await sendEmailUtility({
              to: coPi.email,
              subject: `You've been added to an IMR Project`,
              html: emailHtml,
              from: 'default'
          });
        }
      }
      await batch.commit();
    }
    await logActivity('INFO', 'Co-investigators updated', { projectId, coPiUids });
    return { success: true }
  } catch (error: any) {
    console.error("Error updating Co-PIs:", error)
    await logActivity('ERROR', 'Failed to update co-investigators', { projectId, error: error.message, stack: error.stack });
    return { success: false, error: "Failed to update Co-PIs." }
  }
}

export async function updateUserTutorialStatus(uid: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!uid) {
      return { success: false, error: "User ID is required." };
    }
    const userRef = adminDb.collection('users').doc(uid);
    await userRef.update({ hasCompletedTutorial: true });
    await logActivity('INFO', 'User completed tutorial', { uid });
    return { success: true };
  } catch (error: any) {
    console.error("Error updating tutorial status:", error);
    await logActivity('ERROR', 'Failed to update user tutorial status', { uid, error: error.message, stack: error.stack });
    return { success: false, error: "Failed to update tutorial status." };
  }
}

export async function registerEmrInterest(callId: string, user: User, coPis?: { uid: string, name: string }[]): Promise<{ success: boolean; error?: string }> {
  try {
    if (!user || !user.uid || !user.faculty || !user.department) {
      return { success: false, error: "User profile is incomplete. Please update your faculty and department in Settings." };
    }
    
    const interestsRef = adminDb.collection('emrInterests');
    const q = interestsRef.where('callId', '==', callId).where('userId', '==', user.uid);
    const docSnap = await q.get();
    if (!docSnap.empty) {
        return { success: false, error: "You have already registered your interest for this call." };
    }
    
    // Check if this is the first registration for this call
    const allInterestsForCallQuery = interestsRef.where('callId', '==', callId);
    const allInterestsSnapshot = await allInterestsForCallQuery.get();
    const isFirstInterest = allInterestsSnapshot.empty;

    // Use a transaction to get the next sequential ID
    const newInterest = await adminDb.runTransaction(async (transaction) => {
      const counterRef = adminDb.collection('counters').doc('emrInterest');
      const counterDoc = await transaction.get(counterRef);

      let newCount = 1;
      if (counterDoc.exists) {
        newCount = counterDoc.data()!.current + 1;
      }
      transaction.set(counterRef, { current: newCount }, { merge: true });

      const interestId = `RDC/EMR/INTEREST/${String(newCount).padStart(5, '0')}`;
      
      const newInterestDoc: Omit<EmrInterest, 'id'> = {
          interestId: interestId,
          callId: callId,
          userId: user.uid,
          userName: user.name,
          userEmail: user.email,
          faculty: user.faculty!,
          department: user.department!,
          registeredAt: new Date().toISOString(),
          status: 'Registered',
      };

      if (coPis && coPis.length > 0) {
        newInterestDoc.coPiUids = coPis.map(p => p.uid);
        newInterestDoc.coPiNames = coPis.map(p => p.name);
      }
      
      const interestRef = adminDb.collection('emrInterests').doc();
      transaction.set(interestRef, newInterestDoc);
      return { id: interestRef.id, ...newInterestDoc };
    });
    
    const callSnap = await adminDb.collection('fundingCalls').doc(callId).get();
    const callTitle = callSnap.exists ? (callSnap.data() as FundingCall).title : "an EMR call";

    // If it's the first interest, notify admins
    if (isFirstInterest) {
        const adminRoles = ["admin", "Super-admin"];
        const usersRef = adminDb.collection("users");
        const adminQuery = usersRef.where("role", "in", adminRoles);
        const adminUsersSnapshot = await adminQuery.get();
        
        if (!adminUsersSnapshot.empty) {
            const batch = adminDb.batch();
            const notificationTitle = `First registration for "${callTitle}". Time to schedule a meeting.`;
            adminUsersSnapshot.forEach((userDoc) => {
                const notificationRef = adminDb.collection("notifications").doc();
                batch.set(notificationRef, {
                    uid: userDoc.id,
                    title: notificationTitle,
                    createdAt: new Date().toISOString(),
                    isRead: false,
                });
            });
            await batch.commit();
        }
    }


     // Notify Co-PIs
    if (coPis && coPis.length > 0) {
        const usersRef = adminDb.collection("users");
        const usersQuery = usersRef.where(admin.firestore.FieldPath.documentId(), "in", coPis.map(p => p.uid));
        const coPiDocs = await usersQuery.get();
        const batch = adminDb.batch();

        for (const userDoc of coPiDocs.docs) {
            const coPi = userDoc.data() as User;
            const notificationRef = adminDb.collection("notifications").doc();
            batch.set(notificationRef, {
                uid: coPi.uid,
                title: `You've been added as a Co-PI for the EMR call: "${callTitle}"`,
                createdAt: new Date().toISOString(),
                isRead: false,
            });

            if (coPi.email) {
                await sendEmailUtility({
                    to: coPi.email,
                    subject: `You've been added to an EMR Application `,
                    html: `
                        <div ${EMAIL_STYLES.background}>
                            ${EMAIL_STYLES.logo}
                            <p style="color:#ffffff;">Dear ${coPi.name},</p>
                            <p style="color:#e0e0e0;">You have been added as a Co-PI by ${user.name} for the EMR funding opportunity titled "<strong style="color:#ffffff;">${callTitle}</strong>".</p>
                             ${EMAIL_STYLES.footer}
                        </div>`,
                    from: 'default'
                });
            }
        }
        await batch.commit();
    }
    
    await logActivity('INFO', 'EMR interest registered', { callId, userId: user.uid });
    return { success: true };

  } catch (error: any) {
    console.error("Error registering EMR interest:", error);
    await logActivity('ERROR', 'Failed to register EMR interest', { callId, userId: user.uid, error: error.message, stack: error.stack });
    return { success: false, error: error.message || "Failed to register interest." };
  }
}

export async function scheduleEmrMeeting(
  callId: string,
  meetingDetails: { date: string; time: string; venue: string; evaluatorUids: string[] },
  applicantUids: string[],
) {
  try {
    const { date, time, venue, evaluatorUids } = meetingDetails;

    if (!evaluatorUids || evaluatorUids.length === 0) {
      return { success: false, error: "An evaluation committee must be assigned." };
    }
    
    const callRef = adminDb.collection('fundingCalls').doc(callId);
    const callSnap = await callRef.get();
    if (!callSnap.exists) {
      return { success: false, error: "Funding call not found." };
    }
    const call = callSnap.data() as FundingCall;
    
    const batch = adminDb.batch();
    const emailPromises = [];

    const meetingTime = parse(time, 'HH:mm', parseISO(date));

    // Update meeting details on the call document itself
    batch.update(callRef, {
        status: 'Meeting Scheduled',
        meetingDetails: { date, venue, assignedEvaluators: evaluatorUids }
    });

    for (const userId of applicantUids) {
      // Find the interest document for this user and call
      const interestsRef = adminDb.collection('emrInterests');
      const q = interestsRef.where('callId', '==', callId).where('userId', '==', userId);
      const interestSnapshot = await q.get();

      if (interestSnapshot.empty) continue;
      
      const interestDoc = interestSnapshot.docs[0];
      const interestRef = interestDoc.ref;
      const interest = interestDoc.data() as EmrInterest;

      batch.update(interestRef, {
        meetingSlot: { date, time },
        status: 'Evaluation Pending',
      });

      const notificationRef = adminDb.collection("notifications").doc();
      batch.set(notificationRef, {
        uid: interest.userId,
        title: `Your EMR Presentation for "${call.title}" has been scheduled.`,
        createdAt: new Date().toISOString(),
        isRead: false,
      });
      
      const emailHtml = `
          <div ${EMAIL_STYLES.background}>
              ${EMAIL_STYLES.logo}
              <p style="color: #ffffff;">Dear ${interest.userName},</p>
              <p style="color: #e0e0e0;">
                  A presentation slot has been scheduled for you for the EMR funding opportunity, "<strong style="color: #ffffff;">${call.title}</strong>".
              </p>
              <p><strong style="color: #ffffff;">Date:</strong> ${format(meetingTime, 'MMMM d, yyyy')}</p>
              <p><strong style="color: #ffffff;">Time:</strong> ${format(meetingTime, 'h:mm a')}</p>
              <p><strong style="color: #ffffff;">Venue:</strong> ${venue}</p>
              <p style="color: #cccccc;">Please prepare for your presentation.</p>
              ${EMAIL_STYLES.footer}
          </div>
      `;
      
      if (interest.userEmail) {
          emailPromises.push(sendEmailUtility({
              to: interest.userEmail,
              subject: `Your EMR Presentation Slot for: ${call.title}`,
              html: emailHtml,
              from: 'default'
          }));
      }
    }

    // Notify evaluators once
    if (evaluatorUids && evaluatorUids.length > 0) {
      const evaluatorDocs = await Promise.all(
        evaluatorUids.map((uid) => adminDb.collection("users").doc(uid).get()),
      );

      for (const evaluatorDoc of evaluatorDocs) {
        if (evaluatorDoc.exists) {
          const evaluator = evaluatorDoc.data() as User;

          const evaluatorNotificationRef = adminDb.collection("notifications").doc();
          batch.set(evaluatorNotificationRef, {
            uid: evaluator.uid,
            title: `You've been assigned to an EMR evaluation meeting for "${call.title}"`,
            createdAt: new Date().toISOString(),
            isRead: false,
          });

          if (evaluator.email) {
            emailPromises.push(sendEmailUtility({
              to: evaluator.email,
              subject: `EMR Evaluation Assignment: ${call.title}`,
              html: `
                <div ${EMAIL_STYLES.background}>
                    ${EMAIL_STYLES.logo}
                    <p style="color: #ffffff;">Dear Evaluator,</p>
                    <p style="color: #e0e0e0;">You have been assigned to an EMR evaluation committee.</p>
                    <p><strong style="color: #ffffff;">Date:</strong> ${format(parseISO(date), 'MMMM d, yyyy')}</p>
                     <p><strong style="color: #ffffff;">Time:</strong> ${format(meetingTime, 'h:mm a')}</p>
                    <p><strong style="color: #ffffff;">Venue:</strong> ${venue}</p>
                    <p style="color: #cccccc;">Please review the assigned presentations on the PU Research Portal.</p>
                    ${EMAIL_STYLES.footer}
                </div>
              `,
              from: 'default'
            }));
          }
        }
      }
    }

    await batch.commit();
    await Promise.all(emailPromises);
    await logActivity('INFO', 'EMR meeting scheduled', { callId, applicantUids, meetingDate: meetingDetails.date });

    return { success: true };
  } catch (error: any) {
    console.error("Error scheduling EMR meeting:", error);
    await logActivity('ERROR', 'Failed to schedule EMR meeting', { callId, error: error.message, stack: error.stack });
    return { success: false, error: error.message || "Failed to schedule EMR meeting." };
  }
}


export async function uploadEmrPpt(interestId: string, pptDataUrl: string, originalFileName: string, userName: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!interestId || !pptDataUrl) {
      return { success: false, error: "Interest ID and file data are required." };
    }
    
    const interestRef = adminDb.collection('emrInterests').doc(interestId);
    const interestSnap = await interestRef.get();
    if (!interestSnap.exists) {
        return { success: false, error: "Interest registration not found." };
    }
    const interest = interestSnap.data() as EmrInterest;
    
    // Standardize the filename
    const fileExtension = path.extname(originalFileName);
    const standardizedName = `emr_${userName.replace(/\s+/g, '_')}${fileExtension}`;

    const filePath = `emr-presentations/${interest.callId}/${interest.userId}/${standardizedName}`;
    const result = await uploadFileToServer(pptDataUrl, filePath);

    if (!result.success || !result.url) {
        throw new Error(result.error || "PPT upload failed.");
    }
    
    await interestRef.update({
      pptUrl: result.url,
      pptSubmissionDate: new Date().toISOString(),
      status: 'PPT Submitted',
    });
    
    await logActivity('INFO', 'EMR presentation uploaded', { interestId, userId: interest.userId });
    return { success: true };
  } catch (error: any) {
    console.error("Error uploading EMR presentation:", error);
    await logActivity('ERROR', 'Failed to upload EMR presentation', { interestId, error: error.message, stack: error.stack });
    return { success: false, error: error.message || "Failed to upload presentation." };
  }
}

export async function removeEmrPpt(interestId: string): Promise<{ success: boolean; error?: string }> {
    try {
        if (!interestId) {
            return { success: false, error: "Interest ID is required." };
        }

        const interestRef = adminDb.collection('emrInterests').doc(interestId);
        const interestSnap = await interestRef.get();
        if (!interestSnap.exists) {
            return { success: false, error: "Interest registration not found." };
        }
        const interest = interestSnap.data() as EmrInterest;

        if (interest.pptUrl) {
            const bucket = adminStorage.bucket();
            const url = new URL(interest.pptUrl);
            const filePath = decodeURIComponent(url.pathname.substring(url.pathname.indexOf('/o/') + 3));
            
            try {
                await bucket.file(filePath).delete();
                console.log(`Deleted file from Storage: ${filePath}`);
            } catch(storageError: any) {
                // If the file doesn't exist, we can ignore the error and proceed.
                if (storageError.code !== 404) {
                    throw storageError;
                }
                 console.warn(`Storage file not found during deletion, but proceeding: ${filePath}`);
            }
        }

        await interestRef.update({
            pptUrl: FieldValue.delete(),
            pptSubmissionDate: FieldValue.delete()
        });
        await logActivity('INFO', 'EMR presentation removed', { interestId, userId: interest.userId });
        return { success: true };
    } catch (error: any) {
        console.error("Error removing EMR presentation:", error);
        await logActivity('ERROR', 'Failed to remove EMR presentation', { interestId, error: error.message, stack: error.stack });
        return { success: false, error: error.message || "Failed to remove presentation." };
    }
}

export async function withdrawEmrInterest(interestId: string): Promise<{ success: boolean; error?: string }> {
    try {
        if (!interestId) {
            return { success: false, error: "Interest ID is required." };
        }

        const interestRef = adminDb.collection('emrInterests').doc(interestId);
        const interestSnap = await interestRef.get();

        if (!interestSnap.exists) {
            return { success: false, error: "Interest registration not found." };
        }
        const interest = interestSnap.data() as EmrInterest;

        // If a presentation was uploaded, delete it from storage first.
        if (interest.pptUrl) {
            await removeEmrPpt(interest.id);
        }
        
        // Delete the interest document from Firestore.
        await interestRef.delete();
        await logActivity('INFO', 'User withdrew EMR interest', { interestId, userId: interest.userId, callId: interest.callId });
        return { success: true };
    } catch (error: any) {
        console.error("Error withdrawing EMR interest:", error);
        const interestSnap = await adminDb.collection('emrInterests').doc(interestId).get();
        const interest = interestSnap.exists() ? interestSnap.data() as EmrInterest : null;
        await logActivity('ERROR', 'Failed to withdraw EMR interest', { interestId, userId: interest?.userId, callId: interest?.callId, error: error.message, stack: error.stack });
        return { success: false, error: error.message || "Failed to withdraw interest." };
    }
}

export async function deleteEmrInterest(interestId: string, remarks: string, adminName: string): Promise<{ success: boolean; error?: string }> {
    try {
        if (!interestId) return { success: false, error: "Interest ID is required." };

        const interestRef = adminDb.collection('emrInterests').doc(interestId);
        const interestSnap = await interestRef.get();
        if (!interestSnap.exists) return { success: false, error: "Interest registration not found." };
        
        const interest = interestSnap.data() as EmrInterest;
        const callRef = adminDb.collection('fundingCalls').doc(interest.callId);
        const callSnap = await callRef.get();
        const callTitle = callSnap.exists ? (callSnap.data() as FundingCall).title : 'an EMR call';

        // Withdraw interest to also handle file deletion
        await withdrawEmrInterest(interestId);
        
        // Notify the user
        const notification = {
            uid: interest.userId,
            title: `Your EMR registration for "${callTitle}" was removed.`,
            createdAt: new Date().toISOString(),
            isRead: false,
        };
        await adminDb.collection("notifications").add(notification);

        if (interest.userEmail) {
            await sendEmailUtility({
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
                from: 'default'
            });
        }
        await logActivity('INFO', 'Admin deleted EMR interest', { interestId, userId: interest.userId, callId: interest.callId, adminName, remarks });
        return { success: true };
    } catch (error: any) {
        console.error("Error deleting EMR interest:", error);
        await logActivity('ERROR', 'Failed to delete EMR interest', { interestId, adminName, error: error.message, stack: error.stack });
        return { success: false, error: error.message || "Failed to delete interest." };
    }
}

export async function addEmrEvaluation(
  interestId: string, 
  evaluator: User, 
  evaluationData: { recommendation: EmrEvaluation['recommendation']; comments: string }
): Promise<{ success: boolean, error?: string }> {
  try {
    const evaluationRef = adminDb.collection('emrInterests').doc(interestId).collection('evaluations').doc(evaluator.uid);
    
    const newEvaluation: EmrEvaluation = {
      evaluatorUid: evaluator.uid,
      evaluatorName: evaluator.name,
      evaluationDate: new Date().toISOString(),
      ...evaluationData
    };
    
    await evaluationRef.set(newEvaluation, { merge: true });
    await logActivity('INFO', 'EMR evaluation added', { interestId, evaluatorUid: evaluator.uid });

    // Notify Super Admins
    const interestSnap = await adminDb.collection('emrInterests').doc(interestId).get();
    if(interestSnap.exists) {
      const interest = interestSnap.data() as EmrInterest;
      const superAdminUsersSnapshot = await adminDb.collection("users").where("role", "==", "Super-admin").get();
      if (!superAdminUsersSnapshot.empty) {
        const batch = adminDb.batch();
        const notificationTitle = `EMR evaluation submitted for ${interest.userName} by ${evaluator.name}`;
        superAdminUsersSnapshot.forEach((userDoc) => {
          const notificationRef = adminDb.collection("notifications").doc();
          batch.set(notificationRef, {
            uid: userDoc.id,
            title: notificationTitle,
            createdAt: new Date().toISOString(),
            isRead: false,
          });
        });
        await batch.commit();
      }
    }
    
    return { success: true };
  } catch(error: any) {
    console.error("Error adding EMR evaluation:", error);
    await logActivity('ERROR', 'Failed to add EMR evaluation', { interestId, evaluatorUid: evaluator.uid, error: error.message, stack: error.stack });
    return { success: false, error: error.message || 'Failed to submit evaluation.' };
  }
}

export async function createFundingCall(
    callData: z.infer<any> // Using any because the zod schema is on the client
): Promise<{ success: boolean, error?: string }> {
    try {
        const newCallDocRef = adminDb.collection('fundingCalls').doc();
        const attachments: { name: string; url: string }[] = [];

        if (callData.attachments && callData.attachments.length > 0) {
            for (let i = 0; i < callData.attachments.length; i++) {
                const file = callData.attachments[i];
                const dataUrl = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}`;
                const path = `emr-attachments/${newCallDocRef.id}/${file.name}`;
                const result = await uploadFileToServer(dataUrl, path);
                if (result.success && result.url) {
                    attachments.push({ name: file.name, url: result.url });
                } else {
                    throw new Error(`Failed to upload attachment: ${file.name}`);
                }
            }
        }
        
        // Transaction to generate a new sequential ID
        const newCallData = await adminDb.runTransaction(async (transaction) => {
            const counterRef = adminDb.collection('counters').doc('emrCall');
            const counterDoc = await transaction.get(counterRef);

            let newCount = 1;
            if (counterDoc.exists) {
                newCount = counterDoc.data()!.current + 1;
            }
            transaction.set(counterRef, { current: newCount }, { merge: true });

            const callIdentifier = `RDC/EMR/CALL/${String(newCount).padStart(5, '0')}`;
            
            const newCall: Omit<FundingCall, 'id'> = {
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
                createdBy: 'Super-admin',
                status: 'Open',
                isAnnounced: callData.notifyAllStaff,
            };
            
            transaction.set(newCallDocRef, newCall);
            return { id: newCallDocRef.id, ...newCall };
        });

        if (callData.notifyAllStaff) {
            await announceEmrCall(newCallData.id);
        }
        await logActivity('INFO', 'New funding call created', { callId: newCallData.id, title: newCallData.title });

        return { success: true };
    } catch (error: any) {
        console.error("Error creating funding call:", error);
        await logActivity('ERROR', 'Failed to create funding call', { title: callData.title, error: error.message, stack: error.stack });
        return { success: false, error: error.message || "Failed to create funding call." };
    }
}

export async function announceEmrCall(callId: string): Promise<{ success: boolean, error?: string }> {
  try {
    const allStaffEmail = process.env.ALL_STAFF_EMAIL;
    if (!allStaffEmail) {
      return { success: false, error: "The 'All Staff' email address is not configured on the server. Please add it to the .env file." };
    }
    
    const callRef = adminDb.collection('fundingCalls').doc(callId);
    const callSnap = await callRef.get();

    if (!callSnap.exists) {
        return { success: false, error: 'Funding call not found.' };
    }
    const call = callSnap.data() as FundingCall;

    const emailAttachments = (call.attachments || []).map(att => ({ filename: att.name, path: att.url }));

    const emailHtml = `
      <div ${EMAIL_STYLES.background}>
        ${EMAIL_STYLES.logo}
        <h2 style="color: #ffffff; text-align: center;">New Funding Opportunity: ${call.title}</h2>
        <p style="color:#e0e0e0;">A new funding call from <strong style="color:#ffffff;">${call.agency}</strong> has been posted on the PU Research Portal.</p>
        <div style="padding: 15px; border: 1px solid #4f5b62; border-radius: 8px; margin-top: 20px; background-color:#2c3e50;">
          <div style="color:#e0e0e0;" class="prose prose-sm">${call.description || 'No description provided.'}</div>
          <p style="color:#e0e0e0;"><strong>Register Interest By:</strong> ${format(parseISO(call.interestDeadline), 'PPp')}</p>
          <p style="color:#e0e0e0;"><strong>Agency Deadline:</strong> ${format(parseISO(call.applyDeadline), 'PP')}</p>
        </div>
        <p style="color:#e0e0e0; margin-top: 20px;">Please find the relevant documents attached to this email.</p>
        <p style="margin-top: 20px; text-align: center;">
          <a href="${call.detailsUrl || process.env.NEXT_PUBLIC_BASE_URL + '/dashboard/emr-calendar'}" style="background-color: #64B5F6; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">
            View Full Details on the Portal
          </a>
        </p>
         ${EMAIL_STYLES.footer}
      </div>
    `;

    await sendEmailUtility({
      to: allStaffEmail,
      subject: `New Funding Call: ${call.title}`,
      html: emailHtml,
      from: 'rdc',
      attachments: emailAttachments
    });
    
    // Mark the call as announced
    await callRef.update({ isAnnounced: true });
    await logActivity('INFO', 'EMR call announced', { callId, title: call.title });

    return { success: true };
  } catch (error: any) {
    console.error("Error announcing EMR call:", error);
    await logActivity('ERROR', 'Failed to announce EMR call', { callId, error: error.message, stack: error.stack });
    return { success: false, error: error.message || "Failed to send announcement." };
  }
}

export async function updateEmrStatus(
    interestId: string, 
    status: EmrInterest['status'],
    adminRemarks?: string,
): Promise<{ success: boolean, error?: string }> {
  try {
    const interestRef = adminDb.collection("emrInterests").doc(interestId)
    const updateData: { [key: string]: any } = { status }

    if (adminRemarks) {
      updateData.adminRemarks = adminRemarks
    }
    
    if (status === 'Endorsement Signed') {
        updateData.endorsementSignedAt = new Date().toISOString();
    }
    if (status === 'Submitted to Agency') {
        updateData.submittedToAgencyAt = new Date().toISOString();
    }

    await interestRef.update(updateData)
    const interestSnap = await interestRef.get()
    const interest = interestSnap.data() as EmrInterest;
    await logActivity('INFO', 'EMR interest status updated', { interestId, userId: interest.userId, newStatus: status });

    // Notify user
    if (interestSnap.exists) {
      const notification = {
        uid: interest.userId,
        title: `Your EMR application status has been updated to: ${status}`,
        createdAt: new Date().toISOString(),
        isRead: false,
      }
      await adminDb.collection("notifications").add(notification)

      if (interest.userEmail) {
        let emailHtml = `
            <div ${EMAIL_STYLES.background}>
                ${EMAIL_STYLES.logo}
                <p style="color:#ffffff;">Dear ${interest.userName},</p>
                <p style="color:#e0e0e0;">The status of your EMR application has been updated to <strong style="color:#ffffff;">${status}</strong>.</p>
                ${adminRemarks ? `<div style="margin-top:20px; padding:15px; border:1px solid #4f5b62; border-radius:6px; background-color:#2c3e50;"><h4 style="color:#ffffff; margin-top:0;">Admin Remarks:</h4><p style="color:#e0e0e0;">${adminRemarks}</p></div>` : ""}
        `;
        
        if (status === 'Endorsement Signed') {
            emailHtml += `<p style="color:#e0e0e0; margin-top:15px;">Your endorsement letter has been signed and is ready for collection from the RDC office. You may now submit your proposal to the funding agency. Once submitted, please log the Agency Reference Number and Acknowledgement on the portal.</p>`
        }
        
        if (status === 'Revision Needed') {
            const callSnap = await adminDb.collection('fundingCalls').doc(interest.callId).get();
            if (callSnap.exists()) {
                const call = callSnap.data() as FundingCall;
                if (call.meetingDetails?.date) {
                    const meetingDate = parseISO(call.meetingDetails.date);
                    const deadline = setSeconds(setMinutes(setHours(addDays(meetingDate, 3), 17), 0), 0); // 3 days after meeting at 5:00 PM
                    emailHtml += `<p style="color:#e0e0e0; margin-top:15px;">Please submit your revised presentation on the portal by <strong style="color:#ffffff;">${format(deadline, 'PPpp')}</strong>.</p>`;
                }
            }
        }

        emailHtml += `<p style="color:#e0e0e0;">Please check the portal for more details.</p>${EMAIL_STYLES.footer}</div>`

        await sendEmailUtility({
          to: interest.userEmail,
          subject: `Update on your EMR Application`,
          html: emailHtml,
          from: "default",
        })
      }
    }
    return { success: true }
  } catch (error: any) {
    console.error("Error updating EMR status:", error)
    await logActivity('ERROR', 'Failed to update EMR status', { interestId, status, error: error.message, stack: error.stack });
    return { success: false, error: error.message || "Failed to update status." }
  }
}


export async function uploadRevisedEmrPpt(interestId: string, pptDataUrl: string, originalFileName: string, userName: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!interestId || !pptDataUrl) {
      return { success: false, error: "Interest ID and file data are required." };
    }
    
    const interestRef = adminDb.collection('emrInterests').doc(interestId);
    
    // Standardize the filename
    const fileExtension = path.extname(originalFileName);
    const standardizedName = `${userName.replace(/\s+/g, '_')}_revised_${new Date().getTime()}${fileExtension}`;

    const filePath = `emr-presentations/${path.dirname(interestId)}/${standardizedName}`;
    const result = await uploadFileToServer(pptDataUrl, filePath);

    if (!result.success || !result.url) {
        throw new Error(result.error || "Revised PPT upload failed.");
    }
    
    await interestRef.update({
      revisedPptUrl: result.url,
      status: 'Revision Submitted',
    });
    
    const interestSnap = await interestRef.get();
    const interest = interestSnap.data() as EmrInterest;
    await logActivity('INFO', 'Revised EMR presentation uploaded', { interestId, userId: interest.userId });
    return { success: true };
  } catch (error: any) {
    console.error("Error uploading revised EMR presentation:", error);
    await logActivity('ERROR', 'Failed to upload revised EMR presentation', { interestId, error: error.message, stack: error.stack });
    return { success: false, error: error.message || "Failed to upload presentation." };
  }
}

export async function notifySuperAdminsOnNewUser(userName: string, role: string) {
  try {
    const superAdminUsersSnapshot = await adminDb.collection("users").where("role", "==", "Super-admin").get();
    if (superAdminUsersSnapshot.empty) {
      console.log("No Super-admin users found to notify.");
      return { success: true, message: "No Super-admins to notify." };
    }

    const batch = adminDb.batch();
    const notificationTitle = `New ${role.toUpperCase()} joined: ${userName}`;

    superAdminUsersSnapshot.forEach((docSnapshot) => {
      const notificationRef = adminDb.collection("notifications").doc();
      batch.set(notificationRef, {
        uid: docSnapshot.id,
        title: notificationTitle,
        createdAt: new Date().toISOString(),
        isRead: false,
      });
    });

    await batch.commit();
    await logActivity('INFO', 'New user notification sent to super-admins', { userName, role });
    return { success: true };
  } catch (error: any) {
    console.error("Error notifying Super-admins about new user:", error);
    await logActivity('ERROR', 'Failed to notify super-admins about new user', { userName, role, error: error.message, stack: error.stack });
    return { success: false, error: error.message || "Failed to notify Super-admins." };
  }
}

export async function saveSidebarOrder(uid: string, order: string[]): Promise<{ success: boolean, error?: string }> {
  try {
    if (!uid || !Array.isArray(order)) {
      return { success: false, error: 'Invalid user ID or order provided.' };
    }
    const userRef = adminDb.collection('users').doc(uid);
    await userRef.update({ sidebarOrder: order });
    await logActivity('INFO', 'User sidebar order saved', { uid });
    return { success: true };
  } catch (error: any) {
    console.error('Error saving sidebar order:', error);
    await logActivity('ERROR', 'Failed to save sidebar order', { uid, error: error.message, stack: error.stack });
    return { success: false, error: error.message || 'Failed to save sidebar order.' };
  }
}

export async function uploadEndorsementForm(interestId: string, endorsementUrl: string): Promise<{ success: boolean, error?: string }> {
    try {
        if (!interestId || !endorsementUrl) {
            return { success: false, error: "Interest ID and endorsement form URL are required." };
        }
        const interestRef = adminDb.collection('emrInterests').doc(interestId);
        await interestRef.update({
            endorsementFormUrl: endorsementUrl,
            status: 'Endorsement Submitted',
        });
        const interestSnap = await interestRef.get();
        const interest = interestSnap.data() as EmrInterest;
        await logActivity('INFO', 'EMR endorsement form uploaded', { interestId, userId: interest.userId });
        return { success: true };
    } catch (error: any) {
        console.error("Error submitting endorsement form:", error);
        await logActivity('ERROR', 'Failed to upload EMR endorsement form', { interestId, error: error.message, stack: error.stack });
        return { success: false, error: "Failed to submit endorsement form." };
    }
}


export async function submitToAgency(
  interestId: string, 
  referenceNumber: string, 
  acknowledgementUrl?: string
): Promise<{ success: boolean, error?: string }> {
    try {
        if (!interestId || !referenceNumber) {
            return { success: false, error: "Interest ID and reference number are required." };
        }
        const interestRef = adminDb.collection('emrInterests').doc(interestId);
        const updateData: { [key: string]: any } = {
            agencyReferenceNumber: referenceNumber,
            status: 'Submitted to Agency',
            submittedToAgencyAt: new Date().toISOString(),
        };
        if (acknowledgementUrl) {
            updateData.agencyAcknowledgementUrl = acknowledgementUrl;
        }
        await interestRef.update(updateData);
        const interestSnap = await interestRef.get();
        const interest = interestSnap.data() as EmrInterest;
        await logActivity('INFO', 'EMR application submitted to agency', { interestId, userId: interest.userId, referenceNumber });
        return { success: true };
    } catch (error: any) {
        console.error("Error submitting to agency:", error);
        await logActivity('ERROR', 'Failed to log EMR submission to agency', { interestId, error: error.message, stack: error.stack });
        return { success: false, error: "Failed to log submission to agency." };
    }
}

export async function generateRecommendationForm(projectId: string): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const projectRef = adminDb.collection('projects').doc(projectId);
    const projectSnap = await getDoc(projectRef);
    if (!projectSnap.exists()) {
      return { success: false, error: 'Project not found.' };
    }
    const project = { id: projectSnap.id, ...projectSnap.data() } as Project;
    
    const evaluationsRef = projectRef.collection('evaluations');
    const evaluationsSnap = await getDocs(evaluationsRef);
    const evaluations = evaluationsSnap.docs.map(doc => doc.data() as Evaluation);
    
    const templatePath = path.join(process.cwd(), 'IMR_RECOMMENDATION_TEMPLATE.docx');
    if (!fs.existsSync(templatePath)) {
      return { success: false, error: 'Recommendation form template not found on the server.' };
    }
    const content = fs.readFileSync(templatePath, 'binary');

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });

    const recommendationText = evaluations.map(e => {
        return `${e.evaluatorName} (${e.recommendation}):\n${e.comments}`;
    }).join('\n\n');

    const data = {
        pi_name: project.pi,
        submission_date: new Date(project.submissionDate).toLocaleDateString(),
        project_title: project.title,
        faculty: project.faculty,
        department: project.departmentName,
        institute: project.institute,
        grant_amount: project.grant?.totalAmount.toLocaleString('en-IN') || 'N/A',
        evaluator_comments: recommendationText || 'No evaluations submitted yet.'
    };
    
    doc.setData(data);

    try {
      doc.render();
    } catch (error: any) {
      console.error('Docxtemplater render error:', error);
      return { success: false, error: 'Failed to render the document template.' };
    }

    const buf = doc.getZip().generate({ type: 'nodebuffer' });
    const base64 = buf.toString('base64');

    return { success: true, fileData: base64 };
  } catch (error: any) {
    console.error('Error generating recommendation form:', error);
    await logActivity('ERROR', 'Failed to generate recommendation form', { projectId, error: error.message, stack: error.stack });
    return { success: false, error: error.message || 'Failed to generate the form.' };
  }
}

export async function fetchEvaluatorProjectsForUser(evaluatorUid: string, targetUserUid: string): Promise<{ success: boolean; projects?: (Project | FundingCall)[]; error?: string }> {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');

    // IMR Projects
    const imrProjectsRef = adminDb.collection('projects');
    const imrPiQuery = imrProjectsRef.where('pi_uid', '==', targetUserUid).where('meetingDetails.assignedEvaluators', 'array-contains', evaluatorUid).where('meetingDetails.date', '==', today);
    const imrCoPiQuery = imrProjectsRef.where('coPiUids', 'array-contains', targetUserUid).where('meetingDetails.assignedEvaluators', 'array-contains', evaluatorUid).where('meetingDetails.date', '==', today);

    // EMR Projects
    const fundingCallsRef = adminDb.collection('fundingCalls');
    const emrCallsQuery = fundingCallsRef.where('meetingDetails.assignedEvaluators', 'array-contains', evaluatorUid).where('meetingDetails.date', '==', today);

    const [imrPiSnapshot, imrCoPiSnapshot, emrCallsSnapshot] = await Promise.all([
      imrPiQuery.get(),
      imrCoPiQuery.get(),
      emrCallsQuery.get(),
    ]);

    const imrProjects = new Map<string, Project>();
    imrPiSnapshot.forEach(doc => imrProjects.set(doc.id, { id: doc.id, ...doc.data() } as Project));
    imrCoPiSnapshot.forEach(doc => imrProjects.set(doc.id, { id: doc.id, ...doc.data() } as Project));

    const emrCalls = emrCallsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingCall));

    // For EMR, we need to check if the target user is actually an applicant for these calls
    let relevantEmrCalls: FundingCall[] = [];
    if (emrCalls.length > 0) {
        const callIds = emrCalls.map(c => c.id);
        const interestsRef = adminDb.collection('emrInterests');
        const interestsQuery = interestsRef.where('callId', 'in', callIds).where('userId', '==', targetUserUid);
        const interestsSnapshot = await getDocs(interestsRef);
        const relevantCallIds = new Set(interestsSnapshot.docs.map(d => d.data().callId));
        relevantEmrCalls = emrCalls.filter(c => relevantCallIds.has(c.id));
    }
    
    return { success: true, projects: [...imrProjects.values(), ...relevantEmrCalls] };

  } catch (error: any) {
    console.error("Error fetching projects for evaluator:", error);
    await logActivity('ERROR', 'Failed to fetch evaluator projects for user', { evaluatorUid, targetUserUid, error: error.message, stack: error.stack });
    return { success: false, error: "Failed to fetch project data for permission check." };
  }
}

type PaperUploadData = {
  paper_title: string;
  author_email: string;
  author_type: 'First Author' | 'Corresponding Author' | 'Co-Author';
  url: string;
};
    
export async function bulkUploadPapers(
  papersData: PaperUploadData[],
): Promise<{ 
    success: boolean; 
    data: {
        successfulPapers: { title: string; authors: string[] }[];
        failedAuthorLinks: { title: string; email: string; reason: string }[];
    };
    error?: string 
}> {
  const successfulPapers: { title: string; authors: string[] }[] = [];
  const failedAuthorLinks: { title: string; email: string; reason: string }[] = [];

  try {
    const papersMap = new Map<string, { url: string, authors: { email: string, type: string }[] }>();
    for (const row of papersData) {
        if (!papersMap.has(row.paper_title)) {
            papersMap.set(row.paper_title, { url: row.url, authors: [] });
        }
        papersMap.get(row.paper_title)!.authors.push({ email: row.author_email, type: row.author_type });
    }
    
    const usersRef = adminDb.collection('users');
    const batch = adminDb.batch();

    for (const [title, data] of papersMap.entries()) {
        const authors: Author[] = [];
        const authorUids: string[] = [];
        const authorEmails: string[] = [];
        let mainAuthorUid: string | undefined;
        let firstAuthorFound: Author | undefined;

        for (const author of data.authors) {
            const userQuery = await usersRef.where('email', '==', author.email).limit(1).get();
            const authorData: Author = {
                email: author.email,
                name: author.email.split('@')[0],
                role: author.type as Author['role'],
                isExternal: false,
            };

            if (userQuery.empty) {
                // This is expected for unregistered users, so we don't add it to failedAuthorLinks.
                // It will be linked upon their registration.
            } else {
                const userDoc = userQuery.docs[0];
                const userData = userDoc.data() as User;
                authorData.uid = userDoc.id;
                authorData.name = userData.name;
                authorUids.push(userDoc.id);
            }
            
            authors.push(authorData);
            authorEmails.push(author.email.toLowerCase());

            if (author.type === 'First Author') {
                firstAuthorFound = authorData;
                if (authorData.uid) {
                    mainAuthorUid = authorData.uid;
                }
            }
        }
        
        if (authors.length > 0) {
             if (!mainAuthorUid) {
                if (firstAuthorFound?.uid) {
                    mainAuthorUid = firstAuthorFound.uid;
                } else if (authorUids.length > 0) {
                    mainAuthorUid = authorUids[0]; // Fallback to first registered author
                }
            }
            
            const paperRef = adminDb.collection('papers').doc();
            const now = new Date().toISOString();
            
            const paperData: Omit<ResearchPaper, 'id'> = {
                title,
                url: data.url,
                mainAuthorUid: mainAuthorUid,
                authors,
                authorUids,
                authorEmails,
                createdAt: now,
                updatedAt: now,
            };
            
            batch.set(paperRef, paperData);
            successfulPapers.push({ title, authors: authors.map(a => a.name) });
        }
    }

    await batch.commit();
    await logActivity('INFO', 'Bulk paper upload completed', { successfulCount: successfulPapers.length, failedCount: failedAuthorLinks.length });

    return { 
        success: true, 
        data: { successfulPapers, failedAuthorLinks }
    };
  } catch (error: any) {
    console.error("Error during bulk paper upload:", error);
    await logActivity('ERROR', 'Failed during bulk paper upload', { error: error.message, stack: error.stack });
    return { 
        success: false, 
        error: error.message || "Failed to upload papers.",
        data: { successfulPapers, failedAuthorLinks }
    };
  }
}
    





    












    


