
'use client';

import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import type { Project, User } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function EvaluatorDashboardPage() {
  const [projectsToReview, setProjectsToReview] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
     const storedUser = localStorage.getItem('user');
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
  }, []);

  useEffect(() => {
    if (!user) return;
    
    async function getProjects() {
      setLoading(true);
      try {
        const projectsCol = collection(db, 'projects');
        const q = query(
          projectsCol,
          where('status', '==', 'Under Review'),
          orderBy('submissionDate', 'desc')
        );
        const projectSnapshot = await getDocs(q);
        const projectList = projectSnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id,
        } as Project));

        // Filter out projects the evaluator has already reviewed
        const pendingForCurrentUser = projectList.filter(p => 
            !p.evaluatedBy?.includes(user.uid)
        );

        setProjectsToReview(pendingForCurrentUser);
      } catch (error) {
        console.error("Error fetching projects for evaluation: ", error);
      } finally {
        setLoading(false);
      }
    }
    getProjects();
  }, [user]);

  const filteredProjects = useMemo(() => {
    if (!searchTerm) return projectsToReview;
    return projectsToReview.filter(p => 
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.pi.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [projectsToReview, searchTerm]);

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Evaluation Queue" description="Projects awaiting your review and evaluation." showBackButton={false} />
      <div className="flex items-center py-4">
        <Input
            placeholder="Filter by title or PI..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="max-w-sm"
        />
      </div>
      <div className="mt-4">
        {loading ? (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </CardContent>
          </Card>
        ) : filteredProjects.length > 0 ? (
          <ProjectList projects={filteredProjects} userRole="Evaluator" />
        ) : (
           <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              There are no projects currently awaiting your evaluation.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
