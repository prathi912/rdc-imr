
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
import { Badge } from '@/components/ui/badge';
import { Calendar, CheckCircle, Clock, Edit, Plus, Trash2, Users, ChevronLeft, ChevronRight, Link as LinkIcon } from 'lucide-react';
import type { FundingCall, User, EmrInterest } from '@/types';
import { format, differenceInDays, differenceInHours, differenceInMinutes, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { registerEmrInterest } from '@/app/actions';
import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar as CalendarPicker } from '../ui/calendar';


interface EmrCalendarProps {
  user: User;
}

const callSchema = z.object({
  title: z.string().min(5, 'Call title is required.'),
  agency: z.string().min(2, 'Funding agency is required.'),
  description: z.string().optional(),
  callType: z.enum(['Fellowship', 'Grant', 'Collaboration', 'Other']),
  applyDeadline: z.date({ required_error: 'Application deadline is required.'}),
  interestDeadline: z.date({ required_error: 'Interest registration deadline is required.'}),
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
        return <span className="text-destructive font-semibold">Registration Closed</span>;
    }

    const days = differenceInDays(deadLineDate, now);
    if (days > 0) return <span>{days} day{days > 1 ? 's' : ''} left</span>;

    const hours = differenceInHours(deadLineDate, now);
    if (hours > 0) return <span>{hours} hour{hours > 1 ? 's' : ''} left</span>;

    const minutes = differenceInMinutes(deadLineDate, now);
    return <span>{minutes} minute{minutes > 1 ? 's' : ''} left</span>;
};

interface RegistrationsDialogProps {
    call: FundingCall;
    interests: EmrInterest[];
    allUsers: User[];
}

