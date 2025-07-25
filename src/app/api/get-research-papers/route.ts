
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

        // Firestore cannot query for a value within an object inside an array with a simple 'array-contains'.
        // The correct approach is to query on individual fields within the array of objects.
        // We perform two separate queries and merge the results client-side.
        
        const byUidQuery = papersRef.where('authors.uid', '==', userUid);
        const byEmailQuery = papersRef.where('authors.email', '==', userEmail);

        const [byUidSnapshot, byEmailSnapshot] = await Promise.all([
            byUidQuery.get(),
            byEmailQuery.get(),
        ]);
        
        // Use a Map to automatically handle duplicates. If a paper is found by both UID and email, it will only be added once.
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
