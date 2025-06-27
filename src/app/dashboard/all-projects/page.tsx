'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import type { Project, User } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export default function AllProjectsPage() {
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    async function getProjects() {
      setLoading(true);
      try {
        const projectsCol = collection(db, 'projects');
        let q;

        const isAdmin = ['admin', 'Super-admin'].includes(user.role);
        const isCro = user.role === 'CRO';

        if (isAdmin) {
          q = query(projectsCol, orderBy('submissionDate', 'desc'));
        } else if (isCro) {
          q = query(
            projectsCol, 
            where('faculty', '==', user.faculty),
            orderBy('submissionDate', 'desc')
          );
        } else {
          setAllProjects([]);
          setLoading(false);
          return;
        }

        const projectSnapshot = await getDocs(q);
        const projectList = projectSnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id,
        } as Project));
        setAllProjects(projectList);
      } catch (error) {
        console.error("Error fetching projects: ", error);
      } finally {
        setLoading(false);
      }
    }
    getProjects();
  }, [user]);
  
  const isCro = user?.role === 'CRO';
  const pageTitle = isCro ? `Projects from ${user?.faculty}` : "All Projects";
  const pageDescription = isCro ? "Browse all projects submitted from your faculty." : "Browse and manage all projects in the system.";

  return (
    <div className="container mx-auto py-10">
      <PageHeader title={pageTitle} description={pageDescription} />
      <div className="mt-8">
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
          <ProjectList projects={allProjects} userRole={user!.role} />
        )}
      </div>
    </div>
  );
}
