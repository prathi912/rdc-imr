
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProjectList } from '@/components/projects/project-list';
import { FilePlus2, CheckCircle, Clock, ArrowRight, BookOpenCheck, Pencil, MessageSquareWarning } from 'lucide-react';
import type { User, Project, EmrInterest, FundingCall } from '@/types';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, or } from 'firebase/firestore';
import { Skeleton } from '../ui/skeleton';
import { EmrCalendar } from '../emr/emr-calendar';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { uploadRevisedEmrPpt } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { UploadPptDialog } from '../emr/emr-actions';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { withdrawEmrInterest } from '@/app/actions';

export function FacultyDashboard({ user }: { user: User }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [emrInterests, setEmrInterests] = useState<EmrInterest[]>([]);
  const [fundingCalls, setFundingCalls] = useState<FundingCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRevisionUploadOpen, setIsRevisionUploadOpen] = useState(false);
  const [isUploadPptOpen, setIsUploadPptOpen] = useState(false);
  const [isWithdrawConfirmationOpen, setIsWithdrawConfirmationOpen] = useState(false);
  const [selectedInterest, setSelectedInterest] = useState<EmrInterest | null>(null);
  const [selectedCall, setSelectedCall] = useState<FundingCall | null>(null);
  const { toast } = useToast();

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch IMR Projects
      const projectsRef = collection(db, 'projects');
      const projectsQuery = query(
        projectsRef,
        or(
          where('pi_uid', '==', user.uid),
          where('coPiUids', 'array-contains', user.uid)
        )
      );
      
      // Fetch EMR Interests for the user
      const interestsRef = collection(db, 'emrInterests');
      const interestsQuery = query(interestsRef, where('userId', '==', user.uid));
      
      // Fetch all funding calls to map titles
      const callsRef = collection(db, 'fundingCalls');
      const callsQuery = query(callsRef);

      const [projectsSnapshot, interestsSnapshot, callsSnapshot] = await Promise.all([
          getDocs(projectsQuery),
          getDocs(interestsSnapshot),
          getDocs(callsQuery)
      ]);

      const userProjects = projectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(userProjects);
      
      const userInterests = interestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));
      setEmrInterests(userInterests);

      const allCalls = callsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingCall));
      setFundingCalls(allCalls);

    } catch (error) {
      console.error("Failed to fetch dashboard data", error);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawInterest = async () => {
    if (!selectedInterest) return;
    const result = await withdrawEmrInterest(selectedInterest.id);
    if (result.success) {
        toast({ title: 'Interest Withdrawn' });
        fetchData(); // Refresh data
    } else {
        toast({ variant: 'destructive', title: 'Withdrawal Failed', description: result.error });
    }
    setIsWithdrawConfirmationOpen(false);
    setSelectedInterest(null);
  };

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  
  const getCallById = (callId: string) => fundingCalls.find(c => c.id === callId);

  const activeStatuses = ['Recommended', 'In Progress', 'Pending Completion Approval', 'Sanctioned', 'SANCTIONED'];
  const activeProjects = projects.filter(p => activeStatuses.includes(p.status)).length;
  
  const pendingApprovalStatuses = ['Under Review', 'Submitted', 'Revision Needed'];
  const pendingApproval = projects.filter(p => pendingApprovalStatuses.includes(p.status)).length;
  
  const completedProjects = projects.filter(p => p.status === 'Completed').length;

  const statCards = [
    { title: 'Active IMR Projects', value: activeProjects.toString(), icon: BookOpenCheck },
    { title: 'IMR Pending Approval', value: pendingApproval.toString(), icon: Clock },
    { title: 'IMR Completed', value: completedProjects.toString(), icon: CheckCircle },
  ];

  const recentProjects = projects
    .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime())
    .slice(0, 3);

  return (
    <>
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-3xl font-bold tracking-tight">My Dashboard</h2>
        <Link href="/dashboard/new-submission">
          <Button>
            <FilePlus2 className="mr-2 h-4 w-4" />
            New IMR Submission
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : (
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
      )}
      
      {emrInterests.length > 0 && (
        <Card>
            <CardHeader>
                <CardTitle>My EMR Applications</CardTitle>
                <CardDescription>A summary of your registered interests in external funding calls.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {emrInterests.map(interest => {
                        const call = getCallById(interest.callId);
                        if (!call) return null;
                        return (
                            <div key={interest.id} className="p-3 border rounded-lg bg-background">
                                <p className="font-semibold">{interest.callTitle || call.title}</p>
                                <p className="text-sm text-muted-foreground">Registered on: {new Date(interest.registeredAt).toLocaleDateString()}</p>
                                <div className="mt-2">
                                    <div className="flex flex-col items-start gap-2">
                                        {interest.status === 'Revision Needed' ? (
                                            <Alert variant="destructive">
                                                <MessageSquareWarning className="h-4 w-4" />
                                                <AlertTitle>Revision Required</AlertTitle>
                                                <AlertDescription>
                                                    The committee has requested a revision. Please review the comments and submit an updated presentation.
                                                    <p className="font-semibold mt-2">Admin Remarks: {interest.adminRemarks}</p>
                                                    <Button size="sm" className="mt-2" onClick={() => { setSelectedInterest(interest); setSelectedCall(call); setIsRevisionUploadOpen(true); }}>
                                                        <Pencil className="h-4 w-4 mr-2"/> Submit Revised PPT
                                                    </Button>
                                                </AlertDescription>
                                            </Alert>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-md text-green-600 dark:text-green-300 text-sm font-semibold">
                                                    <CheckCircle className="h-4 w-4"/>
                                                    <span>Interest Registered</span>
                                                </div>
                                                {call.status === 'Open' && <Button variant="destructive" size="sm" onClick={() => { setSelectedInterest(interest); setIsWithdrawConfirmationOpen(true); }}>Withdraw</Button>}
                                                <Button size="sm" variant="outline" onClick={() => { setSelectedInterest(interest); setSelectedCall(call); setIsUploadPptOpen(true); }}>
                                                    {interest?.pptUrl ? 'Manage PPT' : 'Upload PPT'}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
      )}

       <div className="mt-4">
        <div className="mb-4 flex items-center justify-between">
            <h3 className="text-2xl font-bold tracking-tight">EMR Funding Calendar</h3>
            <Link href="/dashboard/emr-calendar">
              <Button variant="ghost">
                View Full Calendar
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
        </div>
        {loading ? <Skeleton className="h-96 w-full" /> : <EmrCalendar user={user} />}
      </div>

      <div className="mt-4">
        <div className="mb-4 flex items-center justify-between">
            <h3 className="text-2xl font-bold tracking-tight">My Recent IMR Projects</h3>
            <Link href="/dashboard/my-projects">
              <Button variant="ghost">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
        </div>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <ProjectList projects={recentProjects} userRole="faculty" />
        )}
      </div>
    </div>
    {selectedInterest && selectedCall && (
        <UploadPptDialog isOpen={isUploadPptOpen} onOpenChange={setIsUploadPptOpen} interest={selectedInterest} call={selectedCall} user={user} onUploadSuccess={fetchData} />
    )}
    {selectedInterest && selectedCall && (
        <UploadPptDialog isOpen={isRevisionUploadOpen} onOpenChange={setIsRevisionUploadOpen} interest={selectedInterest} call={selectedCall} user={user} onUploadSuccess={fetchData} isRevision={true} />
    )}
     <AlertDialog open={isWithdrawConfirmationOpen} onOpenChange={setIsWithdrawConfirmationOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>This will withdraw your interest from the call. Any uploaded presentation will also be deleted. This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setSelectedInterest(null)}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleWithdrawInterest} className="bg-destructive hover:bg-destructive/90">Confirm Withdrawal</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
