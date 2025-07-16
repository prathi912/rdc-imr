
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/config';
import type { EmrProject, User } from '@/types';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Building, Calendar, FileText, IndianRupee, Tag, Check, X, Edit, Send } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const statusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
  'Pending Approval': 'secondary',
  'Approved for Submission': 'default',
  'Requires Revision': 'secondary',
  'Rejected': 'destructive',
  'Submitted to Funding Agency': 'outline',
};

export default function EmrProjectDetailsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<EmrProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const fetchProject = useCallback(async () => {
    try {
      const projectRef = doc(db, 'emrProjects', projectId);
      const projectSnap = await getDoc(projectRef);
      if (projectSnap.exists()) {
        setProject({ ...projectSnap.data(), id: projectSnap.id } as EmrProject);
      } else {
        console.error('No such document!');
      }
    } catch (error) {
      console.error('Error fetching project:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    if (projectId) {
      fetchProject();
    }
  }, [projectId, fetchProject]);

  const handleStatusUpdate = async (newStatus: EmrProject['status']) => {
    // TODO: Add committee comments logic
    const projectRef = doc(db, 'emrProjects', projectId);
    await updateDoc(projectRef, { status: newStatus });
    setProject(prev => prev ? { ...prev, status: newStatus } : null);
  };
  
  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Loading EMR Project..." backButtonHref="/dashboard/emr-projects" />
        <Skeleton className="mt-8 h-96 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Project Not Found" description="The requested EMR project could not be found." backButtonHref="/dashboard/emr-projects" />
      </div>
    );
  }

  const isOwner = user?.uid === project.pi_uid;
  const isAdmin = user?.role === 'Super-admin' || user?.role === 'admin';

  return (
    <div className="container mx-auto max-w-4xl py-10">
      <PageHeader
        title={project.title}
        description={`Submitted by ${project.pi_name} on ${format(new Date(project.submissionDate), 'PPP')}`}
        backButtonHref="/dashboard/emr-projects"
      />
      <div className="mt-8 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <CardTitle>Project Details</CardTitle>
              <Badge variant={statusVariant[project.status] || 'secondary'}>{project.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <p className="flex items-center gap-2"><Building className="h-4 w-4 text-muted-foreground" /> <strong>Agency:</strong> {project.fundingAgency}</p>
              <p className="flex items-center gap-2"><IndianRupee className="h-4 w-4 text-muted-foreground" /> <strong>Budget:</strong> ₹{project.estimatedBudget.toLocaleString('en-IN')}</p>
              {project.callName && <p className="flex items-center gap-2"><Tag className="h-4 w-4 text-muted-foreground" /> <strong>Call:</strong> {project.callName}</p>}
              {project.deadlineToApply && <p className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /> <strong>Deadline:</strong> {format(new Date(project.deadlineToApply), 'PPP')}</p>}
            </div>
            <Separator />
            <div>
              <a href={project.presentationUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline"><FileText className="mr-2 h-4 w-4" /> View Submitted Presentation</Button>
              </a>
            </div>
          </CardContent>
        </Card>

        {isAdmin && project.status === 'Pending Approval' && (
          <Card>
            <CardHeader><CardTitle>Committee Actions</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button onClick={() => handleStatusUpdate('Approved for Submission')}><Check className="mr-2 h-4 w-4" /> Approve for Submission</Button>
              <Button variant="destructive" onClick={() => handleStatusUpdate('Rejected')}><X className="mr-2 h-4 w-4" /> Reject</Button>
              <Button variant="secondary" onClick={() => handleStatusUpdate('Requires Revision')}><Edit className="mr-2 h-4 w-4" /> Request Revision</Button>
            </CardContent>
          </Card>
        )}

        {isOwner && project.status === 'Approved for Submission' && (
          <Card>
            <CardHeader><CardTitle>Next Step</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Your proposal has been approved internally. Once you have submitted it to the funding agency, please mark it as submitted below.</p>
                <Button onClick={() => handleStatusUpdate('Submitted to Funding Agency')}><Send className="mr-2 h-4 w-4" /> Mark as Submitted</Button>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
