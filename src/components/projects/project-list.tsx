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

interface ProjectListProps {
  projects: Project[];
  userRole: User['role'];
}

const statusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
  'Approved': 'default',
  'In Progress': 'default',
  'Under Review': 'secondary',
  'Rejected': 'destructive',
  'Completed': 'outline'
};


export function ProjectList({ projects, userRole }: ProjectListProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead className="hidden md:table-cell">Department</TableHead>
              <TableHead className="hidden sm:table-cell">PI</TableHead>
              <TableHead className="hidden md:table-cell">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.id}>
                <TableCell className="font-medium">{project.title}</TableCell>
                <TableCell className="hidden md:table-cell">{project.department}</TableCell>
                <TableCell className="hidden sm:table-cell">{project.pi}</TableCell>
                <TableCell className="hidden md:table-cell">
                  <Badge variant={statusVariant[project.status] || 'secondary'}>{project.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link href={`/dashboard/project/${project.id}`}>
                      <Button variant="outline" size="icon" aria-label="View Project Details">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                    {userRole === 'admin' && <ProjectSummary project={project} />}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
