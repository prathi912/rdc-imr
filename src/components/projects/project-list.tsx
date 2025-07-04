
'use client';

import { useState, useMemo } from 'react';
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
import { Eye, ArrowUpDown, Edit } from 'lucide-react';
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
  'Draft': 'secondary',
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

  type SortableKeys = keyof Pick<Project, 'title' | 'faculty' | 'pi' | 'status'> | 'meetingDate';
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' }>({ key: 'title', direction: 'ascending' });

  const sortedProjects = useMemo(() => {
    let sortableItems = [...projects];
    sortableItems.sort((a, b) => {
        let aValue, bValue;
        const key = sortConfig.key;

        if (key === 'meetingDate') {
            aValue = a.meetingDetails?.date ? new Date(a.meetingDetails.date).getTime() : 0;
            bValue = b.meetingDetails?.date ? new Date(b.meetingDetails.date).getTime() : 0;
        } else {
            aValue = a[key as keyof Project] || '';
            bValue = b[key as keyof Project] || '';
        }

        if (aValue < bValue) {
            return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
            return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
    });
    return sortableItems;
  }, [projects, sortConfig]);

  const requestSort = (key: SortableKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
        direction = 'descending';
    }
    setSortConfig({ key, direction });
  };


  return (
    <Card>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button variant="ghost" onClick={() => requestSort('title')}>
                    Title <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
               {isEvaluator ? (
                <TableHead className="hidden md:table-cell">
                  <Button variant="ghost" onClick={() => requestSort('meetingDate')}>
                      Meeting Date <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
              ) : (
                <TableHead className="hidden md:table-cell">
                  <Button variant="ghost" onClick={() => requestSort('faculty')}>
                      Faculty <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
              )}
              <TableHead className="hidden sm:table-cell">
                <Button variant="ghost" onClick={() => requestSort('pi')}>
                    PI <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="hidden md:table-cell">
                <Button variant="ghost" onClick={() => requestSort('status')}>
                    Status <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedProjects.map((project) => {
              const meetingDate = project.meetingDetails?.date ? new Date(project.meetingDetails.date) : null;
             
              let actionButton;
              if (project.status === 'Draft') {
                actionButton = (
                  <Link href={`/dashboard/edit-submission/${project.id}`}>
                    <Button variant="outline" size="sm">
                      <Edit className="mr-2 h-4 w-4" />
                      Edit Draft
                    </Button>
                  </Link>
                );
              } else {
                actionButton = (
                   <Link href={`/dashboard/project/${project.id}`}>
                    <Button variant="outline" size="icon" aria-label="View Project Details">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </Link>
                )
              }

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
                      {actionButton}
                      {isAdmin && project.status !== 'Draft' && <ProjectSummary project={project} />}
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
