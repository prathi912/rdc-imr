import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { projects as allProjects } from '@/lib/data';

export default function AllProjectsPage() {
  return (
    <div className="container mx-auto py-10">
      <PageHeader title="All Projects" description="Browse and manage all projects in the system." />
      <div className="mt-8">
        <ProjectList projects={allProjects} userRole="admin" />
      </div>
    </div>
  );
}
