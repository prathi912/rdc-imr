import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/admin';
import type { FundingCall, EmrInterest, EmrEvaluation, User } from '@/types';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        const callId = searchParams.get('callId');
        const includeEvaluations = searchParams.get('includeEvaluations') === 'true';
        const includeUsers = searchParams.get('includeUsers') === 'true';

        // Fetch funding calls
        if (callId) {
            // If specific callId is provided, fetch only that call
            const callDoc = await adminDb.collection('fundingCalls').doc(callId).get();
            if (!callDoc.exists) {
                return NextResponse.json({ success: false, error: 'Funding call not found' }, { status: 404 });
            }
            const callData = { id: callDoc.id, ...callDoc.data() } as FundingCall;

            // Fetch interests for this specific call
            const interestsSnapshot = await adminDb.collection('emrInterests')
                .where('callId', '==', callId)
                .get();
            const interests = interestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));

            // Fetch evaluations if requested
            let evaluations: EmrEvaluation[] = [];
            if (includeEvaluations) {
                for (const interest of interests) {
                    const evaluationsSnapshot = await adminDb.collection('emrInterests').doc(interest.id).collection('evaluations').get();
                    const interestEvaluations = evaluationsSnapshot.docs.map(doc => doc.data() as EmrEvaluation);
                    evaluations.push(...interestEvaluations);
                }
            }

            // Fetch user details if requested
            let users: User[] = [];
            if (includeUsers) {
                const userIds = [...new Set(interests.map(i => i.userId))];
                if (userIds.length > 0) {
                    const usersSnapshot = await adminDb.collection('users').where('__name__', 'in', userIds).get();
                    users = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
                }
            }

            return NextResponse.json({
                success: true,
                data: {
                    call: callData,
                    interests,
                    evaluations: includeEvaluations ? evaluations : undefined,
                    users: includeUsers ? users : undefined
                }
            });
        } else {
            // Fetch all funding calls
            const callsSnapshot = await adminDb.collection('fundingCalls')
                .orderBy('interestDeadline', 'desc')
                .get();
            const calls = callsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingCall));

            // If userId is provided, fetch interests for that user
            let interests: EmrInterest[] = [];
            if (userId) {
                const interestsSnapshot = await adminDb.collection('emrInterests')
                    .where('userId', '==', userId)
                    .get();
                interests = interestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));
            } else {
                // Fetch all interests
                const interestsSnapshot = await adminDb.collection('emrInterests').get();
                interests = interestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));
            }

            // Fetch evaluations if requested
            let evaluations: EmrEvaluation[] = [];
            if (includeEvaluations) {
                for (const interest of interests) {
                    const evaluationsSnapshot = await adminDb.collection('emrInterests').doc(interest.id).collection('evaluations').get();
                    const interestEvaluations = evaluationsSnapshot.docs.map(doc => doc.data() as EmrEvaluation);
                    evaluations.push(...interestEvaluations);
                }
            }

            // Fetch user details if requested
            let users: User[] = [];
            if (includeUsers) {
                const userIds = [...new Set(interests.map(i => i.userId))];
                if (userIds.length > 0) {
                    const usersSnapshot = await adminDb.collection('users').where('__name__', 'in', userIds).get();
                    users = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
                }
            }

            return NextResponse.json({
                success: true,
                data: {
                    calls,
                    interests,
                    evaluations: includeEvaluations ? evaluations : undefined,
                    users: includeUsers ? users : undefined
                }
            });
        }
    } catch (error: any) {
        console.error('Error fetching EMR details:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { userId, callId, includeEvaluations = false, includeUsers = false } = body;

        // Fetch funding calls
        if (callId) {
            // If specific callId is provided, fetch only that call
            const callDoc = await adminDb.collection('fundingCalls').doc(callId).get();
            if (!callDoc.exists) {
                return NextResponse.json({ success: false, error: 'Funding call not found' }, { status: 404 });
            }
            const callData = { id: callDoc.id, ...callDoc.data() } as FundingCall;

            // Fetch interests for this specific call
            const interestsSnapshot = await adminDb.collection('emrInterests')
                .where('callId', '==', callId)
                .get();
            const interests = interestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));

            // Fetch evaluations if requested
            let evaluations: EmrEvaluation[] = [];
            if (includeEvaluations) {
                for (const interest of interests) {
                    const evaluationsSnapshot = await adminDb.collection('emrInterests').doc(interest.id).collection('evaluations').get();
                    const interestEvaluations = evaluationsSnapshot.docs.map(doc => doc.data() as EmrEvaluation);
                    evaluations.push(...interestEvaluations);
                }
            }

            // Fetch user details if requested
            let users: User[] = [];
            if (includeUsers) {
                const userIds = [...new Set(interests.map(i => i.userId))];
                if (userIds.length > 0) {
                    const usersSnapshot = await adminDb.collection('users').where('__name__', 'in', userIds).get();
                    users = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
                }
            }

            return NextResponse.json({
                success: true,
                data: {
                    call: callData,
                    interests,
                    evaluations: includeEvaluations ? evaluations : undefined,
                    users: includeUsers ? users : undefined
                }
            });
        } else {
            // Fetch all funding calls
            const callsSnapshot = await adminDb.collection('fundingCalls')
                .orderBy('interestDeadline', 'desc')
                .get();
            const calls = callsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingCall));

            // If userId is provided, fetch interests for that user
            let interests: EmrInterest[] = [];
            if (userId) {
                const interestsSnapshot = await adminDb.collection('emrInterests')
                    .where('userId', '==', userId)
                    .get();
                interests = interestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));
            } else {
                // Fetch all interests
                const interestsSnapshot = await adminDb.collection('emrInterests').get();
                interests = interestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));
            }

            // Fetch evaluations if requested
            let evaluations: EmrEvaluation[] = [];
            if (includeEvaluations) {
                for (const interest of interests) {
                    const evaluationsSnapshot = await adminDb.collection('emrInterests').doc(interest.id).collection('evaluations').get();
                    const interestEvaluations = evaluationsSnapshot.docs.map(doc => doc.data() as EmrEvaluation);
                    evaluations.push(...interestEvaluations);
                }
            }

            // Fetch user details if requested
            let users: User[] = [];
            if (includeUsers) {
                const userIds = [...new Set(interests.map(i => i.userId))];
                if (userIds.length > 0) {
                    const usersSnapshot = await adminDb.collection('users').where('__name__', 'in', userIds).get();
                    users = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
                }
            }

            return NextResponse.json({
                success: true,
                data: {
                    calls,
                    interests,
                    evaluations: includeEvaluations ? evaluations : undefined,
                    users: includeUsers ? users : undefined
                }
            });
        }
    } catch (error: any) {
        console.error('Error fetching EMR details:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
} 
