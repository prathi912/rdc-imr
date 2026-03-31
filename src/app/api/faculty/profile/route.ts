import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFacultyByEmail } from '@/services/umsService';

function ensureFirebaseAdminInitialized() {
  if (getApps().length) return;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin credentials are not configured.');
  }

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    ensureFirebaseAdminInitialized();

    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, message: 'Missing or invalid authorization header.' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    const decodedToken = await getAuth().verifyIdToken(token).catch(() => null);
    if (!decodedToken || !decodedToken.email) {
      return NextResponse.json(
        { success: false, message: 'Unable to verify user token.' },
        { status: 401 }
      );
    }

    const email = String(decodedToken.email).trim().toLowerCase();
    if (!email) {
      return NextResponse.json(
        { success: false, message: 'User email is required.' },
        { status: 400 }
      );
    }

    const profile = await getFacultyByEmail(email);
    if (!profile) {
      return NextResponse.json({ success: false, message: 'Faculty record not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: profile });
  } catch (error: any) {
    console.error('Error fetching faculty profile:', error);
    const message = error?.message || 'Unable to fetch faculty data';
    return NextResponse.json({ success: false, message, error: message }, { status: 500 });
  }
}
