'use client';

import { useState, useEffect } from 'react';
import type { Project, User } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Check, ChevronDown, Clock, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ProjectDetailsClientProps {
  project: Project;
}

const statusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
  'Approved': 'default',
  'In Progress': 'default',
  'Under Review': 'secondary',
  'Rejected': 'destructive',
  'Completed': 'outline'
};

export function ProjectDetailsClient({ project: initialProject }: ProjectDetailsClientProps) {
  const [project, setProject] = useState(initialProject);
  const [user, setUser] = useState<User | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    setProject(initialProject);
  }, [initialProject]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const handleStatusUpdate = async (newStatus: Project['status']) => {
    setIsUpdating(true);
    try {
      const projectRef = doc(db, 'projects', project.id);
      await updateDoc(projectRef, { status: newStatus });

      // Create a notification for the project's PI
      if (project.pi_uid) {
        await addDoc(collection(db, 'notifications'), {
          uid: project.pi_uid,
          title: `Your project "${project.title}" status was updated to: ${newStatus}`,
          projectId: project.id,
          createdAt: new Date().toISOString(),
          isRead: false,
        });
      }

      setProject({ ...project, status: newStatus });
      toast({ title: 'Success', description: `Project status updated to ${newStatus}` });
      router.refresh(); 
    } catch (error) {
      console.error('Error updating project status:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update project status.' });
    } finally {
      setIsUpdating(false);
    }
  };
  
  const formatDate = (isoString: string) => {
      if (!isoString) return 'N/A';
      try {
        return new Date(isoString).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
      } catch (e) {
        return 'Invalid Date';
      }
  }

  const isAdmin = user?.role === 'admin';
  const availableStatuses: Project['status'][] = ['Approved', 'Rejected', 'In Progress', 'Completed', 'Under Review'];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
                <CardTitle className="text-2xl">{project.title}</CardTitle>
                <CardDescription>Submitted by {project.pi} on {formatDate(project.submissionDate)}</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
                 <Badge variant={statusVariant[project.status] || 'secondary'} className="text-sm px-3 py-1">
                    {project.status === 'Under Review' && <Clock className="mr-2 h-4 w-4" />}
                    {(project.status === 'Approved' || project.status === 'Completed') && <Check className="mr-2 h-4 w-4" />}
                    {project.status === 'Rejected' && <X className="mr-2 h-4 w-4" />}
                    {project.status}
                </Badge>
                {isAdmin && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" disabled={isUpdating}>
                                Change Status <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {availableStatuses.map(status => (
                               <DropdownMenuItem key={status} onClick={() => handleStatusUpdate(status)} disabled={project.status === status}>
                                   {status}
                               </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">Abstract</h3>
          <p className="text-muted-foreground">{project.abstract}</p>
        </div>
        <Separator />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
                <h3 className="font-semibold text-lg">Details</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="font-medium text-muted-foreground">Project Type</dt>
                    <dd>{project.type}</dd>
                    <dt className="font-medium text-muted-foreground">Department</dt>
                    <dd>{project.department}</dd>
                    <dt className="font-medium text-muted-foreground">Principal Investigator</dt>
                    <dd>{project.pi}</dd>
                </dl>
            </div>
            <div className="space-y-2">
                 <h3 className="font-semibold text-lg">Team Information</h3>
                 <p className="text-muted-foreground whitespace-pre-wrap">{project.teamInfo}</p>
            </div>
        </div>
        <Separator />
         <div className="space-y-2">
          <h3 className="font-semibold text-lg">Timeline and Outcomes</h3>
          <p className="text-muted-foreground whitespace-pre-wrap">{project.timelineAndOutcomes}</p>
        </div>
      </CardContent>
    </Card>
  );
}
