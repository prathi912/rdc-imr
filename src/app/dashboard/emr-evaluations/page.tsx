
// src/app/dashboard/emr-evaluations/page.tsx
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import type { User, FundingCall, EmrInterest, EmrEvaluation } from '@/types';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { PageHeader } from '@/components/page-header';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, ThumbsDown, ThumbsUp, History as HistoryIcon, UserCheck, UserX, FileText, Download } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { EmrEvaluationForm } from '@/components/emr/emr-evaluation-form';

function AdminEvaluationOverviewDialog({
    interest,
    call,
    user,
    onEvaluationSubmitted
}: {
    interest: EmrInterestWithDetails,
    call: FundingCall,
    user: User,
    onEvaluationSubmitted: () => void
}) {
    const [isMyEvaluationFormOpen, setIsMyEvaluationFormOpen] = useState(false);

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm"><Eye className="h-4 w-4 mr-2"/> Manage Evaluations</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Evaluations for {interest.userName}</DialogTitle>
                    <DialogDescription>Call: {call.title}</DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto pr-4 space-y-4">
                    {interest.evaluations.length > 0 ? interest.evaluations.map(evaluation => (
                        <div key={evaluation.evaluatorUid} className="p-4 border rounded-lg">
                            <div className="flex justify-between items-start">
                               <div><p className="font-semibold">{evaluation.evaluatorName}</p><p className="text-xs text-muted-foreground">{new Date(evaluation.evaluationDate).toLocaleDateString()}</p></div>
                                <Badge variant={ evaluation.recommendation === 'Recommended' ? 'default' : evaluation.recommendation === 'Not Recommended' ? 'destructive' : 'secondary' } className="capitalize">
                                     {evaluation.recommendation === 'Recommended' && <ThumbsUp className="h-3 w-3 mr-1" />}
                                     {evaluation.recommendation === 'Not Recommended' && <ThumbsDown className="h-3 w-3 mr-1" />}
                                     {evaluation.recommendation === 'Revision is needed' && <HistoryIcon className="h-3 w-3 mr-1" />}
                                    {evaluation.recommendation}
                                </Badge>
                            </div>
                            <p className="text-sm mt-4 text-muted-foreground border-t pt-3"><span className="font-semibold text-foreground">Comments:</span> {evaluation.comments}</p>
                        </div>
                    )) : (<div className="text-center py-8 text-muted-foreground">No evaluations submitted yet.</div>)}
                </div>
                 <DialogFooter>
                    <Button variant="secondary" onClick={() => setIsMyEvaluationFormOpen(true)}>
                        {interest.evaluations.some(e => e.evaluatorUid === user.uid) ? 'View My Evaluation' : 'Submit My Evaluation'}
                    </Button>
                    <DialogClose asChild>
                        <Button variant="outline">Close</Button>
                    </DialogClose>
                </DialogFooter>
                
                {/* Nested dialog for the admin's own evaluation form */}
                <EmrEvaluationForm 
                    isOpen={isMyEvaluationFormOpen} 
                    onOpenChange={setIsMyEvaluationFormOpen} 
                    interest={interest} 
                    user={user} 
                    onEvaluationSubmitted={() => {
                        setIsMyEvaluationFormOpen(false);
                        onEvaluationSubmitted();
                    }}
                />
            </DialogContent>
        </Dialog>
    );
}

interface EmrInterestWithDetails extends EmrInterest {
    evaluations: EmrEvaluation[];
    userDetails: User | null;
}

