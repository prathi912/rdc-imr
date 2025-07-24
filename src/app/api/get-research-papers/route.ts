import { NextRequest, NextResponse } from 'next/server';
import { fetchResearchPapersByUserUid } from '@/app/actions';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userUid = searchParams.get('userUid');
        const userEmail = searchParams.get('userEmail');

        if (!userUid || !userEmail) {
            return NextResponse.json({ success: false, error: 'User UID and Email are required parameters.' }, { status: 400 });
        }
        
        const result = await fetchResearchPapersByUserUid(userUid, userEmail);

        if (result.success) {
            return NextResponse.json({ success: true, papers: result.papers });
        } else {
            return NextResponse.json({ success: false, error: result.error }, { status: 500 });
        }
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
