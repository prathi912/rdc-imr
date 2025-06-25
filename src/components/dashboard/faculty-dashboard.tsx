import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProjectList } from '@/components/projects/project-list';
import { FilePlus2, CheckCircle, Clock, ArrowRight } from 'lucide-react';
import { type Project } from '@/types';

const statCards = [
  { title: 'Active Projects', value: '3', icon: FilePlus2 },
  { title: 'Pending Approval', value: '1', icon: Clock },
  { title: 'Completed Projects', value: '8', icon: CheckCircle },
];

const sampleProjects: Project[] = [
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
];

export function FacultyDashboard() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-3xl font-bold tracking-tight">My Dashboard</h2>
        <Link href="/dashboard/new-submission">
          <Button>
            <FilePlus2 className="mr-2 h-4 w-4" />
            New Submission
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div>
         <div className="mb-4 flex items-center justify-between">
            <h3 className="text-2xl font-bold tracking-tight">My Recent Projects</h3>
            <Link href="/dashboard/my-projects">
              <Button variant="ghost">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
        </div>
        <ProjectList projects={sampleProjects} userRole="faculty" />
      </div>
    </div>
  );
}
