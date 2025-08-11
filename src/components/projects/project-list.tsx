
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
import { parseISO } from 'date-fns';

interface ProjectListProps {
  projects: Project[];
  currentUser: User;
  allUsers?: User[];
}

const statusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
  'Draft': 'secondary',
  'Submitted': 'secondary',
  'Recommended': 'default',
  'In Progress': 'default',
  'Under Review': 'secondary',
  'Not Recommended': 'destructive',
  'Completed': 'outline'
};


export function ProjectList({ projects, currentUser, allUsers = [] }: ProjectListProps) {
  if (!currentUser) {
    return null; // Or a loading state
  }
  const userRole = currentUser.role;
  const isAdmin = ['admin', 'CRO', 'Super-admin'].includes(userRole);
  const isEvaluator = userRole === 'Evaluator';

  const usersMap = useMemo(() => new Map(allUsers.map(u => [u.uid, u])), [allUsers]);

  type SortableKeys = keyof Pick<Project, 'title' | 'faculty' | 'pi' | 'status' | 'submissionDate'> | 'meetingDate';
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' }>({ key: 'submissionDate', direction: 'descending' });

  const sortedProjects = useMemo(() => {
    let sortableItems = [...projects];
    sortableItems.sort((a, b) => {
        let aValue, bValue;
        const key = sortConfig.key;

        if (key === 'meetingDate') {
            aValue = a.meetingDetails?.date ? parseISO(a.meetingDetails.date).getTime() : 0;
            bValue = b.meetingDetails?.date ? parseISO(b.meetingDetails.date).getTime() : 0;
        } else if (key === 'submissionDate') {
            aValue = a.submissionDate ? parseISO(a.submissionDate).getTime() : 0;
            bValue = b.submissionDate ? parseISO(b.submissionDate).getTime() : 0;
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
      <CardContent className="pt-6 overflow-x-auto">
        <TooltipProvider>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button variant="ghost" onClick={() => requestSort('title')}>
                      Title <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="hidden sm:table-cell">
                  <Button variant="ghost" onClick={() => requestSort('pi')}>
                      PI <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="hidden sm:table-cell">
                  <Button variant="ghost" onClick={() => requestSort('submissionDate')}>
                      Date <ArrowUpDown className="ml-2 h-4 w-4" />
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
                const displayDate = project.submissionDate;
                const piUser = usersMap.get(project.pi_uid);
                const isPI = currentUser.uid === project.pi_uid || currentUser.email === project.pi_email;
                const isCoPi = project.coPiUids?.includes(currentUser.uid) || false;
                const canEditDraft = (isPI || isCoPi) && project.status === 'Draft';
               
                let actionButton;
                if (canEditDraft) {
                  actionButton = (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link href={`/dashboard/edit-submission/${project.id}`}>
                          <Button variant="outline" size="sm">
                            <Edit className="mr-2 h-4 w-4" />
                            Edit Draft
                          </Button>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Continue editing your draft</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                } else {
                  actionButton = (
                     <Tooltip>
                        <TooltipTrigger asChild>
                          <Link href={`/dashboard/project/${project.id}`}>
                            <Button variant="outline" size="icon" aria-label="View Project Details">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>View Project Details</p>
                        </TooltipContent>
                     </Tooltip>
                  )
                }

                return (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">{project.title}</TableCell>
                    <TableCell className="hidden sm:table-cell whitespace-nowrap">
                        <div>
                          {piUser?.misId ? (
                              <Link href={`/profile/${piUser.misId}`} className="hover:underline" target="_blank" rel="noopener noreferrer">
                                  {project.pi}
                              </Link>
                          ) : (
                              project.pi
                          )}
                        </div>
                        {piUser && (
                            <div className="text-xs text-muted-foreground">
                                {piUser.designation}, {piUser.institute}
                            </div>
                        )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell whitespace-nowrap">{new Date(displayDate).toLocaleDateString()}</TableCell>
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
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
