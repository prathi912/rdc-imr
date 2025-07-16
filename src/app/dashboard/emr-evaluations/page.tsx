// src/app/dashboard/emr-evaluations/page.tsx
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { User, FundingCall, EmrInterest, EmrEvaluation } from '@/types';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, onSnapshot, doc } from 'firebase/firestore';
import { PageHeader } from '@/components/page-header';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, ThumbsDown, ThumbsUp, History as HistoryIcon, UserCheck, UserX, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { EMR_EVALUATION_RECOMMENDATIONS, EmrEvaluationForm } from '@/components/emr/emr-evaluation-form';

function EvaluationDetailsDialog({ interest, call }: { interest: EmrInterestWithEvaluations, call: FundingCall }) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm">View Evaluations</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Evaluations for {interest.userName}</DialogTitle>
                    <DialogDescription>
                        Call: {call.title}
                    </DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto pr-4 space-y-4">
                    {interest.evaluations.length > 0 ? interest.evaluations.map(evaluation => (
                        <div key={evaluation.evaluatorUid} className="p-4 border rounded-lg">
                            <div className="flex justify-between items-start">
                               <div>
                                 <p className="font-semibold">{evaluation.evaluatorName}</p>
                                 <p className="text-xs text-muted-foreground">{new Date(evaluation.evaluationDate).toLocaleDateString()}</p>
                               </div>
                                <Badge variant={
                                    evaluation.recommendation === 'Recommended' ? 'default' : 
                                    evaluation.recommendation === 'Not Recommended' ? 'destructive' : 'secondary'
                                } className="capitalize">
                                     {evaluation.recommendation === 'Recommended' && <ThumbsUp className="h-3 w-3 mr-1" />}
                                     {evaluation.recommendation === 'Not Recommended' && <ThumbsDown className="h-3 w-3 mr-1" />}
                                     {evaluation.recommendation === 'Revision is needed' && <HistoryIcon className="h-3 w-3 mr-1" />}
                                    {evaluation.recommendation}
                                </Badge>
                            </div>
                            <p className="text-sm mt-4 text-muted-foreground border-t pt-3">
                                <span className="font-semibold text-foreground">Comments:</span> {evaluation.comments}
                            </p>
                        </div>
                    )) : (
                        <div className="text-center py-8 text-muted-foreground">
                            No evaluations submitted yet.
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}


interface EmrInterestWithEvaluations extends EmrInterest {
    evaluations: EmrEvaluation[];
}

export default function EmrEvaluationsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [interests, setInterests] = useState<EmrInterestWithEvaluations[]>([]);
    const [calls, setCalls] = useState<FundingCall[]>([]);
    const { toast } = useToast();
    const [selectedInterest, setSelectedInterest] = useState<EmrInterestWithEvaluations | null>(null);
    const [isEvaluationFormOpen, setIsEvaluationFormOpen] = useState(false);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
    }, []);

    const fetchData = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        try {
            const callsQuery = query(collection(db, 'fundingCalls'), where('status', '==', 'Meeting Scheduled'));
            const callsSnapshot = await getDocs(callsQuery);
            const callsData = callsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingCall));
            setCalls(callsData);
            
            let interestsQuery;
            if (user.role === 'Super-admin' || user.role === 'admin') {
                interestsQuery = query(collection(db, 'emrInterests'));
            } else {
                 const relevantCallIds = callsData
                    .filter(call => call.meetingDetails?.assignedEvaluators?.includes(user.uid))
                    .map(call => call.id);

                if (relevantCallIds.length === 0) {
                    setInterests([]);
                    setLoading(false);
                    return;
                }
                interestsQuery = query(collection(db, 'emrInterests'), where('callId', 'in', relevantCallIds));
            }
            
            const interestsSnapshot = await getDocs(interestsQuery);
            const interestsData = interestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));

            const interestsWithEvaluations = await Promise.all(
              interestsData.map(async interest => {
                const evaluationsCol = collection(db, 'emrInterests', interest.id, 'evaluations');
                const evaluationsSnapshot = await getDocs(evaluationsCol);
                const evaluations = evaluationsSnapshot.docs.map(doc => doc.data() as EmrEvaluation);
                return { ...interest, evaluations };
              })
            );

            // For non-admins, filter to only show interests they are assigned to evaluate
            if (user.role !== 'Super-admin' && user.role !== 'admin') {
                setInterests(interestsWithEvaluations.filter(interest => {
                    const call = callsData.find(c => c.id === interest.callId);
                    return call?.meetingDetails?.assignedEvaluators?.includes(user.uid);
                }));
            } else {
                setInterests(interestsWithEvaluations);
            }

        } catch (error) {
            console.error("Error fetching EMR evaluation data:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch EMR evaluation data.' });
        } finally {
            setLoading(false);
        }
    }, [user, toast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const isSuperAdmin = user?.role === 'Super-admin';

    const getCallTitle = (callId: string) => calls.find(c => c.id === callId)?.title || 'Unknown Call';
    
    const handleEvaluationSubmitted = () => {
        setIsEvaluationFormOpen(false);
        setSelectedInterest(null);
        fetchData(); // Refetch all data to update the UI
    };

    return (
        <div className="container mx-auto py-10">
            <PageHeader
                title="EMR Evaluations"
                description={isSuperAdmin ? "Review all submitted EMR evaluations." : "EMR presentations assigned to you for evaluation."}
            />
            <div className="mt-8">
                {loading ? (
                    <Card><CardContent className="pt-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
                ) : interests.length > 0 ? (
                    <Card>
                        <CardContent className="pt-6">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Applicant</TableHead>
                                        <TableHead>Funding Call</TableHead>
                                        <TableHead>Presentation</TableHead>
                                        <TableHead>My Status</TableHead>
                                        {isSuperAdmin && <TableHead>Evaluations</TableHead>}
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {interests.map(interest => {
                                        const myEvaluation = interest.evaluations.find(e => e.evaluatorUid === user?.uid);
                                        const call = calls.find(c => c.id === interest.callId);
                                        return (
                                            <TableRow key={interest.id}>
                                                <TableCell className="font-medium">{interest.userName}</TableCell>
                                                <TableCell>{getCallTitle(interest.callId)}</TableCell>
                                                <TableCell>
                                                    {interest.pptUrl ? (
                                                        <Button asChild variant="link" className="p-0 h-auto">
                                                            <a href={interest.pptUrl} target="_blank" rel="noopener noreferrer"><FileText className="h-4 w-4 mr-1"/> View</a>
                                                        </Button>
                                                    ) : "Not Submitted"}
                                                </TableCell>
                                                <TableCell>
                                                    {myEvaluation ? <Badge variant="default"><UserCheck className="h-3 w-3 mr-1"/> Submitted</Badge> : <Badge variant="secondary"><UserX className="h-3 w-3 mr-1"/> Pending</Badge>}
                                                </TableCell>
                                                {isSuperAdmin && (
                                                    <TableCell>
                                                        {interest.evaluations.length > 0 ? (
                                                            <EvaluationDetailsDialog interest={interest} call={call!} />
                                                        ) : 'None'}
                                                    </TableCell>
                                                )}
                                                <TableCell className="text-right">
                                                    <Button variant="outline" size="sm" onClick={() => { setSelectedInterest(interest); setIsEvaluationFormOpen(true); }}>
                                                        <Eye className="h-4 w-4 mr-2"/> {myEvaluation ? "View/Edit" : "Evaluate"}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                ) : (
                    <Card>
                        <CardContent className="text-center py-12 text-muted-foreground">
                            No EMR presentations are currently assigned to you for evaluation.
                        </CardContent>
                    </Card>
                )}
            </div>
            {selectedInterest && user && (
                <EmrEvaluationForm
                    isOpen={isEvaluationFormOpen}
                    onOpenChange={setIsEvaluationFormOpen}
                    interest={selectedInterest}
                    user={user}
                    onEvaluationSubmitted={handleEvaluationSubmitted}
                />
            )}
        </div>
    );
}
