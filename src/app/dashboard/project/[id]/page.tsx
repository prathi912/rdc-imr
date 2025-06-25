import { notFound } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Project } from '@/types';
import { PageHeader } from '@/components/page-header';
import { ProjectDetailsClient } from '@/components/projects/project-details-client';
import { ProjectSummary } from '@/components/projects/project-summary';

async function getProject(projectId: string): Promise<Project | null> {
    try {
        const projectRef = doc(db, 'projects', projectId);
        const projectSnap = await getDoc(projectRef);

        if (!projectSnap.exists()) {
            return null;
        }
        
        const data = projectSnap.data();
        return { 
            id: projectSnap.id,
            ...data,
            submissionDate: data.submissionDate || new Date().toISOString()
        } as Project;
    } catch (error) {
        console.error("Error fetching project:", error);
        return null;
    }
}

export default async function ProjectDetailsPage({ params }: { params: { id: string } }) {
  const project = await getProject(params.id);

  if (!project) {
    notFound();
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
