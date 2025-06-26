'use server';

import { summarizeProject, type SummarizeProjectInput } from '@/ai/flows/project-summarization';
import { generateEvaluationPrompts, type EvaluationPromptsInput } from '@/ai/flows/evaluation-prompts';
import { db } from '@/lib/firebase';
import { doc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import type { User, Evaluation } from '@/types';


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

export async function submitEvaluation(
  projectId: string, 
  user: User,
  evaluationData: Omit<Evaluation, 'evaluatorUid' | 'evaluatorName' | 'evaluationDate'>
) {
  if (!user || !user.uid) {
     return { success: false, error: 'User is not authenticated.' };
  }
  try {
    const evaluationRef = doc(db, 'projects', projectId, 'evaluations', user.uid);
    const projectRef = doc(db, 'projects', projectId);

    const newEvaluation: Evaluation = {
      evaluatorUid: user.uid,
      evaluatorName: user.name,
      evaluationDate: new Date().toISOString(),
      ...evaluationData
    };

    // Using a server action allows these writes to succeed without complex client-side security rules.
    await setDoc(evaluationRef, newEvaluation, { merge: true });
    await updateDoc(projectRef, {
      evaluatedBy: arrayUnion(user.uid)
    });

    return { success: true };
  } catch (error) {
    console.error("Error submitting evaluation in server action:", error);
    return { success: false, error: 'Failed to submit evaluation on the server.' };
  }
}
