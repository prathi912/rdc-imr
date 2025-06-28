
'use client';

import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import type { Project } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function PendingReviewsPage() {
  const [pendingProjects, setPendingProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function getPendingProjects() {
      try {
        const projectsCol = collection(db, 'projects');
        const q = query(
          projectsCol, 
          where('status', 'in', ['Under Review', 'Pending Completion Approval']),
          orderBy('submissionDate', 'desc')
        );
        const projectSnapshot = await getDocs(q);
        const projectList = projectSnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id,
        } as Project));
        setPendingProjects(projectList);
      } catch (error) {
        console.error("Error fetching pending projects: ", error);
      } finally {
        setLoading(false);
      }
    }
    getPendingProjects();
  }, []);

  const filteredProjects = useMemo(() => {
    if (!searchTerm) return pendingProjects;
    return pendingProjects.filter(p => 
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.pi.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [pendingProjects, searchTerm]);

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Pending Reviews" description="Projects awaiting initial review or completion approval." />
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
        ) : (
          <ProjectList projects={filteredProjects} userRole="admin" />
        )}
      </div>
    </div>
  );
}
