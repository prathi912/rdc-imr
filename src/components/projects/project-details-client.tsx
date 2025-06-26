'use client';

import { useState, useEffect } from 'react';
import type { Project, User, GrantDetails } from '@/types';
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
import { Check, ChevronDown, Clock, X, DollarSign, FileCheck2, UserCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GrantManagement } from './grant-management';
import { REQUIRED_EVALUATOR_EMAILS } from '@/lib/constants';
import { EvaluationForm } from './evaluation-form';
import { EvaluationsSummary } from './evaluations-summary';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ProjectDetailsClientProps {
  project: Project;
}

const statusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
  'Approved': 'default',
  'In Progress': 'default',
  'Under Review': 'secondary',
  'Pending Completion Approval': 'secondary',
  'Rejected': 'destructive',
  'Completed': 'outline'
};

export function ProjectDetailsClient({ project: initialProject }: ProjectDetailsClientProps) {
  const [project, setProject] = useState(initialProject);
  const [user, setUser] = useState<User | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const [grantAmount, setGrantAmount] = useState<number | ''>('');
  const [isAwarding, setIsAwarding] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCompletionDialogOpen, setIsCompletionDialogOpen] = useState(false);
  const [completionReportFile, setCompletionReportFile] = useState<File | null>(null);
  const [isSubmittingCompletion, setIsSubmittingCompletion] = useState(false);
  const [showApprovalAlert, setShowApprovalAlert] = useState(false);

  useEffect(() => {
    setProject(initialProject);
  }, [initialProject]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);
  
  const isPI = user?.uid === project.pi_uid;
  const isAdmin = user && ['Super-admin', 'admin', 'CRO'].includes(user.role);
  const isEvaluator = user && REQUIRED_EVALUATOR_EMAILS.includes(user.email);
  const allEvaluationsIn = project.evaluations && project.evaluations.length >= REQUIRED_EVALUATOR_EMAILS.length;

  const handleStatusUpdate = async (newStatus: Project['status']) => {
    setIsUpdating(true);
    try {
      const projectRef = doc(db, 'projects', project.id);
      await updateDoc(projectRef, { status: newStatus });

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

  const handleAwardGrant = async () => {
    if (!grantAmount || grantAmount <= 0) {
      toast({ variant: 'destructive', title: 'Invalid Amount', description: 'Please enter a valid grant amount.' });
      return;
    }
    setIsAwarding(true);
    try {
      const projectRef = doc(db, 'projects', project.id);
      const newGrant: GrantDetails = {
        amount: grantAmount,
        status: 'Pending Bank Details',
      };

      await updateDoc(projectRef, { grant: newGrant });

      await addDoc(collection(db, 'notifications'), {
          uid: project.pi_uid,
          title: `Congratulations! Your project "${project.title}" has been awarded a grant.`,
          projectId: project.id,
          createdAt: new Date().toISOString(),
          isRead: false,
      });

      setProject({ ...project, grant: newGrant });
      toast({ title: 'Grant Awarded!', description: `A grant of ₹${grantAmount.toLocaleString('en-IN')} has been awarded.` });
      setIsDialogOpen(false);
      setGrantAmount('');
    } catch (error) {
      console.error('Error awarding grant:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to award grant.' });
    } finally {
      setIsAwarding(false);
    }
  };

  const handleCompletionFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        setCompletionReportFile(e.target.files[0]);
    }
  };

  const handleCompletionSubmit = async () => {
    if (!completionReportFile) {
        toast({ variant: 'destructive', title: 'No File Selected', description: 'Please upload the completion report.' });
        return;
    }
    setIsSubmittingCompletion(true);
    try {
        const projectRef = doc(db, 'projects', project.id);
        const reportUrl = `reports/${project.id}/${completionReportFile.name}`;

        const updateData = {
          status: 'Pending Completion Approval',
          completionReportUrl: reportUrl,
          completionSubmissionDate: new Date().toISOString(),
        };

        await updateDoc(projectRef, updateData);
        setProject({ ...project, ...updateData });

        toast({ title: 'Report Submitted', description: 'Your completion report has been submitted for review.' });
        setIsCompletionDialogOpen(false);
        setCompletionReportFile(null);
    } catch (error) {
        console.error('Error submitting completion report:', error);
        toast({ variant: 'destructive', title: 'Submission Failed', description: 'Could not submit the completion report.' });
    } finally {
        setIsSubmittingCompletion(false);
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

  const handleProjectUpdate = (updatedProject: Project) => {
    setProject(updatedProject);
  };
  
  const handleApprovalClick = (status: 'Approved' | 'Rejected') => {
      if (!allEvaluationsIn) {
          setShowApprovalAlert(true);
          return;
      }
      handleStatusUpdate(status);
  }

  const availableStatuses: Project['status'][] = ['Approved', 'Rejected', 'In Progress', 'Completed', 'Under Review', 'Pending Completion Approval'];

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                  <CardTitle className="text-2xl">{project.title}</CardTitle>
                  <CardDescription>Submitted on {formatDate(project.submissionDate)}</CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                  <Badge variant={statusVariant[project.status] || 'secondary'} className="text-sm px-3 py-1">
                      {project.status === 'Under Review' && <Clock className="mr-2 h-4 w-4" />}
                      {project.status === 'Pending Completion Approval' && <Clock className="mr-2 h-4 w-4" />}
                      {(project.status === 'Approved' || project.status === 'Completed') && <Check className="mr-2 h-4 w-4" />}
                      {project.status === 'Rejected' && <X className="mr-2 h-4 w-4" />}
                      {project.status}
                  </Badge>
                  {isAdmin && project.status === 'Under Review' && (
                     <div className="flex items-center gap-2">
                        <Button size="sm" onClick={() => handleApprovalClick('Approved')}><Check className="mr-2 h-4 w-4"/>Approve</Button>
                        <Button size="sm" variant="destructive" onClick={() => handleApprovalClick('Rejected')}><X className="mr-2 h-4 w-4"/>Reject</Button>
                     </div>
                  )}
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
                  {isAdmin && project.status === 'Approved' && !project.grant && (
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                      <DialogTrigger asChild>
                        <Button><DollarSign className="mr-2 h-4 w-4" /> Award Grant</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Award Grant</DialogTitle>
                          <DialogDescription>Enter the grant amount for "{project.title}".</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="grant-amount" className="text-right">Amount (₹)</Label>
                            <Input
                              id="grant-amount"
                              type="number"
                              value={grantAmount}
                              onChange={(e) => setGrantAmount(Number(e.target.value))}
                              className="col-span-3"
                              placeholder="e.g., 400000"
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="button" onClick={handleAwardGrant} disabled={isAwarding}>
                              {isAwarding ? 'Awarding...' : 'Confirm & Award'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                  {isPI && (project.status === 'Approved' || project.status === 'In Progress') && (
                    <Dialog open={isCompletionDialogOpen} onOpenChange={setIsCompletionDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline"><FileCheck2 className="mr-2 h-4 w-4" /> Request Project Closure</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Submit Completion Report</DialogTitle>
                          <DialogDescription>To request project closure, upload your final 'Project outcome-cum-completion report'.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="completion-report" className="text-right">Report (PDF)</Label>
                            <Input id="completion-report" type="file" accept=".pdf" onChange={handleCompletionFileChange} className="col-span-3" />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="button" onClick={handleCompletionSubmit} disabled={isSubmittingCompletion || !completionReportFile}>
                            {isSubmittingCompletion ? 'Submitting...' : 'Submit for Review'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
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
            <div className="space-y-4">
                <h3 className="font-semibold text-lg">Project Details</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="font-medium text-muted-foreground">Project Type</dt>
                    <dd>{project.type}</dd>
                </dl>
            </div>
             <div className="space-y-4">
                <h3 className="font-semibold text-lg">Submitter Information</h3>
                 <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="font-medium text-muted-foreground">Principal Investigator</dt>
                    <dd>{project.pi}</dd>
                    <dt className="font-medium text-muted-foreground">Faculty</dt>
                    <dd>{project.faculty}</dd>
                    <dt className="font-medium text-muted-foreground">Institute</dt>
                    <dd>{project.institute}</dd>
                    <dt className="font-medium text-muted-foreground">Department</dt>
                    <dd>{project.departmentName}</dd>
                </dl>
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Team Information</h3>
            <p className="text-muted-foreground whitespace-pre-wrap">{project.teamInfo}</p>
          </div>
          <Separator />
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Timeline and Outcomes</h3>
            <p className="text-muted-foreground whitespace-pre-wrap">{project.timelineAndOutcomes}</p>
          </div>
          {project.completionReportUrl && (
              <>
                <Separator />
                <div className="space-y-2">
                    <h3 className="font-semibold text-lg">Completion Report</h3>
                    <p className="text-sm text-muted-foreground">
                        The project outcome-cum-completion report was submitted on {formatDate(project.completionSubmissionDate!)}.
                    </p>
                    <Button variant="link" asChild className="p-0 h-auto">
                        <a href={project.completionReportUrl} target="_blank" rel="noopener noreferrer">View Submitted Report</a>
                    </Button>
                </div>
              </>
          )}
        </CardContent>
      </Card>
      
      {isAdmin && project.status === 'Under Review' && <EvaluationsSummary project={project} />}

      {isEvaluator && project.status === 'Under Review' && user && (
        <EvaluationForm project={project} user={user} onUpdate={handleProjectUpdate} />
      )}
      
      {project.grant && user && (
        <GrantManagement project={project} user={user} onUpdate={handleProjectUpdate} />
      )}
       <AlertDialog open={showApprovalAlert} onOpenChange={setShowApprovalAlert}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Evaluation Incomplete</AlertDialogTitle>
                    <AlertDialogDescription>
                        This project cannot be approved or rejected until all required evaluations have been submitted. 
                        There are currently {project.evaluations?.length || 0} of {REQUIRED_EVALUATOR_EMAILS.length} evaluations complete.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>OK</AlertDialogCancel>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </>
  );
}
