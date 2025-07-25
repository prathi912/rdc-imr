
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/admin';
import type { ResearchPaper } from '@/types';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userUid = searchParams.get('userUid');

        if (!userUid) {
            return NextResponse.json({ success: false, error: 'User UID is a required parameter.' }, { status: 400 });
        }

        const papersRef = adminDb.collection("papers");

        // The correct and efficient way to query for this is to use an 'array-contains' query
        // on a dedicated array of author UIDs.
        const papersQuery = papersRef.where('authorUids', 'array-contains', userUid);
        
        const snapshot = await papersQuery.get();
        
        const papers = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as ResearchPaper))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return NextResponse.json({ success: true, papers });

    } catch (error: any) {
        console.error("Exception in GET /api/get-research-papers:", error);
        return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
