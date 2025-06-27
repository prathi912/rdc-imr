
'use server';

import { summarizeProject, type SummarizeProjectInput } from '@/ai/flows/project-summarization';
import { generateEvaluationPrompts, type EvaluationPromptsInput } from '@/ai/flows/evaluation-prompts';
import { db } from '@/lib/firebase';
import { doc, collection, setDoc } from 'firebase/firestore';
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
    const projectDocRef = doc(collection(db, 'projects'));

    const projectData: Omit<Project, 'id'> = {
      ...projectPayload,
      status: 'Submitted' as const,
      submissionDate: new Date().toISOString(),
    };

    await setDoc(projectDocRef, projectData);
    
    return { success: true };

  } catch (error: any) {
    console.error('Error submitting project in server action: ', error);
    return { success: false, error: error.message || 'There was an error submitting your project.' };
  }
}
