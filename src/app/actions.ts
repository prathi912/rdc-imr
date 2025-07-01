
'use server';

import { summarizeProject, type SummarizeProjectInput } from '@/ai/flows/project-summarization';
import { generateEvaluationPrompts, type EvaluationPromptsInput } from '@/ai/flows/evaluation-prompts';
import { getResearchDomainSuggestion, type ResearchDomainInput } from '@/ai/flows/research-domain-suggestion';
import { db } from '@/lib/config';
import { adminStorage } from '@/lib/admin';
import { doc, collection, writeBatch } from 'firebase/firestore';


export async function getProjectSummary(input: SummarizeProjectInput) {
  try {
    const result = await summarizeProject(input);
    return { success: true, summary: result.summary };
  } catch (error) {
    console.error('Error summarizing project:', error);
    return { success: false, error: 'Failed to generate summary.' };
  }
}

export async function getEvaluationPrompts(input: EvaluationPromptsInput) {
  try {
    const result = await generateEvaluationPrompts(input);
    return { success: true, prompts: result };
  } catch (error) {
    console.error('Error generating evaluation prompts:', error);
    return { success: false, error: 'Failed to generate prompts.' };
  }
}

export async function getResearchDomain(input: ResearchDomainInput) {
  try {
    const result = await getResearchDomainSuggestion(input);
    return { success: true, domain: result.domain };
  } catch (error) {
    console.error('Error generating research domain:', error);
    return { success: false, error: 'Failed to generate research domain.' };
  }
}

export async function scheduleMeeting(
  projectsToSchedule: { id: string; pi_uid: string; title: string; }[],
  meetingDetails: { date: string; time: string; venue: string; }
) {
  try {
    const batch = writeBatch(db);

    projectsToSchedule.forEach((project) => {
      const projectRef = doc(db, 'projects', project.id);
      batch.update(projectRef, { 
        meetingDetails: meetingDetails,
        status: 'Under Review'
      });

      const notificationRef = doc(collection(db, 'notifications'));
      batch.set(notificationRef, {
         uid: project.pi_uid,
         projectId: project.id,
         title: `IMR meeting scheduled for your project: "${project.title}"`,
         createdAt: new Date().toISOString(),
         isRead: false,
      });
    });

    await batch.commit();
    return { success: true };
  } catch (error: any) {
    console.error('Error scheduling meeting:', error);
    return { success: false, error: error.message || 'Failed to schedule meeting.' };
  }
}

export async function uploadFileToServer(fileDataUrl: string, path: string): Promise<{success: boolean; url?: string; error?: string}> {
  try {
    if (!fileDataUrl) {
      throw new Error('Empty file data URL.');
    }
    const bucket = adminStorage().bucket();
    const file = bucket.file(path);

    // Extract mime type and base64 data from data URL
    const match = fileDataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) {
        throw new Error('Invalid data URL.');
    }
    const mimeType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Upload the file buffer
    await file.save(buffer, {
      metadata: {
        contentType: mimeType,
      },
      public: true, // Make the file public
    });

    // Get the public URL
    const downloadUrl = file.publicUrl();

    console.log(`File uploaded successfully to ${path}, URL: ${downloadUrl}`);

    return { success: true, url: downloadUrl };
  } catch (error: any) {
    console.error('Error uploading file via admin:', error);
    return { success: false, error: error.message || 'Failed to upload file.' };
  }
}
