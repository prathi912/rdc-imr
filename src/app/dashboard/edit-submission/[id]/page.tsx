
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/config';
import type { Project } from '@/types';
import { PageHeader } from '@/components/page-header';
import { SubmissionForm } from '@/components/projects/submission-form';
import { Guidelines } from '@/components/projects/guidelines';
import { Skeleton } from '@/components/ui/skeleton';

export default function EditSubmissionPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const fetchProject = async () => {
      try {
        const projectRef = doc(db, 'projects', projectId);
        const projectSnap = await getDoc(projectRef);
        if (projectSnap.exists()) {
          setProject({ id: projectSnap.id, ...projectSnap.data() } as Project);
        } else {
          setError('Project draft not found.');
        }
      } catch (err) {
        setError('Failed to load project draft.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [projectId]);

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl py-10">
        <PageHeader title="Loading Draft..." description="Please wait..." backButtonHref="/dashboard/my-projects" backButtonText="Back to My Projects" />
        <div className="mt-8">
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto max-w-4xl py-10">
        <PageHeader title="Error" description={error} backButtonHref="/dashboard/my-projects" backButtonText="Back to My Projects" />
      </div>
    );
  }
  
  return (
    <div className="container mx-auto max-w-4xl py-10">
      <PageHeader
        title="Edit Project Submission"
        description="Continue editing your draft below."
        backButtonHref="/dashboard/my-projects"
        backButtonText="Back to My Projects"
      />
      <div className="mt-8 space-y-8">
        <Guidelines />
        <SubmissionForm project={project!} />
      </div>
    </div>
  );
}
