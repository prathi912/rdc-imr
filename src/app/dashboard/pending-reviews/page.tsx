import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { type Project } from '@/types';

const allProjects: Project[] = [
    {
      id: 'proj-001',
      title: 'AI in Sustainable Agriculture',
      abstract: 'This project explores the application of machine learning models to optimize irrigation and reduce water consumption in large-scale farming.',
      department: 'Computer Science',
      pi: 'Dr. Alice Johnson',
      status: 'Under Review',
      type: 'Research',
      teamInfo: 'PI: Dr. Alice Johnson, Co-PI: Dr. Bob Williams, Students: Carol White, Dave Green',
      timelineAndOutcomes: '6-month project with expected publication in a top journal.'
    },
    {
      id: 'proj-002',
      title: 'Advanced Materials for Solar Cells',
      abstract: 'Development of new perovskite materials to enhance the efficiency and stability of next-generation solar panels.',
      department: 'Physics',
      pi: 'Dr. Charlie Brown',
      status: 'Approved',
      type: 'Development',
      teamInfo: 'PI: Dr. Charlie Brown',
      timelineAndOutcomes: '1-year project, aiming for a patent and a prototype.'
    },
    {
      id: 'proj-004',
      title: 'Quantum Computing Algorithms',
      department: 'Physics',
      pi: 'Dr. Frank Miller',
      status: 'Under Review',
      abstract: 'Developing new quantum algorithms for optimization problems.',
      type: 'Theoretical',
      teamInfo: 'PI: Dr. Frank Miller',
      timelineAndOutcomes: 'Aiming for a publication in Physical Review Letters.'
    },
];

const pendingProjects = allProjects.filter(p => p.status === 'Under Review');

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
