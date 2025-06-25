import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import type { Project } from '@/types';

async function getProjects(): Promise<Project[]> {
  try {
    const projectsCol = collection(db, 'projects');
    const q = query(projectsCol, orderBy('submissionDate', 'desc'));
    const projectSnapshot = await getDocs(q);
    const projectList = projectSnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
    } as Project));
    return projectList;
  } catch (error) {
    console.error("Error fetching projects: ", error);
    return [];
  }
}

export default async function AllProjectsPage() {
  const allProjects = await getProjects();
  
  return (
    <div className="container mx-auto py-10">
      <PageHeader title="All Projects" description="Browse and manage all projects in the system." />
      <div className="mt-8">
        <ProjectList projects={allProjects} userRole="admin" />
      </div>
    </div>
  );
}
