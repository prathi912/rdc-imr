
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/admin';
import type { User } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');

    if (!name || name.trim().length < 2) {
      return NextResponse.json({ success: true, users: [] });
    }

    const lowercasedName = name.toLowerCase();
    
    const usersRef = adminDb.collection('users');
    const querySnapshot = await usersRef.orderBy('name').get();

    if (querySnapshot.empty) {
      return NextResponse.json({ success: true, users: [] });
    }
    
    const allUsers = querySnapshot.docs.map(doc => {
        const userData = doc.data() as User;
        return {
            uid: doc.id,
            name: userData.name,
            email: userData.email,
            misId: userData.misId || 'N/A',
        };
    });

    const filteredUsers = allUsers
        .filter(user => user.name.toLowerCase().includes(lowercasedName))
        .slice(0, 10); // Limit results to 10

    return NextResponse.json({ success: true, users: filteredUsers });

  } catch (error: any) {
    console.error("Error finding users by name:", error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
