
'use server';

import { summarizeProject, type SummarizeProjectInput } from '@/ai/flows/project-summarization';
import { generateEvaluationPrompts, type EvaluationPromptsInput } from '@/ai/flows/evaluation-prompts';
import { db } from '@/lib/firebase';
import { doc, writeBatch, collection } from 'firebase/firestore';


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

export async function scheduleMeetingForProjects(
  projectIds: string[],
  meetingDetails: { date: string; time: string; venue: string; },
  projectsData: { id: string; pi_uid: string; title: string; }[]
) {
  try {
    const batch = writeBatch(db);

    projectIds.forEach(id => {
      const projectRef = doc(db, 'projects', id);
      batch.update(projectRef, { 
        meetingDetails: meetingDetails,
        status: 'Under Review'
      });
    });

    projectsData.forEach(project => {
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
  } catch (error) {
    console.error('Error scheduling meeting:', error);
    return { success: false, error: 'Failed to schedule meeting.' };
  }
}
