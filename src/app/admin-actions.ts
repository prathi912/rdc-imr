
'use server';

import { adminDb } from '@/lib/firebase-admin';

export async function scheduleMeetingForProjects(
  projectsToSchedule: { id: string; pi_uid: string; title: string; }[],
  meetingDetails: { date: string; time: string; venue: string; }
) {
  try {
    const batch = adminDb.batch();

    projectsToSchedule.forEach(project => {
      const projectRef = adminDb.doc(`projects/${project.id}`);
      batch.update(projectRef, { 
        meetingDetails: meetingDetails,
        status: 'Under Review'
      });

       const notificationRef = adminDb.collection('notifications').doc();
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

export async function updateUserModules(uid: string, allowedModules: string[]) {
  if (!uid) {
    return { success: false, error: 'User ID is required.' };
  }
  try {
    const userDocRef = adminDb.doc(`users/${uid}`);
    await userDocRef.update({ allowedModules });
    return { success: true };
  } catch (error) {
    console.error('Error updating user modules:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update modules.';
    return { success: false, error: errorMessage };
  }
}
