
'use server';

import { summarizeProject, type SummarizeProjectInput } from '@/ai/flows/project-summarization';
import { generateEvaluationPrompts, type EvaluationPromptsInput } from '@/ai/flows/evaluation-prompts';
import { db } from '@/lib/firebase';
import { doc, collection, writeBatch, updateDoc } from 'firebase/firestore';


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

export async function updateUserModules(uid: string, allowedModules: string[]) {
    try {
        const userDocRef = doc(db, 'users', uid);
        await updateDoc(userDocRef, { allowedModules });
        return { success: true };
    } catch (error: any) {
        console.error('Error updating user modules:', error);
        return { success: false, error: error.message || 'Failed to update modules.' };
    }
}