function RegistrationsDialog({ call, interests, allUsers }: RegistrationsDialogProps) {
    const userMap = new Map(allUsers.map(u => [u.uid, u]));
    const registeredInterests = interests.filter(i => i.callId === call.id);

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm"><Users className="mr-2 h-4 w-4" /> View Registrations ({registeredInterests.length})</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Registered Interest for: {call.title}</DialogTitle>
                    <DialogDescription>
                        The following users have registered their interest for this funding call.
                    </DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto">
                    {registeredInterests.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Institute</TableHead>
                                    <TableHead>Department</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {registeredInterests.map(interest => {
                                    const interestedUser = userMap.get(interest.userId);
                                    return (
                                        <TableRow key={interest.id}>
                                            <TableCell className="font-medium">
                                                {interestedUser?.misId ? (
                                                    <Link href={`/profile/${interestedUser.misId}`} target="_blank" className="text-primary hover:underline">
                                                        {interest.userName}
                                                    </Link>
                                                ) : (
                                                    interest.userName
                                                )}
                                            </TableCell>
                                            <TableCell>{interest.userEmail}</TableCell>
                                            <TableCell>{interestedUser?.institute || interest.faculty}</TableCell>
                                            <TableCell>{interestedUser?.department || interest.department}</TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-center p-8 text-muted-foreground">
                            No users have registered for this call yet.
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

function AddEditCallDialog({
  isOpen,
  onOpenChange,
  existingCall,
  user,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  existingCall?: FundingCall | null;
  user: User;
}) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const form = useForm<z.infer<typeof callSchema>>({
    resolver: zodResolver(callSchema),
  });

  useEffect(() => {
    if (existingCall) {
      form.reset({
        ...existingCall,
        interestDeadline: parseISO(existingCall.interestDeadline),
        applyDeadline: parseISO(existingCall.applyDeadline),
      });
    } else {
      form.reset({
        title: '',
        agency: '',
        description: '',
        callType: 'Grant',
        detailsUrl: '',
        interestDeadline: undefined,
        applyDeadline: undefined,
      });
    }
  }, [existingCall, form]);

  const handleSaveCall = async (values: z.infer<typeof callSchema>) => {
    setIsSubmitting(true);
    try {
      const interestDeadline = new Date(values.interestDeadline);
      interestDeadline.setHours(17, 0, 0, 0); // Set time to 5:00 PM

      const callData = {
        ...values,
        interestDeadline: interestDeadline.toISOString(),
        applyDeadline: values.applyDeadline.toISOString(),
      };

      if (existingCall) {
        const callRef = doc(db, 'fundingCalls', existingCall.id);
        await updateDoc(callRef, callData);
        toast({ title: 'Success', description: 'Funding call has been updated.' });
      } else {
        await addDoc(collection(db, 'fundingCalls'), {
          ...callData,
          createdAt: new Date().toISOString(),
          createdBy: user.uid,
          status: 'Open',
        });
        toast({ title: 'Success', description: 'Funding call has been added.' });
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving funding call:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not save funding call.' });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleDeleteCall = async () => {
    if (!existingCall) return;
    try {
        await deleteDoc(doc(db, 'fundingCalls', existingCall.id));
        toast({ title: 'Success', description: 'Funding call deleted.' });
        onOpenChange(false);
    } catch (error) {
        console.error('Error deleting funding call:', error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not delete funding call.' });
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{existingCall ? 'Edit' : 'Add New'} Funding Call</DialogTitle>
          <DialogDescription>
            {existingCall ? 'Update the details for this EMR opportunity.' : 'Enter the details for the new EMR opportunity.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="add-edit-call-form" onSubmit={form.handleSubmit(handleSaveCall)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
             <FormField name="title" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Call Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
             <FormField name="agency" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Funding Agency</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
             <FormField name="description" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem> )} />
             <FormField name="callType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Call Type</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Fellowship">Fellowship</SelectItem><SelectItem value="Grant">Grant</SelectItem><SelectItem value="Collaboration">Collaboration</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <FormField name="interestDeadline" control={form.control} render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Interest Registration Deadline</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? (format(field.value, "PPP")) : (<span>Pick a date</span>)}<Calendar className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><CalendarPicker mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )} />
               <FormField name="applyDeadline" control={form.control} render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Agency Application Deadline</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? (format(field.value, "PPP")) : (<span>Pick a date</span>)}<Calendar className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><CalendarPicker mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )} />
            </div>
             <FormField name="detailsUrl" control={form.control} render={({ field }) => ( <FormItem><FormLabel>URL for Full Details</FormLabel><FormControl><Input type="url" {...field} /></FormControl><FormMessage /></FormItem> )} />
          </form>
        </Form>
        <DialogFooter className="justify-between">
          <div>
            {existingCall && (
                <Button variant="destructive" onClick={() => setIsDeleteDialogOpen(true)}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
            )}
          </div>
          <div className="flex gap-2">
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button type="submit" form="add-edit-call-form" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Call'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
       <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>This will permanently delete the funding call. This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteCall} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </Dialog>
  );
}


export function EmrCalendar({ user }: EmrCalendarProps) {
    const { toast } = useToast();
    const [calls, setCalls] = useState<FundingCall[]>([]);
    const [userInterests, setUserInterests] = useState<EmrInterest[]>([]);
    const [allInterests, setAllInterests] = useState<EmrInterest[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddEditDialogOpen, setIsAddEditDialogOpen] = useState(false);
    const [selectedCall, setSelectedCall] = useState<FundingCall | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const isAdmin = user.role === 'Super-admin' || user.role === 'admin';
    const isSuperAdmin = user.role === 'Super-admin';

    const firstDay = startOfMonth(currentMonth);
    const lastDay = endOfMonth(currentMonth);
    const daysInMonth = eachDayOfInterval({ start: firstDay, end: lastDay });
    const startingDayIndex = getDay(firstDay); // 0 = Sunday, 1 = Monday...

    const callsByDate = calls.reduce((acc, call) => {
        const date = format(parseISO(call.interestDeadline), 'yyyy-MM-dd');
        if (!acc[date]) acc[date] = [];
        acc[date].push(call);
        return acc;
    }, {} as Record<string, FundingCall[]>);


    useEffect(() => {
        const fetchAllData = async () => {
            setLoading(true);
            try {
                if (isAdmin) {
                    const usersQuery = query(collection(db, 'users'));
                    const usersSnapshot = await getDocs(usersQuery);
                    setAllUsers(usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User)));
                }

                const callsQuery = query(collection(db, 'fundingCalls'), orderBy('interestDeadline', 'desc'));
                onSnapshot(callsQuery, (snapshot) => {
                    setCalls(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingCall)));
                });

                const userInterestsQuery = query(collection(db, 'emrInterests'), where('userId', '==', user.uid));
                onSnapshot(userInterestsQuery, (snapshot) => {
                    setUserInterests(snapshot.docs.map(doc => doc.data() as EmrInterest));
                });

                if (isAdmin) {
                    const allInterestsQuery = query(collection(db, 'emrInterests'));
                    onSnapshot(allInterestsQuery, (snapshot) => {
                        setAllInterests(snapshot.docs.map(doc => doc.data() as EmrInterest));
                    });
                }
                
                setLoading(false);

            } catch (error) {
                console.error("Error fetching data:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch EMR data.' });
                setLoading(false);
            }
        };
        fetchAllData();
    }, [toast, user.uid, isAdmin]);


    const handleRegisterInterest = async (callId: string) => {
        const result = await registerEmrInterest(callId, user);
        if (result.success) {
            toast({ title: 'Interest Registered!', description: 'Your interest has been successfully recorded.' });
        } else {
            toast({ variant: 'destructive', title: 'Registration Failed', description: result.error });
        }
    };

    if (loading) {
        return <Skeleton className="h-96 w-full" />;
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                    <h3 className="text-xl font-semibold text-center w-48">{format(currentMonth, 'MMMM yyyy')}</h3>
                    <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="h-4 w-4" /></Button>
                </div>
                {isSuperAdmin && (
                    <Button onClick={() => { setSelectedCall(null); setIsAddEditDialogOpen(true); }}><Plus className="mr-2 h-4 w-4" /> Add New Call</Button>
                )}
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-7 border-t border-l">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className="text-center font-semibold p-2 border-b border-r text-sm text-muted-foreground">{day}</div>
                    ))}
                    {Array.from({ length: startingDayIndex }).map((_, i) => (
                        <div key={`empty-${i}`} className="border-b border-r"></div>
                    ))}
                    {daysInMonth.map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const callsOnDay = callsByDate[dateStr] || [];
                        return (
                            <div key={dateStr} className="h-48 border-b border-r p-2 flex flex-col overflow-hidden">
                                <span className="font-semibold">{format(day, 'd')}</span>
                                <div className="flex-grow overflow-y-auto space-y-1 mt-1 text-xs">
                                    {callsOnDay.map(call => {
                                        const userHasRegistered = userInterests.some(i => i.callId === call.id);
                                        return (
                                            <div key={call.id} className="p-1.5 rounded-md bg-muted/50 text-muted-foreground">
                                                <p className="font-semibold text-foreground truncate">{call.title}</p>
                                                <p className="truncate">{call.agency}</p>
                                                {userHasRegistered && <Badge variant="default" className="mt-1 w-full justify-center">Registered</Badge>}
                                                {isAdmin && <Button variant="ghost" size="sm" className="w-full mt-1 text-xs h-6" onClick={() => { setSelectedCall(call); setIsAddEditDialogOpen(true); }}>Edit</Button>}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>
                
                 <div className="mt-8 space-y-4">
                    <h4 className="font-semibold">All Upcoming Deadlines</h4>
                     {calls.filter(c => new Date(c.interestDeadline) >= new Date()).map(call => {
                         const userHasRegistered = userInterests.some(i => i.callId === call.id);
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
                                    {call.detailsUrl && <Button variant="link" asChild className="p-0 h-auto mt-1"><Link href={call.detailsUrl} target="_blank" rel="noopener noreferrer"><LinkIcon className="h-3 w-3 mr-1"/> View Details</Link></Button>}
                                     <div className="text-xs text-muted-foreground mt-2 space-y-1">
                                        <p>Interest Deadline: <span className="font-medium text-foreground">{format(parseISO(call.interestDeadline), 'PPp')}</span></p>
                                        <p>Application Deadline: <span className="font-medium text-foreground">{format(parseISO(call.applyDeadline), 'PP')}</span></p>
                                    </div>
                                </div>
                                <div className="flex-shrink-0 text-center md:text-right space-y-2">
                                    {userHasRegistered ? (
                                        <div className="flex items-center gap-2 text-green-600 font-semibold p-2 bg-green-50 rounded-md dark:bg-green-900/20">
                                            <CheckCircle className="h-5 w-5"/>
                                            <span>Interest Registered</span>
                                        </div>
                                    ) : (
                                        <>
                                            <Button onClick={() => handleRegisterInterest(call.id)} disabled={isSuperAdmin || isInterestDeadlinePast}>
                                                Register Interest
                                            </Button>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                <TimeLeft deadline={call.interestDeadline} />
                                            </p>
                                        </>
                                    )}
                                    {isAdmin && (
                                        <RegistrationsDialog call={call} interests={allInterests} allUsers={allUsers} />
                                    )}
                                    {isSuperAdmin && (
                                        <Button variant="ghost" size="sm" onClick={() => { setSelectedCall(call); setIsAddEditDialogOpen(true); }}><Edit className="h-4 w-4 mr-1"/>Edit</Button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>

            </CardContent>
            {isSuperAdmin && (
                <AddEditCallDialog
                    isOpen={isAddEditDialogOpen}
                    onOpenChange={setIsAddEditDialogOpen}
                    existingCall={selectedCall}
                    user={user}
                />
            )}
        </Card>
    );
}
