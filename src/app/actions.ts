'use server';

import { summarizeProject, type SummarizeProjectInput } from '@/ai/flows/project-summarization';
import { db } from '@/lib/firebase';
import { addDoc, collection, doc, getDoc, updateDoc } from 'firebase/firestore';
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

export async function updateProjectStatus(projectId: string, status: Project['status']) {
  try {
    const projectRef = doc(db, 'projects', projectId);
    const projectSnap = await getDoc(projectRef);

    if (!projectSnap.exists()) {
      return { success: false, error: 'Project not found.' };
    }
    const projectData = projectSnap.data() as Omit<Project, 'id'>;

    await updateDoc(projectRef, { status });

    // Create a notification for the project's PI
    if (projectData.pi_uid) {
      await addDoc(collection(db, 'notifications'), {
        uid: projectData.pi_uid,
        title: `Your project "${projectData.title}" status was updated to: ${status}`,
        projectId: projectId,
        createdAt: new Date().toISOString(),
        isRead: false,
      });
    }

    return { success: true, message: `Project status updated to ${status}` };
  } catch (error) {
    console.error('Error updating project status:', error);
    return { success: false, error: 'Failed to update project status.' };
  }
}
