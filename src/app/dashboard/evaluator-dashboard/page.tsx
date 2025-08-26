
'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { User, Project, FundingCall, EmrInterest, EmrEvaluation } from '@/types';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, onSnapshot, orderBy } from 'firebase/firestore';
import { EmrEvaluationList } from '@/components/emr/emr-evaluation-list';
import { ProjectList } from '@/components/projects/project-list';

export default function EvaluatorDashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  
  // IMR Data
  const [imrProjectsToReview, setImrProjectsToReview] = useState<Project[]>([]);

  // EMR Data
  const [emrInterests, setEmrInterests] = useState<any[]>([]);
  const [emrCalls, setEmrCalls] = useState<FundingCall[]>([]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    } else {
      setLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
        // --- IMR Fetching ---
        const imrProjectsCol = collection(db, 'projects');
        const imrQuery = query(
          imrProjectsCol,
          where('status', '==', 'Under Review'),
          where('meetingDetails.assignedEvaluators', 'array-contains', user.uid),
          orderBy('submissionDate', 'desc')
        );
        const imrSnapshot = await getDocs(imrQuery);
        const imrProjectList = imrSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
        const pendingImrForCurrentUser = imrProjectList.filter(p => !p.evaluatedBy?.includes(user.uid));
        setImrProjectsToReview(pendingImrForCurrentUser);

        // --- EMR Fetching ---
        // 1. Find all funding calls where a meeting has been scheduled.
        const callsWithMeetingsQuery = query(collection(db, 'fundingCalls'), where('status', '==', 'Meeting Scheduled'));
        const callsSnapshot = await getDocs(callsWithMeetingsQuery);
        
        // 2. From those, filter for calls where the current user is an assigned evaluator.
        const relevantCalls = callsSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as FundingCall))
            .filter(call => call.meetingDetails?.assignedEvaluators?.includes(user.uid));
        
        setEmrCalls(relevantCalls);
        const relevantCallIds = relevantCalls.map(doc => doc.id);

        if (relevantCallIds.length > 0) {
            // 3. Fetch all interests (applicants) for those specific calls.
            const interestsQuery = query(collection(db, 'emrInterests'), where('callId', 'in', relevantCallIds));
            const interestsSnapshot = await getDocs(interestsQuery);
            const interestsData = interestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));
            
            // 4. For each interest, fetch their submitted evaluations.
            const interestsWithDetails = await Promise.all(
                interestsData.map(async interest => {
                    const evaluationsCol = collection(db, 'emrInterests', interest.id, 'evaluations');
                    const evaluationsSnapshot = await getDocs(evaluationsCol);
                    const evaluations = evaluationsSnapshot.docs.map(doc => doc.data() as EmrEvaluation);
                    return { ...interest, evaluations };
                })
            );

            setEmrInterests(interestsWithDetails);
        } else {
            setEmrInterests([]);
        }

    } catch (error) {
        console.error("Error fetching evaluation data:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch your assigned evaluations.' });
    } finally {
        setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if(user) {
        fetchData();
    }
  }, [user, fetchData]);

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Evaluation Queue" description="Projects and presentations awaiting your review." showBackButton={false} />
      <div className="mt-8">
        <Tabs defaultValue="imr">
          <TabsList>
            <TabsTrigger value="imr">IMR Projects</TabsTrigger>
            <TabsTrigger value="emr">EMR Presentations</TabsTrigger>
          </TabsList>
          <TabsContent value="imr" className="mt-4">
            {loading || !user ? (
              <Card><CardContent className="pt-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
            ) : imrProjectsToReview.length > 0 ? (
              <ProjectList projects={imrProjectsToReview} currentUser={user} />
            ) : (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No IMR projects are currently awaiting your evaluation.</CardContent></Card>
            )}
          </TabsContent>
          <TabsContent value="emr" className="mt-4">
             {loading ? (
              <Card><CardContent className="pt-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
             ) : (
              <EmrEvaluationList
                interests={emrInterests}
                calls={emrCalls}
                user={user!}
                onActionComplete={fetchData}
              />
             )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
