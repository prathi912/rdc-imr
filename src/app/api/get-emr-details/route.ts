import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/admin';
import type { FundingCall } from '@/types';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const callId = searchParams.get('callId');

        if (callId) {
            // If specific callId is provided, fetch only that call
            const callDoc = await adminDb.collection('fundingCalls').doc(callId).get();
            if (!callDoc.exists) {
                return NextResponse.json({ success: false, error: 'Funding call not found' }, { status: 404 });
            }
            const callData = callDoc.data() as FundingCall;

            // Return only the requested fields
            const filteredCall = {
                id: callDoc.id,
                title: callData.title,
                agency: callData.agency,
                callType: callData.callType,
                applyDeadline: callData.applyDeadline,
                interestDeadline: callData.interestDeadline,
                attachments: callData.attachments
            };

            return NextResponse.json({
                success: true,
                data: {
                    call: filteredCall
                }
            });
        } else {
            // Fetch all funding calls
            const callsSnapshot = await adminDb.collection('fundingCalls')
                .orderBy('interestDeadline', 'desc')
                .get();

            const calls = callsSnapshot.docs.map(doc => {
                const callData = doc.data() as FundingCall;
                return {
                    id: doc.id,
                    title: callData.title,
                    agency: callData.agency,
                    callType: callData.callType,
                    applyDeadline: callData.applyDeadline,
                    interestDeadline: callData.interestDeadline,
                    attachments: callData.attachments
                };
            });

            return NextResponse.json({
                success: true,
                data: {
                    calls
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
        const { callId } = body;

        if (callId) {
            // If specific callId is provided, fetch only that call
            const callDoc = await adminDb.collection('fundingCalls').doc(callId).get();
            if (!callDoc.exists) {
                return NextResponse.json({ success: false, error: 'Funding call not found' }, { status: 404 });
            }
            const callData = callDoc.data() as FundingCall;

            // Return only the requested fields
            const filteredCall = {
                id: callDoc.id,
                title: callData.title,
                agency: callData.agency,
                callType: callData.callType,
                applyDeadline: callData.applyDeadline,
                interestDeadline: callData.interestDeadline,
                attachments: callData.attachments
            };

            return NextResponse.json({
                success: true,
                data: {
                    call: filteredCall
                }
            });
        } else {
            // Fetch all funding calls
            const callsSnapshot = await adminDb.collection('fundingCalls')
                .orderBy('interestDeadline', 'desc')
                .get();

            const calls = callsSnapshot.docs.map(doc => {
                const callData = doc.data() as FundingCall;
                return {
                    id: doc.id,
                    title: callData.title,
                    agency: callData.agency,
                    callType: callData.callType,
                    applyDeadline: callData.applyDeadline,
                    interestDeadline: callData.interestDeadline,
                    attachments: callData.attachments
                };
            });

            return NextResponse.json({
                success: true,
                data: {
                    calls
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
