
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/admin';
import type { User } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');

    if (!name || name.trim().length < 3) {
      return NextResponse.json({ success: false, error: 'A name with at least 3 characters is required.' }, { status: 400 });
    }

    const lowercasedName = name.toLowerCase();
    
    const usersRef = adminDb.collection('users');
    // Firestore does not support case-insensitive "starts-with" queries directly.
    // This query is a common workaround: it finds all documents where the field
    // is greater than or equal to the search term and less than the search term + a high-value character.
    // It's case-sensitive, so we'll do an additional client-side filter or rely on users typing names correctly.
    // For a more robust solution, a searchable lowercase field would be needed in the database.
    const q = usersRef
      .orderBy('name')
      .startAt(name)
      .endAt(name + '\uf8ff')
      .limit(10);
      
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      // Try a case-insensitive search if the first one fails by searching lowercase names.
      // This requires a 'name_lowercase' field in your Firestore documents for optimal performance.
      // As a fallback, we will fetch and filter in memory, but this is not scalable.
      // For this implementation, we will stick to the case-sensitive search.
      return NextResponse.json({ success: true, users: [] });
    }
    
    const users = querySnapshot.docs.map(doc => {
        const userData = doc.data() as User;
        return {
            uid: doc.id,
            name: userData.name,
            email: userData.email,
            misId: userData.misId || 'N/A',
        };
    });

    return NextResponse.json({ success: true, users });

  } catch (error: any) {
    console.error("Error finding users by name:", error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
