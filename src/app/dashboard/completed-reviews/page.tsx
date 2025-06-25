import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { projects } from '@/lib/data';

const completedProjects = projects.filter(p => p.status === 'Approved' || p.status === 'Rejected' || p.status === 'Completed');

export default function CompletedReviewsPage() {
  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Completed Reviews" description="Projects that have already been reviewed and finalized." />
      <div className="mt-8">
        <ProjectList projects={completedProjects} userRole="admin" />
      </div>
    </div>
  );
}
