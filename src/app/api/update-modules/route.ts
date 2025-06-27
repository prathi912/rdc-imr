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
        const { uid, allowedModules } = await request.json();

        if (!uid || !allowedModules || !Array.isArray(allowedModules)) {
            return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
        }

        const adminDb = getAdminDb();
        const userDocRef = adminDb.doc(`users/${uid}`);
        await userDocRef.update({ allowedModules });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Error updating user modules:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to update modules.';
        return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
    }
}
