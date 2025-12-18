
'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/config';
import type { ProjectRecruitment, User } from '@/types';
import Link from 'next/link';

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
        }
    }, []);

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
                {/* List existing job postings here */}
            </div>
        </div>
    );
}
