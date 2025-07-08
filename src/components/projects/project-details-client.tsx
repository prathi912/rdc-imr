
'use client';

import { useState, useEffect, useCallback } from 'react';
import * as z from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format, startOfToday } from 'date-fns';
import { useRouter } from 'next/navigation';

import type { Project, User, GrantDetails, Evaluation, BankDetails } from '@/types';
import { db } from '@/lib/config';
import { doc, updateDoc, addDoc, collection, getDoc, getDocs } from 'firebase/firestore';
import { uploadFileToServer, updateProjectStatus } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

import { Check, ChevronDown, Clock, X, DollarSign, FileCheck2, Calendar as CalendarIcon } from 'lucide-react';

import { GrantManagement } from './grant-management';
import { EvaluationForm } from './evaluation-form';
import { EvaluationsSummary } from './evaluations-summary';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface ProjectDetailsClientProps {
  project: Project;
}

const statusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
  'Submitted': 'secondary',
  'Approved': 'default',
  'In Progress': 'default',
  'Under Review': 'secondary',
  'Pending Completion Approval': 'secondary',
  'Rejected': 'destructive',
  'Completed': 'outline'
};

const scheduleSchema = z.object({
  date: z.date({ required_error: 'A meeting date is required.' }),
  time: z.string().min(1, 'Meeting time is required.'),
  venue: z.string().min(1, 'Meeting venue is required.'),
});
type ScheduleFormData = z.infer<typeof scheduleSchema>;

const venues = ["RDC Committee Room, PIMSR"];

const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};

