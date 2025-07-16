
'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import type { EmrProject } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { format } from 'date-fns';

interface EmrProjectListProps {
  projects: EmrProject[];
  loading: boolean;
}

const statusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
  'Pending Approval': 'secondary',
  'Approved for Submission': 'default',
  'Requires Revision': 'secondary',
  'Rejected': 'destructive',
  'Submitted to Funding Agency': 'outline',
};

export function EmrProjectList({ projects, loading }: EmrProjectListProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (projects.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          You have not submitted any EMR proposals yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead className="hidden sm:table-cell">Funding Agency</TableHead>
              <TableHead className="hidden md:table-cell">Submission Date</TableHead>
              <TableHead className="hidden md:table-cell">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.id}>
                <TableCell className="font-medium">{project.title}</TableCell>
                <TableCell className="hidden sm:table-cell">{project.fundingAgency}</TableCell>
                <TableCell className="hidden md:table-cell">{format(new Date(project.submissionDate), 'PPP')}</TableCell>
                <TableCell className="hidden md:table-cell">
                  <Badge variant={statusVariant[project.status] || 'secondary'}>{project.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/dashboard/emr-projects/${project.id}`}>
                    <Button variant="outline" size="icon" aria-label="View Project Details">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
