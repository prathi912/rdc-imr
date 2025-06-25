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
      id: 'proj-003',
      title: 'Biomarkers for Early Cancer Detection',
      abstract: 'Identifying novel protein biomarkers in blood samples for the early diagnosis of pancreatic cancer using proteomics.',
      department: 'Medical Research',
      pi: 'Dr. Eve Davis',
      status: 'Rejected',
      type: 'Clinical Trial',
      teamInfo: 'PI: Dr. Eve Davis',
      timelineAndOutcomes: '2-year clinical study with three phases.'
    },
];

const completedProjects = allProjects.filter(p => p.status === 'Approved' || p.status === 'Rejected');

export default function CompletedReviewsPage() {
  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Completed Reviews" description="Projects that have already been reviewed." />
      <div className="mt-8">
        <ProjectList projects={completedProjects} userRole="admin" />
      </div>
    </div>
  );
}
