'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/config';
import type { Project, User } from '@/types';
import { PageHeader } from '@/components/page-header';
import { ProjectDetailsClient } from '@/components/projects/project-details-client';
import { ProjectSummary } from '@/components/projects/project-summary';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export default function ProjectDetailsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    
    async function getProjectAndUsers(id: string) {
      setLoading(true);
      try {
          const projectRef = doc(db, 'projects', id);
          const usersRef = collection(db, 'users');

          const [projectSnap, usersSnap] = await Promise.all([
            getDoc(projectRef),
            getDocs(usersRef),
          ]);

          if (!projectSnap.exists()) {
              setNotFound(true);
              return;
          }
          
          const data = projectSnap.data();
          setProject({ 
              id: projectSnap.id,
              ...data,
              submissionDate: data.submissionDate || new Date().toISOString()
          } as Project);

          const userList = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
          setAllUsers(userList);

      } catch (error) {
          console.error("Error fetching project data:", error);
          setNotFound(true); // Or handle error differently
      } finally {
        setLoading(false);
      }
    }
    getProjectAndUsers(projectId);
  }, [projectId]);


  if (loading) {
     return (
        <div className="container mx-auto py-10">
             <PageHeader 
                title="Project Details"
                description="Loading project details..."
             />
             <div className="mt-8">
                <Card>
                    <CardContent className="p-6">
                        <Skeleton className="h-[400px] w-full" />
                    </CardContent>
                </Card>
             </div>
        </div>
     )
  }

  if (notFound || !project) {
    return (
      <div className="container mx-auto py-10 text-center">
        <PageHeader 
          title="Project Not Found"
          description="The project you are looking for does not exist."
          backButtonHref="/dashboard/all-projects"
          backButtonText="Back to Projects"
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <PageHeader 
        title="Project Details"
        description="View project details and manage its status."
        backButtonHref="/dashboard/all-projects"
        backButtonText="Back to Projects"
      >
        <ProjectSummary project={project} />
      </PageHeader>
      <div className="mt-8">
        <ProjectDetailsClient project={project} allUsers={allUsers} />
      </div>
    </div>
  );
}
