'use server';

import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

function getAdminDb() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return getFirestore();
}

export async function POST(request: Request) {
  try {
    const { projectsToSchedule, meetingDetails } = await request.json();

    if (!projectsToSchedule || !meetingDetails || !Array.isArray(projectsToSchedule)) {
        return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const batch = adminDb.batch();

    projectsToSchedule.forEach((project: { id: string; pi_uid: string; title: string; }) => {
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
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error scheduling meeting:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to schedule meeting.';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
