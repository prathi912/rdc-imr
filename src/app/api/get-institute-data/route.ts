
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/config';

// This API route will be deprecated in favor of direct Firestore lookups.
// The file is kept to prevent build errors until all dependencies are removed.

export async function GET(request: NextRequest) {
    return NextResponse.json({ success: false, error: 'This API route is deprecated.' }, { status: 410 });
}
