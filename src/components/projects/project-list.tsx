import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import { type Project, type User } from '@/types';
import { ProjectSummary } from './project-summary';
import Link from 'next/link';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ProjectListProps {
  projects: Project[];
  userRole: User['role'];
}

const statusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
  'Submitted': 'secondary',
  'Approved': 'default',
  'In Progress': 'default',
  'Under Review': 'secondary',
  'Rejected': 'destructive',
  'Completed': 'outline'
};


export function ProjectList({ projects, userRole }: ProjectListProps) {
  const isAdmin = ['admin', 'CRO', 'Super-admin'].includes(userRole);
  const isEvaluator = userRole === 'Evaluator';

  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
               {isEvaluator ? (
                <TableHead className="hidden md:table-cell">Meeting Date</TableHead>
              ) : (
                <TableHead className="hidden md:table-cell">Faculty</TableHead>
              )}
              <TableHead className="hidden sm:table-cell">PI</TableHead>
              <TableHead className="hidden md:table-cell">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => {
              const meetingDate = project.meetingDetails?.date ? new Date(project.meetingDetails.date) : null;
              let isToday = false;
              if (meetingDate) {
                const todayDate = new Date();
                isToday = todayDate.getFullYear() === meetingDate.getFullYear() &&
                          todayDate.getMonth() === meetingDate.getMonth() &&
                          todayDate.getDate() === meetingDate.getDate();
              }
              const evaluationEnabled = !isEvaluator || isToday;

              const viewAction = (
                <Link href={`/dashboard/project/${project.id}`} className={!evaluationEnabled ? 'pointer-events-none' : ''}>
                  <Button variant="outline" size="icon" aria-label="View Project Details" disabled={!evaluationEnabled}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </Link>
              );

              return (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">{project.title}</TableCell>
                   {isEvaluator ? (
                    <TableCell className="hidden md:table-cell">
                      {meetingDate ? meetingDate.toLocaleDateString() : 'Not Scheduled'}
                    </TableCell>
                  ) : (
                    <TableCell className="hidden md:table-cell">{project.faculty}</TableCell>
                  )}
                  <TableCell className="hidden sm:table-cell">{project.pi}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant={statusVariant[project.status] || 'secondary'}>{project.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                       {isEvaluator ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              {/* Span wrapper is necessary for tooltips on disabled elements */}
                              <span>{viewAction}</span> 
                            </TooltipTrigger>
                            {!evaluationEnabled && (
                              <TooltipContent>
                                <p>Evaluation opens on meeting day: {meetingDate?.toLocaleDateString()}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        viewAction
                      )}
                      {isAdmin && <ProjectSummary project={project} />}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
