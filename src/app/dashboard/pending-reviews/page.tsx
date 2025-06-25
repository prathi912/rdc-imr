import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import type { Project } from '@/types';

async function getPendingProjects(): Promise<Project[]> {
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
    return projectList;
  } catch (error) {
    console.error("Error fetching pending projects: ", error);
    return [];
  }
}

export default async function PendingReviewsPage() {
  const pendingProjects = await getPendingProjects();

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Pending Reviews" description="Projects awaiting review and approval." />
      <div className="mt-8">
        <ProjectList projects={pendingProjects} userRole="admin" />
      </div>
    </div>
  );
}
