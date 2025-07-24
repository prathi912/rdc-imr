import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email.toLowerCase()));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const userData = querySnapshot.docs[0].data();
      return NextResponse.json({ success: true, user: { name: userData.name, email: userData.email } });
    } else {
      return NextResponse.json({ success: true, user: null });
    }
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