export function ProjectDetailsClient({ project: initialProject }: ProjectDetailsClientProps) {
  const [project, setProject] = useState(initialProject);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const [grantAmount, setGrantAmount] = useState<number | ''>('');
  const [sanctionNumber, setSanctionNumber] = useState('');
  const [isAwarding, setIsAwarding] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCompletionDialogOpen, setIsCompletionDialogOpen] = useState(false);
  const [completionReportFile, setCompletionReportFile] = useState<File | null>(null);
  const [utilizationCertificateFile, setUtilizationCertificateFile] = useState<File | null>(null);
  const [isSubmittingCompletion, setIsSubmittingCompletion] = useState(false);
  const [showApprovalAlert, setShowApprovalAlert] = useState(false);
  const [isRevisionDialogOpen, setIsRevisionDialogOpen] = useState(false);
  const [revisedProposalFile, setRevisedProposalFile] = useState<File | null>(null);
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);

  const scheduleForm = useForm<ScheduleFormData>({
    resolver: zodResolver(scheduleSchema),
  });

  useEffect(() => {
    if (initialProject.meetingDetails) {
        scheduleForm.reset({
            date: new Date(initialProject.meetingDetails.date),
            time: initialProject.meetingDetails.time,
            venue: initialProject.meetingDetails.venue,
        });
    }
  }, [initialProject.meetingDetails, scheduleForm]);

  const refetchData = useCallback(async () => {
    try {
        const projectRef = doc(db, 'projects', initialProject.id);
        const projectSnap = await getDoc(projectRef);

        if (projectSnap.exists()) {
          const data = projectSnap.data();
          setProject({ 
              id: projectSnap.id,
              ...data,
              submissionDate: data.submissionDate || new Date().toISOString()
          } as Project);
        }

        const evaluationsCol = collection(db, 'projects', initialProject.id, 'evaluations');
        const evaluationsSnapshot = await getDocs(evaluationsCol);
        const evaluationsList = evaluationsSnapshot.docs.map(doc => doc.data() as Evaluation);
        setEvaluations(evaluationsList);

    } catch (error) {
        console.error("Error refetching data:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not refresh project data.' });
    }
  }, [initialProject.id, toast]);


  useEffect(() => {
    setProject(initialProject);
    refetchData();
  }, [initialProject, refetchData]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);
  
  const isPI = user?.uid === project.pi_uid;
  const isAdmin = user && ['Super-admin', 'admin', 'CRO'].includes(user.role);
  const isPrivilegedViewer = isAdmin || (user?.designation === 'Principal') || (user?.designation === 'HOD');
  const canViewDocuments = isPI || isPrivilegedViewer;
  const showEvaluationForm = user && project.status === 'Under Review' && project.meetingDetails?.assignedEvaluators?.includes(user.uid);
  const allEvaluationsIn = (project.meetingDetails?.assignedEvaluators?.length ?? 0) > 0 && evaluations.length >= (project.meetingDetails?.assignedEvaluators?.length ?? 0);

  const handleStatusUpdate = async (newStatus: Project['status']) => {
    setIsUpdating(true);
    const result = await updateProjectStatus(project.id, newStatus);
    setIsUpdating(false);

    if (result.success) {
      setProject({ ...project, status: newStatus });
      toast({ title: 'Success', description: `Project status updated to ${newStatus}` });
      router.refresh();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to update project status.' });
    }
  };

  const handleScheduleUpdate = async (data: ScheduleFormData) => {
    setIsUpdating(true);
    try {
        const projectRef = doc(db, 'projects', project.id);
        const newMeetingDetails = {
            date: data.date.toISOString(),
            time: data.time,
            venue: data.venue,
        };

        await updateDoc(projectRef, { 'meetingDetails.date': newMeetingDetails.date, 'meetingDetails.time': newMeetingDetails.time, 'meetingDetails.venue': newMeetingDetails.venue });
        
        await addDoc(collection(db, 'notifications'), {
            uid: project.pi_uid,
            title: `MEETING RESCHEDULED for your project: "${project.title}"`,
            projectId: project.id,
            createdAt: new Date().toISOString(),
            isRead: false,
        });

        setProject({ ...project, meetingDetails: { ...project.meetingDetails, ...newMeetingDetails } as Project['meetingDetails'] });
        toast({ title: 'Success', description: `Meeting schedule has been updated.` });
        setIsScheduleDialogOpen(false);
        
    } catch (error) {
        console.error('Error updating schedule:', error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to update meeting schedule.' });
    } finally {
        setIsUpdating(false);
    }
  };


  const handleAwardGrant = async () => {
    if (!grantAmount || grantAmount <= 0) {
      toast({ variant: 'destructive', title: 'Invalid Amount', description: 'Please enter a valid grant amount.' });
      return;
    }
    if (!sanctionNumber || sanctionNumber.trim() === '') {
        toast({ variant: 'destructive', title: 'Sanction Number Required', description: 'Please enter the sanction number.' });
        return;
    }
    setIsAwarding(true);
    try {
      const projectRef = doc(db, 'projects', project.id);

      // Fetch PI's user data to get bank details
      const userRef = doc(db, 'users', project.pi_uid);
      const userSnap = await getDoc(userRef);
      
      let newGrant: GrantDetails;
      
      if (userSnap.exists()) {
        const piUser = userSnap.data() as User;
        
        if (piUser.bankDetails) {
          // Bank details exist, copy them over
          const grantBankDetails: BankDetails = {
              accountHolderName: piUser.bankDetails.beneficiaryName,
              accountNumber: piUser.bankDetails.accountNumber,
              bankName: piUser.bankDetails.bankName,
              ifscCode: piUser.bankDetails.ifscCode,
              branchName: piUser.bankDetails.branchName,
              city: piUser.bankDetails.city,
          };
          
          newGrant = {
            amount: grantAmount,
            sanctionNumber: sanctionNumber.trim(),
            status: 'Bank Details Submitted',
            bankDetails: grantBankDetails
          };
        } else {
          // Bank details don't exist
          newGrant = {
            amount: grantAmount,
            sanctionNumber: sanctionNumber.trim(),
            status: 'Pending Bank Details',
          };
        }
      } else {
        // PI user document not found, proceed without bank details
        newGrant = {
          amount: grantAmount,
          sanctionNumber: sanctionNumber.trim(),
          status: 'Pending Bank Details',
        };
        toast({ variant: 'destructive', title: 'Warning', description: "Could not find PI's user profile to fetch bank details." });
      }


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
      setSanctionNumber('');
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

  const handleCertificateFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        setUtilizationCertificateFile(e.target.files[0]);
    }
  };

  const handleCompletionSubmit = async () => {
    if (!completionReportFile || !utilizationCertificateFile) {
        toast({ variant: 'destructive', title: 'Files Missing', description: 'Please upload both the completion report and the utilization certificate.' });
        return;
    }
    setIsSubmittingCompletion(true);
    try {
        const projectRef = doc(db, 'projects', project.id);

        const uploadFile = async (file: File, folder: string): Promise<string> => {
            const dataUrl = await fileToDataUrl(file);
            const path = `reports/${project.id}/${folder}/${file.name}`;
            const result = await uploadFileToServer(dataUrl, path);
            if (!result.success || !result.url) {
                throw new Error(result.error || `Failed to upload ${file.name}`);
            }
            return result.url;
        };
        
        const reportUrl = await uploadFile(completionReportFile, 'completion-report');
        const certificateUrl = await uploadFile(utilizationCertificateFile, 'utilization-certificate');

        const updateData = {
          status: 'Pending Completion Approval',
          completionReportUrl: reportUrl,
          utilizationCertificateUrl: certificateUrl,
          completionSubmissionDate: new Date().toISOString(),
        };

        await updateDoc(projectRef, updateData);
        setProject({ ...project, ...updateData });

        toast({ title: 'Documents Submitted', description: 'Your completion documents have been submitted for review.' });
        setIsCompletionDialogOpen(false);
        setCompletionReportFile(null);
        setUtilizationCertificateFile(null);
    } catch (error) {
        console.error('Error submitting completion documents:', error);
        toast({ variant: 'destructive', title: 'Submission Failed', description: 'Could not submit the completion documents.' });
    } finally {
        setIsSubmittingCompletion(false);
    }
  };
  
  const handleRevisionSubmit = async () => {
    if (!revisedProposalFile) {
        toast({ variant: 'destructive', title: 'File Missing', description: 'Please upload the revised proposal.' });
        return;
    }
    setIsSubmittingRevision(true);
    try {
        const projectRef = doc(db, 'projects', project.id);

        const dataUrl = await fileToDataUrl(revisedProposalFile);
        const path = `revisions/${project.id}/${revisedProposalFile.name}`;
        const result = await uploadFileToServer(dataUrl, path);
        
        if (!result.success || !result.url) {
            throw new Error(result.error || "Revision upload failed");
        }
        const revisedProposalUrl = result.url;

        const updateData = {
          revisedProposalUrl: revisedProposalUrl,
          revisionSubmissionDate: new Date().toISOString(),
        };

        await updateDoc(projectRef, updateData);
        setProject({ ...project, ...updateData });

        toast({ title: 'Revision Submitted', description: 'Your revised proposal has been submitted.' });
        setIsRevisionDialogOpen(false);
        setRevisedProposalFile(null);
    } catch (error) {
        console.error('Error submitting revision:', error);
        toast({ variant: 'destructive', title: 'Submission Failed', description: 'Could not submit your revision.' });
    } finally {
        setIsSubmittingRevision(false);
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

  const availableStatuses: Project['status'][] = ['Submitted', 'Under Review', 'In Progress', 'Completed', 'Pending Completion Approval'];

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
                          <DialogDescription>Enter the grant amount and sanction number for "{project.title}".</DialogDescription>
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
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="sanction-number" className="text-right">Sanction No.</Label>
                            <Input
                              id="sanction-number"
                              value={sanctionNumber}
                              onChange={(e) => setSanctionNumber(e.target.value)}
                              className="col-span-3"
                              placeholder="e.g., RDC/IMSL/122"
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
                  {isPI && project.status === 'Under Review' && (
                    <Dialog open={isRevisionDialogOpen} onOpenChange={setIsRevisionDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline"><FileCheck2 className="mr-2 h-4 w-4" /> Submit Revision</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Submit Revised Proposal</DialogTitle>
                          <DialogDescription>Upload your revised proposal based on the feedback from the IMR evaluation meeting.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="revised-proposal" className="text-right">Proposal (PDF)</Label>
                            <Input id="revised-proposal" type="file" accept=".pdf" onChange={(e) => setRevisedProposalFile(e.target.files ? e.target.files[0] : null)} className="col-span-3" />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="button" onClick={handleRevisionSubmit} disabled={isSubmittingRevision || !revisedProposalFile}>
                            {isSubmittingRevision ? 'Submitting...' : 'Submit Revised Proposal'}
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
                          <DialogTitle>Submit Completion Documents</DialogTitle>
                          <DialogDescription>To request project closure, please upload the final 'Project outcome-cum-completion report' and the 'Utilization Certificate'.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="completion-report" className="text-right">Completion Report (PDF)</Label>
                            <Input id="completion-report" type="file" accept=".pdf" onChange={handleCompletionFileChange} className="col-span-3" />
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="utilization-certificate" className="text-right">Utilization Certificate (PDF)</Label>
                            <Input id="utilization-certificate" type="file" accept=".pdf" onChange={handleCertificateFileChange} className="col-span-3" />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="button" onClick={handleCompletionSubmit} disabled={isSubmittingCompletion || !completionReportFile || !utilizationCertificateFile}>
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
          {project.meetingDetails && (
            <>
              <div className="space-y-2 p-4 border rounded-lg bg-secondary/50">
                <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-lg">IMR Evaluation Meeting Details</h3>
                    {isAdmin && (
                        <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm">Edit Schedule</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Edit Meeting Schedule</DialogTitle>
                                    <DialogDescription>Update the date, time, or venue for this meeting.</DialogDescription>
                                </DialogHeader>
                                <Form {...scheduleForm}>
                                    <form id="schedule-edit-form" onSubmit={scheduleForm.handleSubmit(handleScheduleUpdate)} className="space-y-4 py-4">
                                        <FormField
                                            control={scheduleForm.control}
                                            name="date"
                                            render={({ field }) => (
                                                <FormItem className="flex flex-col">
                                                <FormLabel>New Meeting Date</FormLabel>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                    <FormControl>
                                                        <Button
                                                        variant={"outline"}
                                                        className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                                        >
                                                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                        </Button>
                                                    </FormControl>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0" align="start">
                                                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date < startOfToday()} initialFocus />
                                                    </PopoverContent>
                                                </Popover>
                                                <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={scheduleForm.control}
                                            name="time"
                                            render={({ field }) => (
                                                <FormItem>
                                                <FormLabel>New Meeting Time</FormLabel>
                                                <FormControl>
                                                    <Input type="time" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={scheduleForm.control}
                                            name="venue"
                                            render={({ field }) => (
                                                <FormItem>
                                                <FormLabel>New Venue</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                  <FormControl>
                                                    <SelectTrigger>
                                                      <SelectValue placeholder="Select a venue" />
                                                    </SelectTrigger>
                                                  </FormControl>
                                                  <SelectContent>
                                                    {venues.map(venue => (
                                                      <SelectItem key={venue} value={venue}>{venue}</SelectItem>
                                                    ))}
                                                  </SelectContent>
                                                </Select>
                                                <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </form>
                                </Form>
                                <DialogFooter>
                                    <Button type="submit" form="schedule-edit-form" disabled={isUpdating}>
                                        {isUpdating ? 'Saving...' : 'Save Changes'}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                  <p><strong>Date:</strong> {formatDate(project.meetingDetails.date)}</p>
                  <p><strong>Time:</strong> {project.meetingDetails.time}</p>
                  <p><strong>Venue:</strong> {project.meetingDetails.venue}</p>
                </div>
              </div>
              <Separator />
            </>
          )}
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
                    <dt className="font-medium text-muted-foreground">Email</dt>
                    <dd>{project.pi_email || 'N/A'}</dd>
                    <dt className="font-medium text-muted-foreground">Phone</dt>
                    <dd>{project.pi_phoneNumber || 'N/A'}</dd>
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
           {project.teamInfo && (
                <>
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">Team Information</h3>
                  <p className="text-muted-foreground whitespace-pre-wrap">{project.teamInfo}</p>
                </div>
                <Separator />
                </>
            )}
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Timeline and Outcomes</h3>
            <p className="text-muted-foreground whitespace-pre-wrap">{project.timelineAndOutcomes}</p>
          </div>
          {canViewDocuments && (
            <>
              {(project.proposalUrl || project.cvUrl || project.ethicsUrl) && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg">Submitted Documents</h3>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {project.proposalUrl && (
                        <li>
                          <Button variant="link" asChild className="p-0 h-auto">
                            <a href={project.proposalUrl} target="_blank" rel="noopener noreferrer">View Project Proposal</a>
                          </Button>
                        </li>
                      )}
                      {project.cvUrl && (
                        <li>
                          <Button variant="link" asChild className="p-0 h-auto">
                            <a href={project.cvUrl} target="_blank" rel="noopener noreferrer">View Team CVs</a>
                          </Button>
                        </li>
                      )}
                      {project.ethicsUrl && (
                        <li>
                          <Button variant="link" asChild className="p-0 h-auto">
                            <a href={project.ethicsUrl} target="_blank" rel="noopener noreferrer">View Ethics Approval</a>
                          </Button>
                        </li>
                      )}
                    </ul>
                  </div>
                </>
              )}
              {project.revisedProposalUrl && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                        <h3 className="font-semibold text-lg">Revised Proposal</h3>
                        <p className="text-sm text-muted-foreground">
                            The following revised proposal was submitted on {formatDate(project.revisionSubmissionDate!)}.
                        </p>
                        <ul className="list-disc list-inside text-sm space-y-1">
                          <li>
                            <Button variant="link" asChild className="p-0 h-auto">
                                <a href={project.revisedProposalUrl} target="_blank" rel="noopener noreferrer">View Revised Proposal</a>
                            </Button>
                          </li>
                        </ul>
                    </div>
                  </>
              )}
              {project.completionReportUrl && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                        <h3 className="font-semibold text-lg">Completion Documents</h3>
                        <p className="text-sm text-muted-foreground">
                            The following documents were submitted on {formatDate(project.completionSubmissionDate!)}.
                        </p>
                        <ul className="list-disc list-inside text-sm space-y-1">
                          <li>
                            <Button variant="link" asChild className="p-0 h-auto">
                                <a href={project.completionReportUrl} target="_blank" rel="noopener noreferrer">Project outcome-cum-completion report</a>
                            </Button>
                          </li>
                          {project.utilizationCertificateUrl && (
                            <li>
                              <Button variant="link" asChild className="p-0 h-auto">
                                  <a href={project.utilizationCertificateUrl} target="_blank" rel="noopener noreferrer">Utilization Certificate</a>
                              </Button>
                            </li>
                          )}
                        </ul>
                    </div>
                  </>
              )}
            </>
          )}
        </CardContent>
      </Card>
      
      {isAdmin && project.status === 'Under Review' && <EvaluationsSummary project={project} evaluations={evaluations} />}

      {showEvaluationForm && (
        <EvaluationForm project={project} user={user} onEvaluationSubmitted={refetchData} />
      )}
      
      {project.grant && user && (
        <GrantManagement project={project} user={user} onUpdate={handleProjectUpdate} />
      )}
       <AlertDialog open={showApprovalAlert} onOpenChange={setShowApprovalAlert}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Evaluation Incomplete</AlertDialogTitle>
                    <AlertDialogDescription>
                        This project cannot be approved or rejected until all assigned evaluations have been submitted. 
                        There are currently {evaluations.length || 0} of {project.meetingDetails?.assignedEvaluators?.length || 0} required evaluations complete.
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
