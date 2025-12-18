
'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/config';
import type { ProjectRecruitment, User } from '@/types';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

export default function PostAJobPage() {
    const [user, setUser] = useState<User | null>(null);
    const [postings, setPostings] = useState<ProjectRecruitment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
            
            const fetchPostings = async () => {
                const q = query(
                    collection(db, 'projectRecruitments'),
                    where('postedByUid', '==', parsedUser.uid),
                    orderBy('createdAt', 'desc')
                );
                const querySnapshot = await getDocs(q);
                setPostings(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProjectRecruitment)));
                setLoading(false);
            };
            fetchPostings();
        } else {
            setLoading(false);
        }
    }, []);

    const getStatusVariant = (status: ProjectRecruitment['status']) => {
        switch (status) {
            case 'Approved': return 'default';
            case 'Pending Approval': return 'secondary';
            case 'Rejected': return 'destructive';
            case 'Closed': return 'outline';
            default: return 'secondary';
        }
    };

    return (
        <div className="container mx-auto py-10">
            <PageHeader title="Post a Job Opening" description="Create and manage job postings for your research projects.">
                <Button asChild>
                    <Link href="/dashboard/post-a-job/new">
                        <Plus className="mr-2 h-4 w-4" /> Create New Posting
                    </Link>
                </Button>
            </PageHeader>
            <div className="mt-8">
                <Card>
                    <CardHeader>
                        <CardTitle>My Job Postings</CardTitle>
                        <CardDescription>A history of all the job openings you have created.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="space-y-4">
                                <Skeleton className="h-24 w-full" />
                                <Skeleton className="h-24 w-full" />
                            </div>
                        ) : postings.length > 0 ? (
                            <div className="space-y-4">
                                {postings.map(job => (
                                    <div key={job.id} className="border p-4 rounded-lg flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                        <div>
                                            <p className="font-semibold">{job.positionTitle}</p>
                                            <p className="text-sm text-muted-foreground">For: {job.projectName}</p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Created: {format(new Date(job.createdAt), 'PPP')} | Deadline: {format(new Date(job.applicationDeadline), 'PPP')}
                                            </p>
                                        </div>
                                        <Badge variant={getStatusVariant(job.status)}>{job.status}</Badge>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-10 text-muted-foreground">
                                You have not created any job postings yet.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
