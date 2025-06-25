'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Project } from '@/types';
import { PageHeader } from '@/components/page-header';
import { ProjectDetailsClient } from '@/components/projects/project-details-client';
import { ProjectSummary } from '@/components/projects/project-summary';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export default function ProjectDetailsPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function getProject(projectId: string) {
      setLoading(true);
      try {
          const projectRef = doc(db, 'projects', projectId);
          const projectSnap = await getDoc(projectRef);

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
      } catch (error) {
          console.error("Error fetching project:", error);
          setNotFound(true); // Or handle error differently
      } finally {
        setLoading(false);
      }
    }
    getProject(params.id);
  }, [params.id]);


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
        <ProjectDetailsClient project={project} />
      </div>
    </div>
  );
}
