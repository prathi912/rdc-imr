
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    // This route is no longer used. Client-side export is now handled directly.
    return NextResponse.json({ success: false, error: 'This API route is deprecated.' }, { status: 410 });
}
