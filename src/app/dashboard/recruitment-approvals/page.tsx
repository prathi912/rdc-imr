
'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/page-header';
import type { User, ProjectRecruitment } from '@/types';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, orderBy, doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Check, X } from 'lucide-react';
import { format } from 'date-fns';

export default function RecruitmentApprovalsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [pendingPostings, setPendingPostings] = useState<ProjectRecruitment[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    const fetchPendingPostings = useCallback(async () => {
        setLoading(true);
        try {
            const q = query(
                collection(db, 'projectRecruitments'),
                where('status', '==', 'Pending Approval'),
                orderBy('createdAt', 'desc')
            );
            const querySnapshot = await getDocs(q);
            setPendingPostings(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProjectRecruitment)));
        } catch (error) {
            console.error("Error fetching pending postings:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch job postings for approval.' });
        } finally {
            setLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
        fetchPendingPostings();
    }, [fetchPendingPostings]);

    const handleApproval = async (id: string, newStatus: 'Approved' | 'Rejected') => {
        try {
            const docRef = doc(db, 'projectRecruitments', id);
            await updateDoc(docRef, { status: newStatus, approvedAt: newStatus === 'Approved' ? new Date().toISOString() : null });
            toast({ title: `Posting ${newStatus}`, description: 'The job posting has been updated.' });
            fetchPendingPostings(); // Refresh list
        } catch (error) {
            toast({ variant: 'destructive', title: 'Update Failed' });
        }
    };

    if (loading) {
        return <div className="container mx-auto py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <div className="container mx-auto py-10">
            <PageHeader title="Recruitment Approvals" description="Review and approve new job postings for the public hiring page." />
            <div className="mt-8 space-y-4">
                {pendingPostings.length > 0 ? (
                    pendingPostings.map(job => (
                        <Card key={job.id}>
                            <CardHeader>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle>{job.positionTitle}</CardTitle>
                                        <CardDescription>For: {job.projectName} | Posted by: {job.postedByName}</CardDescription>
                                    </div>
                                     <div className="flex gap-2">
                                        <Button size="sm" onClick={() => handleApproval(job.id, 'Approved')}><Check className="mr-2 h-4 w-4"/>Approve</Button>
                                        <Button size="sm" variant="destructive" onClick={() => handleApproval(job.id, 'Rejected')}><X className="mr-2 h-4 w-4"/>Reject</Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm">{job.jobDescription}</p>
                                <div className="text-xs text-muted-foreground mt-2">Deadline: {format(new Date(job.applicationDeadline), 'PPP')}</div>
                            </CardContent>
                        </Card>
                    ))
                ) : (
                    <p className="text-muted-foreground text-center py-8">No job postings are currently pending approval.</p>
                )}
            </div>
        </div>
    );
}
