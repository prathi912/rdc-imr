
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/admin';
import type { ResearchPaper } from '@/types';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userUid = searchParams.get('userUid');
        const userEmail = searchParams.get('userEmail');

        if (!userUid || !userEmail) {
            return NextResponse.json({ success: false, error: 'User UID and Email are required parameters.' }, { status: 400 });
        }

        const papersRef = adminDb.collection("papers");

        // Note: Firestore does not support 'OR' queries on different fields directly in this complex way.
        // We perform two separate queries and merge the results. This is the correct approach.
        // The previous implementation using a single `array-contains` was flawed because it cannot match
        // fields within objects inside an array.

        const byUidQuery = papersRef.where("authors", "array-contains-any", [
            { uid: userUid, name: 'First Author', role: 'First Author', isExternal: false, email: userEmail },
            { uid: userUid, name: 'Corresponding Author', role: 'Corresponding Author', isExternal: false, email: userEmail },
            { uid: userUid, name: 'Co-Author', role: 'Co-Author', isExternal: false, email: userEmail }
        ]);

        const byEmailQuery = papersRef.where("authors", "array-contains-any", [
            { email: userEmail, name: 'First Author', role: 'First Author', isExternal: false },
            { email: userEmail, name: 'Corresponding Author', role: 'Corresponding Author', isExternal: false },
            { email: userEmail, name: 'Co-Author', role: 'Co-Author', isExternal: false },
            { email: userEmail, name: 'First Author', role: 'First Author', isExternal: true },
            { email: userEmail, name: 'Corresponding Author', role: 'Corresponding Author', isExternal: true },
            { email: userEmail, name: 'Co-Author', role: 'Co-Author', isExternal: true }
        ]);

        const [byUidSnapshot, byEmailSnapshot] = await Promise.all([
            papersRef.where('authors.uid', '==', userUid).get(),
            papersRef.where('authors.email', '==', userEmail).get(),
        ]);
        
        const papersMap = new Map<string, ResearchPaper>();
        
        byUidSnapshot.forEach(doc => {
            if (!papersMap.has(doc.id)) {
                papersMap.set(doc.id, { id: doc.id, ...doc.data() } as ResearchPaper);
            }
        });

        byEmailSnapshot.forEach(doc => {
            if (!papersMap.has(doc.id)) {
                papersMap.set(doc.id, { id: doc.id, ...doc.data() } as ResearchPaper);
            }
        });

        const papers = Array.from(papersMap.values())
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return NextResponse.json({ success: true, papers });

    } catch (error: any) {
        console.error("Exception in GET /api/get-research-papers:", error);
        return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
