import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { type Project } from '@/types';

// Sample data - in a real app this would be fetched for the logged-in user
const myProjects: Project[] = [
    {
      id: 'proj-001',
      title: 'My Research on Quantum Entanglement',
      department: 'Physics',
      pi: 'Self',
      status: 'Under Review',
      abstract: 'An investigation into the nature of quantum entanglement.',
      type: 'Research',
      teamInfo: 'PI: Me',
      timelineAndOutcomes: 'Ongoing'
    },
    {
      id: 'proj-002',
      title: 'A Novel Approach to Machine Learning',
      department: 'Computer Science',
      pi: 'Self',
      status: 'Approved',
      abstract: 'Developing a new algorithm for neural networks.',
      type: 'Development',
      teamInfo: 'PI: Me',
      timelineAndOutcomes: 'Ongoing'
    },
    {
      id: 'proj-006',
      title: 'Completed Study on Graphene',
      department: 'Physics',
      pi: 'Self',
      status: 'Completed',
      abstract: 'A study on the properties of graphene.',
      type: 'Research',
      teamInfo: 'PI: Me',
      timelineAndOutcomes: 'Completed'
    },
    {
      id: 'proj-007',
      title: 'Rejected Proposal on Water Desalination',
      department: 'Engineering',
      pi: 'Self',
      status: 'Rejected',
      abstract: 'A novel method for low-cost water desalination.',
      type: 'Research',
      teamInfo: 'PI: Me',
      timelineAndOutcomes: 'Proposal rejected due to budget constraints.'
    },
];

export default function MyProjectsPage() {
  return (
    <div className="container mx-auto py-10">
      <PageHeader title="My Projects" description="A list of all projects you have submitted." />
      <div className="mt-8">
        <ProjectList projects={myProjects} userRole="faculty" />
      </div>
    </div>
  );
}
