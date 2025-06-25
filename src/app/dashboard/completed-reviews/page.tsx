import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import type { Project } from '@/types';

async function getCompletedProjects(): Promise<Project[]> {
  try {
    const projectsCol = collection(db, 'projects');
    const q = query(
      projectsCol, 
      where('status', 'in', ['Approved', 'Rejected', 'Completed']),
      orderBy('submissionDate', 'desc')
    );
    const projectSnapshot = await getDocs(q);
    const projectList = projectSnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
    } as Project));
    return projectList;
  } catch (error) {
    console.error("Error fetching completed projects: ", error);
    return [];
  }
}

export default async function CompletedReviewsPage() {
  const completedProjects = await getCompletedProjects();

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Completed Reviews" description="Projects that have already been reviewed and finalized." />
      <div className="mt-8">
        <ProjectList projects={completedProjects} userRole="admin" />
      </div>
    </div>
  );
}