export default function EmrEvaluationsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [interests, setInterests] = useState<EmrInterestWithDetails[]>([]);
    const [calls, setCalls] = useState<FundingCall[]>([]);
    const { toast } = useToast();
    const [selectedInterest, setSelectedInterest] = useState<EmrInterestWithDetails | null>(null);
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
            // Step 1: Fetch all relevant interests first.
            let interestsQuery;
            if (user.role === 'Super-admin' || user.role === 'admin') {
                interestsQuery = query(collection(db, 'emrInterests'));
            } else {
                // For evaluators, we still need to find which calls they are assigned to first.
                const callsWithMyUidQuery = query(collection(db, 'fundingCalls'), where('meetingDetails.assignedEvaluators', 'array-contains', user.uid));
                const callsSnapshot = await getDocs(callsWithMyUidQuery);
                const relevantCallIds = callsSnapshot.docs.map(doc => doc.id);

                if (relevantCallIds.length === 0) {
                    setInterests([]);
                    setCalls([]);
                    setLoading(false);
                    return;
                }
                interestsQuery = query(collection(db, 'emrInterests'), where('callId', 'in', relevantCallIds));
            }

            const interestsSnapshot = await getDocs(interestsQuery);
            const interestsData = interestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));

            // Step 2: From the interests, get the unique set of call IDs.
            const uniqueCallIds = [...new Set(interestsData.map(i => i.callId))];

            // Step 3: Fetch only the funding calls that are actually needed.
            let callsData: FundingCall[] = [];
            if (uniqueCallIds.length > 0) {
                const callsQuery = query(collection(db, 'fundingCalls'), where('__name__', 'in', uniqueCallIds));
                const callsSnapshot = await getDocs(callsQuery);
                callsData = callsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingCall));
            }
            setCalls(callsData);
            
            // Step 4: Fetch user details for all applicants
            const allUserIds = [...new Set(interestsData.map(i => i.userId))];
            const usersMap = new Map<string, User>();
            if (allUserIds.length > 0) {
              const usersQuery = query(collection(db, 'users'), where('__name__', 'in', allUserIds));
              const usersSnapshot = await getDocs(usersQuery);
              usersSnapshot.forEach(doc => usersMap.set(doc.id, { uid: doc.id, ...doc.data()} as User));
            }

            // Step 5: Combine all data
            const interestsWithDetails = await Promise.all(
              interestsData
                .filter(interest => {
                    const call = callsData.find(c => c.id === interest.callId);
                    return call && call.meetingDetails?.assignedEvaluators;
                })
                .map(async interest => {
                    const evaluationsCol = collection(db, 'emrInterests', interest.id, 'evaluations');
                    const evaluationsSnapshot = await getDocs(evaluationsCol);
                    const evaluations = evaluationsSnapshot.docs.map(doc => doc.data() as EmrEvaluation);
                    const userDetails = usersMap.get(interest.userId) || null;
                    return { ...interest, evaluations, userDetails };
                })
            );
            
            if (user.role !== 'Super-admin' && user.role !== 'admin') {
                 setInterests(interestsWithDetails.filter(interest => {
                    const call = callsData.find(c => c.id === interest.callId);
                    return call?.meetingDetails?.assignedEvaluators?.includes(user.uid);
                }));
            } else {
                setInterests(interestsWithDetails);
            }

        } catch (error) {
            console.error("Error fetching EMR evaluation data:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch EMR evaluation data.' });
        } finally { setLoading(false); }
    }, [user, toast]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const isSuperAdmin = user?.role === 'Super-admin';

    const getCallTitle = (callId: string) => calls.find(c => c.id === callId)?.title || 'Unknown Call';
    
    const handleEvaluationSubmitted = () => { setIsEvaluationFormOpen(false); setSelectedInterest(null); fetchData(); };
    
    const handleExport = () => {
        if (!user) return;
        const dataToExport = interests.map(interest => {
            const myEvaluation = interest.evaluations.find(e => e.evaluatorUid === user.uid);
            const call = calls.find(c => c.id === interest.callId);
            return {
                'Applicant': interest.userName,
                'Funding Call': call?.title || 'Unknown',
                'Institute': interest.userDetails?.institute || 'N/A',
                'Department': interest.userDetails?.department || 'N/A',
                'Faculty': interest.userDetails?.faculty || 'N/A',
                'Presentation': interest.pptUrl || 'Not Submitted',
                'My Status': myEvaluation ? 'Submitted' : 'Pending',
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'EMR_Evaluations');
        XLSX.writeFile(workbook, `emr_evaluations_export_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div className="container mx-auto py-10">
            <PageHeader
                title="EMR Evaluations"
                description={isSuperAdmin ? "Review all submitted EMR evaluations." : "EMR presentations assigned to you for evaluation."}
            >
                {interests.length > 0 && (
                    <Button onClick={handleExport} disabled={loading}>
                        <Download className="mr-2 h-4 w-4" />
                        Export XLSX
                    </Button>
                )}
            </PageHeader>
            <div className="mt-8">
                {loading ? ( <Card><CardContent className="pt-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
                ) : interests.length > 0 ? (
                    <Card><CardContent className="pt-6 overflow-x-auto"><Table>
                        <TableHeader><TableRow>
                            <TableHead>Applicant</TableHead>
                            <TableHead className="hidden sm:table-cell">Funding Call</TableHead>
                            <TableHead>Presentation</TableHead>
                            <TableHead>My Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>{interests.map(interest => {
                            const myEvaluation = interest.evaluations.find(e => e.evaluatorUid === user?.uid);
                            const call = calls.find(c => c.id === interest.callId);
                            
                            return (
                            <TableRow key={interest.id}>
                                <TableCell className="font-medium"><div>{interest.userName}</div><div className="text-xs text-muted-foreground">{interest.userDetails?.department}, {interest.userDetails?.institute}</div></TableCell>
                                <TableCell className="hidden sm:table-cell">{getCallTitle(interest.callId)}</TableCell>
                                <TableCell>{interest.pptUrl ? (<Button asChild variant="link" className="p-0 h-auto"><a href={interest.pptUrl} target="_blank" rel="noopener noreferrer"><FileText className="h-4 w-4 mr-1"/> View</a></Button>) : "Not Submitted"}</TableCell>
                                <TableCell>{myEvaluation ? <Badge variant="default"><UserCheck className="h-3 w-3 mr-1"/> Submitted</Badge> : <Badge variant="secondary"><UserX className="h-3 w-3 mr-1"/> Pending</Badge>}</TableCell>
                                <TableCell className="text-right">
                                    {isSuperAdmin ? (
                                        <AdminEvaluationOverviewDialog 
                                            interest={interest} 
                                            call={call!} 
                                            user={user!} 
                                            onEvaluationSubmitted={fetchData} 
                                        />
                                    ) : (
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={() => { setSelectedInterest(interest); setIsEvaluationFormOpen(true); }}
                                        >
                                            <Eye className="h-4 w-4 md:mr-2"/> <span className="hidden md:inline">{myEvaluation ? "View" : "Evaluate"}</span>
                                        </Button>
                                    )}
                                </TableCell>
                            </TableRow> );
                        })}</TableBody>
                    </Table></CardContent></Card>
                ) : (
                    <Card><CardContent className="text-center py-12 text-muted-foreground">No EMR presentations are currently assigned to you for evaluation.</CardContent></Card>
                )}
            </div>
            {selectedInterest && user && ( <EmrEvaluationForm isOpen={isEvaluationFormOpen} onOpenChange={setIsEvaluationFormOpen} interest={selectedInterest} user={user} onEvaluationSubmitted={handleEvaluationSubmitted}/>)}
        </div>
    );
}
