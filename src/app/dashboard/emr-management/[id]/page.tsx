
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { EmrManagementClient } from '@/components/emr/emr-management-client';
import { db } from '@/lib/config';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import type { FundingCall, EmrInterest, User } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

export default function EmrCallDetailsPage() {
    const params = useParams();
    const callId = params.id as string;
    const router = useRouter();
    const { toast } = useToast();

    const [call, setCall] = useState<FundingCall | null>(null);
    const [interests, setInterests] = useState<EmrInterest[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        if (!callId) return;
        setLoading(true);
        try {
            const callRef = doc(db, 'fundingCalls', callId);
            const callSnap = await getDoc(callRef);
            if (!callSnap.exists()) {
                toast({ variant: 'destructive', title: 'Error', description: 'Funding call not found.' });
                router.push('/dashboard/emr-management');
                return;
            }
            const callData = { id: callSnap.id, ...callSnap.data() } as FundingCall;
            setCall(callData);

            // Fetch interests
            const interestsQuery = query(collection(db, 'emrInterests'), where('callId', '==', callId), orderBy('registeredAt', 'desc'));
            const interestsSnapshot = await getDocs(interestsQuery);
            setInterests(interestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest)));

            // Fetch all users to map names, etc.
            const usersQuery = query(collection(db, 'users'));
            const usersSnapshot = await getDocs(usersQuery);
            setAllUsers(usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User)));
        
        } catch (error) {
            console.error("Error fetching call details:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch call details.' });
        } finally {
            setLoading(false);
        }
    }, [callId, router, toast]);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setCurrentUser(JSON.parse(storedUser));
        }
        fetchData();
    }, [fetchData]);


    if (loading || !call || !currentUser) {
        return (
            <div className="container mx-auto py-10">
                <PageHeader title="Loading Registrations..." description="Please wait..." backButtonHref="/dashboard/emr-management" backButtonText="Back to EMR Management"/>
                <div className="mt-8">
                    <Skeleton className="h-96 w-full" />
                </div>
            </div>
        );
    }
    

    return (
        <div className="container mx-auto py-10">
            <PageHeader
                title={call.title}
                description={`Manage registrations and schedule meetings for this call. Agency: ${call.agency}`}
                backButtonHref="/dashboard/emr-management"
                backButtonText="Back to All Calls"
            />
            <div className="mt-8">
                <EmrManagementClient
                    call={call}
                    interests={interests}
                    allUsers={allUsers}
                    currentUser={currentUser}
                    onActionComplete={fetchData}
                />
            </div>
        </div>
    );
}
