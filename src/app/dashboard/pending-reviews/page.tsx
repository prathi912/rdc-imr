import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { projects } from '@/lib/data';

const pendingProjects = projects.filter(p => p.status === 'Under Review');

export default function PendingReviewsPage() {
  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Pending Reviews" description="Projects awaiting review and approval." />
      <div className="mt-8">
        <ProjectList projects={pendingProjects} userRole="admin" />
      </div>
    </div>
  );
}
