
'use server';

import { summarizeProject, type SummarizeProjectInput } from '@/ai/flows/project-summarization';
import { generateEvaluationPrompts, type EvaluationPromptsInput } from '@/ai/flows/evaluation-prompts';
import { db } from '@/lib/firebase';
import { doc, writeBatch, collection, runTransaction } from 'firebase/firestore';
import type { Project } from '@/types';


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
  projectsToSchedule: { id: string; pi_uid: string; title: string; }[],
  meetingDetails: { date: string; time: string; venue: string; }
) {
  try {
    const batch = writeBatch(db);

    projectsToSchedule.forEach(project => {
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
  } catch (error) {
    console.error('Error scheduling meeting:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to schedule meeting.';
    return { success: false, error: errorMessage };
  }
}

export async function submitProject(
  projectPayload: {
    title: string;
    abstract: string;
    type: string;
    faculty: string;
    institute: string;
    departmentName: string;
    pi: string;
    pi_uid: string;
    teamInfo: string;
    timelineAndOutcomes: string;
  }
) {
  try {
    const counterRef = doc(db, 'counters', 'projects');

    await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      
      let newCount = 1;
      if (counterDoc.exists() && typeof counterDoc.data()?.count === 'number') {
          newCount = counterDoc.data().count + 1;
      }

      const year = new Date().getFullYear();
      const projectType = projectPayload.type.replace(/\s+/g, '_');
      const paddedCount = String(newCount).padStart(4, '0');
      const newProjectId = `${year}_${projectType}_${paddedCount}`;
      
      const projectDocRef = doc(db, 'projects', newProjectId);

      const projectData: Omit<Project, 'id'> = {
        ...projectPayload,
        status: 'Submitted' as const,
        submissionDate: new Date().toISOString(),
      };

      transaction.set(projectDocRef, projectData);
      transaction.set(counterRef, { count: newCount }, { merge: true });
    });
    
    return { success: true };

  } catch (error: any) {
    console.error('Error submitting project in server action: ', error);
    return { success: false, error: error.message || 'There was an error submitting your project.' };
  }
}
