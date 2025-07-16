
'use client';

import { useState, useEffect, useCallback } from 'react';
import * as z from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { db } from '@/lib/config';
import { collection, query, orderBy, onSnapshot, addDoc, doc, deleteDoc, updateDoc, where, getDocs } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Calendar, CheckCircle, Clock, Edit, Plus, Trash2, Users } from 'lucide-react';
import type { FundingCall, User, EmrInterest } from '@/types';
import { format, differenceInDays, differenceInHours, differenceInMinutes, parseISO } from 'date-fns';
import { registerEmrInterest } from '@/app/actions';
import Link from 'next/link';

interface EmrCalendarProps {
  user: User;
}

const callSchema = z.object({
  title: z.string().min(5, 'Call title is required.'),
  agency: z.string().min(2, 'Funding agency is required.'),
  description: z.string().optional(),
  callType: z.enum(['Fellowship', 'Grant', 'Collaboration', 'Other']),
  applyDeadline: z.string().min(1, "Application deadline is required."),
  interestDeadline: z.string().min(1, "Interest registration deadline is required."),
  detailsUrl: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
});

const TimeLeft = ({ deadline }: { deadline: string }) => {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 60000); // Update every minute
        return () => clearInterval(interval);
    }, []);

    const deadLineDate = parseISO(deadline);
    if (deadLineDate < now) {
        return <span className="text-destructive">Registration Closed</span>;
    }

    const days = differenceInDays(deadLineDate, now);
    if (days > 0) return <span>{days} day{days > 1 ? 's' : ''} left</span>;

    const hours = differenceInHours(deadLineDate, now);
    if (hours > 0) return <span>{hours} hour{hours > 1 ? 's' : ''} left</span>;

    const minutes = differenceInMinutes(deadLineDate, now);
    return <span>{minutes} minute{minutes > 1 ? 's' : ''} left</span>;
};

export function EmrCalendar({ user }: EmrCalendarProps) {
    const { toast } = useToast();
    const [calls, setCalls] = useState<FundingCall[]>([]);
    const [interests, setInterests] = useState<EmrInterest[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isAdmin = user.role === 'Super-admin' || user.role === 'admin';

    const form = useForm<z.infer<typeof callSchema>>({
        resolver: zodResolver(callSchema),
        defaultValues: {
            title: '',
            agency: '',
            description: '',
            callType: 'Grant',
            detailsUrl: '',
        },
    });

    useEffect(() => {
        const q = query(collection(db, 'fundingCalls'), orderBy('interestDeadline', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const callsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingCall));
            setCalls(callsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching funding calls:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch funding calls.' });
            setLoading(false);
        });
        return () => unsubscribe();
    }, [toast]);

    useEffect(() => {
        if (!user) return;
        const q = query(collection(db, 'emrInterests'), where('userId', '==', user.uid));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const interestsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));
            setInterests(interestsData);
        });
        return () => unsubscribe();
    }, [user]);

    const handleAddCall = async (values: z.infer<typeof callSchema>) => {
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'fundingCalls'), {
                ...values,
                createdAt: new Date().toISOString(),
                createdBy: user.uid,
                status: 'Open',
            });
            toast({ title: 'Success', description: 'Funding call has been added.' });
            setIsDialogOpen(false);
            form.reset();
        } catch (error) {
            console.error("Error adding funding call:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not add funding call.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleRegisterInterest = async (callId: string) => {
        const result = await registerEmrInterest(callId, user);
        if (result.success) {
            toast({ title: 'Interest Registered!', description: 'Your interest has been successfully recorded.' });
        } else {
            toast({ variant: 'destructive', title: 'Registration Failed', description: result.error });
        }
    };

    if (loading) {
        return <Skeleton className="h-64 w-full" />;
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>EMR Funding Calls</CardTitle>
                    <CardDescription>Current and upcoming funding opportunities.</CardDescription>
                </div>
                {isAdmin && (
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button><Plus className="mr-2 h-4 w-4" /> Add New Call</Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-2xl">
                            <DialogHeader>
                                <DialogTitle>Add New Funding Call</DialogTitle>
                                <DialogDescription>Enter the details for the new EMR opportunity.</DialogDescription>
                            </DialogHeader>
                            <Form {...form}>
                                <form id="add-call-form" onSubmit={form.handleSubmit(handleAddCall)} className="space-y-4 py-4">
                                     <FormField name="title" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Call Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                     <FormField name="agency" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Funding Agency</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                     <FormField name="description" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem> )} />
                                     <FormField name="callType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Call Type</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Fellowship">Fellowship</SelectItem><SelectItem value="Grant">Grant</SelectItem><SelectItem value="Collaboration">Collaboration</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField name="interestDeadline" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Interest Registration Deadline</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                        <FormField name="applyDeadline" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Agency Application Deadline</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                     </div>
                                     <FormField name="detailsUrl" control={form.control} render={({ field }) => ( <FormItem><FormLabel>URL for Full Details</FormLabel><FormControl><Input type="url" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                </form>
                            </Form>
                            <DialogFooter>
                                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                                <Button type="submit" form="add-call-form" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Call'}</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </CardHeader>
            <CardContent>
                {calls.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                        <Calendar className="mx-auto h-12 w-12" />
                        <p className="mt-4">No funding calls have been added yet.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {calls.map(call => {
                             const userInterest = interests.find(i => i.callId === call.id);
                             const isInterestDeadlinePast = new Date(call.interestDeadline) < new Date();
                             
                            return (
                                <div key={call.id} className="border p-4 rounded-lg flex flex-col md:flex-row md:items-start justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-semibold">{call.title}</h4>
                                            <Badge variant="secondary">{call.callType}</Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground">Agency: {call.agency}</p>
                                        <p className="text-sm mt-2">{call.description}</p>
                                        {call.detailsUrl && <Button variant="link" asChild className="p-0 h-auto mt-1"><Link href={call.detailsUrl} target="_blank" rel="noopener noreferrer">View Full Details</Link></Button>}
                                         <div className="text-xs text-muted-foreground mt-2 space-y-1">
                                            <p>Interest Deadline: <span className="font-medium text-foreground">{format(parseISO(call.interestDeadline), 'PPp')}</span></p>
                                            <p>Application Deadline: <span className="font-medium text-foreground">{format(parseISO(call.applyDeadline), 'PPp')}</span></p>
                                        </div>
                                    </div>
                                    <div className="flex-shrink-0 text-center md:text-right">
                                        {userInterest ? (
                                            <div className="flex items-center gap-2 text-green-600 font-semibold">
                                                <CheckCircle className="h-5 w-5"/>
                                                <span>Interest Registered</span>
                                            </div>
                                        ) : isInterestDeadlinePast ? (
                                             <div className="flex items-center gap-2 text-destructive font-semibold">
                                                <Clock className="h-5 w-5"/>
                                                <span>Registration Closed</span>
                                            </div>
                                        ) : (
                                            <>
                                                <Button onClick={() => handleRegisterInterest(call.id)}>Register Interest</Button>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    <TimeLeft deadline={call.interestDeadline} />
                                                </p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
