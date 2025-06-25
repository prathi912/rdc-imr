import { ProjectList } from '@/components/projects/project-list';
import { type Project } from '@/types';

const pendingProjects: Project[] = [
    {
      id: 'proj-001',
      title: 'AI in Sustainable Agriculture',
      department: 'Computer Science',
      pi: 'Dr. Alice Johnson',
      status: 'Under Review',
      abstract: 'This project explores the application of machine learning models to optimize irrigation and reduce water consumption in large-scale farming.',
      type: 'Research',
      teamInfo: 'PI: Dr. Alice Johnson, Co-PI: Dr. Bob Williams, Students: Carol White, Dave Green',
      timelineAndOutcomes: '6-month project with expected publication in a top journal.'
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

const completedProjects: Project[] = [
    {
      id: 'proj-005',
      title: 'Urban Mobility Study',
      department: 'Civil Engineering',
      pi: 'Dr. Grace Lee',
      status: 'Approved',
      abstract: 'A study on traffic flow in metropolitan areas using sensor data.',
      type: 'Research',
      teamInfo: 'PI: Dr. Grace Lee',
      timelineAndOutcomes: 'Project completed and report submitted.'
    },
];

export function EvaluatorDashboard() {
  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-3xl font-bold tracking-tight">Evaluator Dashboard</h2>
      <div className="flex flex-col gap-6">
        <ProjectList title="Pending Reviews" projects={pendingProjects} userRole="evaluator" />
        <ProjectList title="Completed Reviews" projects={completedProjects} userRole="evaluator" />
      </div>
    </div>
  );
}
