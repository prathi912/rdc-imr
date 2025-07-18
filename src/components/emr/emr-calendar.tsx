
'use client';

import { useState, useEffect, useCallback, createRef } from 'react';
import * as z from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { db } from '@/lib/config';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, updateDoc, where, getDocs } from 'firebase/firestore';
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Calendar, CheckCircle, Clock, Edit, Plus, Trash2, Users, ChevronLeft, ChevronRight, Link as LinkIcon, Loader2, Video, Upload, File, NotebookText, Replace, Eye, ChevronDown, MessageSquareWarning, Pencil, CalendarClock, Download, Send } from 'lucide-react';
import type { FundingCall, User, EmrInterest, EmrEvaluation } from '@/types';
import { format, differenceInDays, differenceInHours, differenceInMinutes, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isAfter, subDays, setHours, setMinutes, setSeconds } from 'date-fns';
import { uploadFileToServer, deleteEmrInterest, createFundingCall, findUserByMisId, uploadRevisedEmrPpt, updateEmrStatus, scheduleEmrMeeting, announceEmrCall } from '@/app/actions';
import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar as CalendarPicker } from '../ui/calendar';
import { Textarea } from '../ui/textarea';
import { Separator } from '../ui/separator';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Label } from '../ui/label';
import { EmrActions } from './emr-actions';
import { Checkbox } from '../ui/checkbox';
import * as XLSX from 'xlsx';
import { UploadPptDialog } from './upload-ppt-dialog';

interface EmrCalendarProps {
  user: User;
}

type CalendarEvent = {
  type: 'deadline' | 'meeting' | 'agencyDeadline';
  call: FundingCall;
};

const callSchema = z.object({
  title: z.string().min(5, 'Call title is required.'),
  agency: z.string().min(2, 'Funding agency is required.'),
  description: z.string().optional(),
  callType: z.enum(['Fellowship', 'Grant', 'Collaboration', 'Other']),
  applyDeadline: z.date({ required_error: 'Application deadline is required.'}),
  interestDeadline: z.date({ required_error: 'Interest registration deadline is required.'}),
  detailsUrl: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
  attachments: z.any().optional(),
  notifyAllStaff: z.boolean().default(false).optional(),
});

const scheduleSchema = z.object({
    date: z.date({ required_error: 'A meeting date is required.' }),
    time: z.string().min(1, "Time is required."),
    venue: z.string().min(3, 'Meeting venue is required.'),
    evaluatorUids: z.array(z.string()).min(1, 'Please select at least one evaluator.'),
    applicantUids: z.array(z.string()).min(1, 'Please select at least one applicant.'),
});


const deleteRegistrationSchema = z.object({
    remarks: z.string().min(10, "Please provide a reason for deleting the registration."),
});


const TimeLeft = ({ deadline }: { deadline: string }) => {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 60000); // Update every minute
        return () => clearInterval(interval);
    }, []);

    const deadLineDate = parseISO(deadline);
    if (isAfter(now, deadLineDate)) {
        return <span className="text-destructive font-semibold">Registration Closed</span>;
    }

    const days = differenceInDays(deadLineDate, now);
    if (days > 0) return <span>{days} day{days > 1 ? 's' : ''} left</span>;

    const hours = differenceInHours(deadLineDate, now);
    if (hours > 0) return <span>{hours} hour{hours > 1 ? 's' : ''} left</span>;

    const minutes = differenceInMinutes(deadLineDate, now);
    return <span>{minutes} minute{minutes > 1 ? 's' : ''} left</span>;
};

interface ScheduleMeetingDialogProps {
    call: FundingCall;
    interests: EmrInterest[];
    allUsers: User[];
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onActionComplete: () => void;
}

function ScheduleMeetingDialog({ call, interests, allUsers, isOpen, onOpenChange, onActionComplete }: ScheduleMeetingDialogProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<z.infer<typeof scheduleSchema>>({
        resolver: zodResolver(scheduleSchema),
        defaultValues: {
            venue: 'RDC Committee Room, PIMSR',
            evaluatorUids: call.meetingDetails?.assignedEvaluators || [],
            applicantUids: [],
            date: call.meetingDetails?.date ? parseISO(call.meetingDetails.date) : undefined,
            time: call.meetingDetails?.time || '',
        },
    });

    useEffect(() => {
        form.reset({
            venue: 'RDC Committee Room, PIMSR',
            evaluatorUids: call.meetingDetails?.assignedEvaluators || [],
            applicantUids: [],
            date: call.meetingDetails?.date ? parseISO(call.meetingDetails.date) : undefined,
            time: call.meetingDetails?.time || '',
        });
    }, [call, form]);

    const handleBatchSchedule = async (values: z.infer<typeof scheduleSchema>) => {
        setIsSubmitting(true);
        try {
            const meetingDetails = {
                date: format(values.date, 'yyyy-MM-dd'),
                time: values.time,
                venue: values.venue,
                evaluatorUids: values.evaluatorUids,
            };
            const result = await scheduleEmrMeeting(call.id, meetingDetails, values.applicantUids);

            if (result.success) {
                toast({ title: 'Success', description: 'Meeting slots scheduled and participants notified.' });
                onActionComplete();
                onOpenChange(false);
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        } catch (error) {
            console.error('Error scheduling batch meeting:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not schedule meeting.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    // Show only users who are interested in THIS call and DO NOT have a meeting slot yet
    const usersWithInterest = interests.filter(i => i.callId === call.id && !i.meetingSlot);
    const availableEvaluators = allUsers.filter(u => ['Super-admin', 'admin', 'CRO'].includes(u.role) && !usersWithInterest.some(interest => interest.userId === u.uid));

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Schedule Meeting for: {call.title}</DialogTitle>
                    <DialogDescription>Select applicants and set the details for the evaluation meeting.</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form id="schedule-form" onSubmit={form.handleSubmit(handleBatchSchedule)} className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                            <h4 className="font-semibold">Select Applicants</h4>
                            <FormField
                                control={form.control}
                                name="applicantUids"
                                render={({ field }) => (
                                    <FormItem>
                                        <div className="flex items-center space-x-2 p-2 border-b">
                                            <Checkbox
                                                checked={field.value?.length === usersWithInterest.length && usersWithInterest.length > 0}
                                                onCheckedChange={(checked) => field.onChange(checked ? usersWithInterest.map(i => i.userId) : [])}
                                            />
                                            <FormLabel className="font-medium">Select All</FormLabel>
                                        </div>
                                        {usersWithInterest.map(interest => (
                                            <FormField
                                                key={interest.id}
                                                control={form.control}
                                                name="applicantUids"
                                                render={({ field }) => (
                                                    <FormItem className="flex items-center space-x-2 p-2 border-b">
                                                        <FormControl>
                                                            <Checkbox
                                                                checked={field.value?.includes(interest.userId)}
                                                                onCheckedChange={(checked) => {
                                                                    return checked
                                                                        ? field.onChange([...(field.value || []), interest.userId])
                                                                        : field.onChange(field.value?.filter(id => id !== interest.userId));
                                                                }}
                                                            />
                                                        </FormControl>
                                                        <FormLabel className="font-normal w-full">{interest.userName}</FormLabel>
                                                    </FormItem>
                                                )}
                                            />
                                        ))}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        <div className="space-y-4">
                             <FormField name="date" control={form.control} render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Meeting Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP") : (<span>Pick a date</span>)}<Calendar className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><CalendarPicker mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )} />
                             <FormField name="time" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Meeting Time</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem> )} />
                             <FormField name="venue" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Venue</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                             <FormField
                                control={form.control}
                                name="evaluatorUids"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                    <FormLabel>Assign Evaluators</FormLabel>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between">
                                            {field.value?.length > 0 ? `${field.value.length} selected` : "Select evaluators"}
                                            <ChevronDown className="h-4 w-4 opacity-50" />
                                        </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-[--radix-popover-trigger-width]">
                                        <DropdownMenuLabel>Available Staff</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        {availableEvaluators.map((evaluator) => (
                                            <DropdownMenuCheckboxItem
                                                key={evaluator.uid}
                                                checked={field.value?.includes(evaluator.uid)}
                                                onCheckedChange={(checked) => {
                                                    return checked
                                                    ? field.onChange([...(field.value || []), evaluator.uid])
                                                    : field.onChange(field.value?.filter((id) => id !== evaluator.uid));
                                                }}
                                            >
                                            {evaluator.name}
                                            </DropdownMenuCheckboxItem>
                                        ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    <FormMessage />
                                    </FormItem>
                                )}
                             />
                        </div>
                    </form>
                </Form>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" form="schedule-form" disabled={isSubmitting}>
                      {isSubmitting ? 'Scheduling...' : 'Confirm & Schedule'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


interface RegistrationsDialogProps {
    call: FundingCall;
    interests: EmrInterest[];
    allUsers: User[];
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onActionComplete: () => void;
    user: User;
}

function RegistrationsDialog({ call, interests, allUsers, isOpen, onOpenChange, onActionComplete, user }: RegistrationsDialogProps) {
    const { toast } = useToast();
    const userMap = new Map(allUsers.map(u => [u.uid, u]));
    const registeredInterests = interests.filter(i => i.callId === call.id);
    const [isDeleting, setIsDeleting] = useState(false);
    const [interestToDelete, setInterestToDelete] = useState<EmrInterest | null>(null);

    const form = useForm<z.infer<typeof deleteRegistrationSchema>>({
        resolver: zodResolver(deleteRegistrationSchema),
    });

    const handleDeleteInterest = async (values: z.infer<typeof deleteRegistrationSchema>) => {
        if (!interestToDelete) return;
        setIsDeleting(true);
        try {
            const result = await deleteEmrInterest(interestToDelete.id, values.remarks, user.name);
            if (result.success) {
                toast({ title: "Registration Deleted", description: "The user has been notified." });
                setInterestToDelete(null);
                onActionComplete();
            } else {
                toast({ variant: 'destructive', title: "Error", description: result.error });
            }
        } finally {
            setIsDeleting(false);
        }
    };
    
    const handleExport = () => {
        const dataToExport = registeredInterests.map(interest => {
            const interestedUser = userMap.get(interest.userId);
            return {
                'PI Name': interest.userName,
                'PI Email': interest.userEmail,
                'PI Department': interestedUser?.department || interest.department,
                'Co-PIs': interest.coPiNames?.join(', ') || 'None',
                'Meeting Slot': interest.meetingSlot ? `${format(parseISO(interest.meetingSlot.date), 'MMM d')} at ${interest.meetingSlot.time}` : 'Not Scheduled',
                'Presentation URL': interest.pptUrl || 'Not Submitted'
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Registrations');
        XLSX.writeFile(workbook, `registrations_${call.title.replace(/\s+/g, '_')}.xlsx`);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
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
                                    <TableHead>PI</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Co-PI(s)</TableHead>
                                    <TableHead>Department</TableHead>
                                    <TableHead>Meeting Slot</TableHead>
                                    <TableHead>Presentation</TableHead>
                                    <TableHead>Endorsement Form</TableHead>
                                    {user.role === 'Super-admin' && <TableHead className="text-right">Actions</TableHead>}
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
                                            <TableCell>{interest.coPiNames?.join(', ') || 'None'}</TableCell>
                                            <TableCell>{interestedUser?.department || interest.department}</TableCell>
                                             <TableCell>
                                                {interest.meetingSlot ? 
                                                    `${format(parseISO(interest.meetingSlot.date), 'MMM d')} at ${interest.meetingSlot.time}`
                                                    : 'Not Scheduled'}
                                             </TableCell>
                                             <TableCell>
                                                 {interest.pptUrl ? (
                                                     <Button asChild variant="link" className="p-0 h-auto">
                                                         <a href={interest.pptUrl} target="_blank" rel="noopener noreferrer">View</a>
                                                     </Button>
                                                 ) : 'Not Submitted'}
                                             </TableCell>
                                             <TableCell>
                                                {interest.endorsementFormUrl ? (
                                                     <Button asChild variant="link" className="p-0 h-auto">
                                                         <a href={interest.endorsementFormUrl} target="_blank" rel="noopener noreferrer">View</a>
                                                     </Button>
                                                 ) : 'Not Submitted'}
                                             </TableCell>
                                             {user.role === 'Super-admin' && (
                                                <TableCell className="text-right">
                                                    <Button variant="destructive" size="icon" onClick={() => setInterestToDelete(interest)}>
                                                        <Trash2 className="h-4 w-4" />
                                                        <span className="sr-only">Delete Registration</span>
                                                    </Button>
                                                </TableCell>
                                             )}
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
                <DialogFooter className="justify-between">
                    {user.role === 'Super-admin' && (
                        <Button variant="outline" onClick={handleExport} disabled={registeredInterests.length === 0}>
                            <Download className="mr-2 h-4 w-4" /> Export XLSX
                        </Button>
                    )}
                    <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
                </DialogFooter>
                 <AlertDialog open={!!interestToDelete} onOpenChange={() => setInterestToDelete(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete Registration for {interestToDelete?.userName}?</AlertDialogTitle>
                            <AlertDialogDescription>Please provide a reason for this deletion. The user will be notified.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <Form {...form}>
                            <form id="delete-interest-form" onSubmit={form.handleSubmit(handleDeleteInterest)}>
                                <FormField
                                    control={form.control}
                                    name="remarks"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl><Textarea {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </form>
                        </Form>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction type="submit" form="delete-interest-form" disabled={isDeleting}>
                                {isDeleting ? "Deleting..." : "Confirm & Delete"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </DialogContent>
        </Dialog>
    );
}

function AddEditCallDialog({
  isOpen,
  onOpenChange,
  existingCall,
  user,
  onActionComplete,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  existingCall?: FundingCall | null;
  user: User;
  onActionComplete: () => void;
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
        notifyAllStaff: existingCall.isAnnounced,
      });
    } else {
      form.reset({
        title: '',
        agency: '',
        description: '',
        callType: 'Grant',
        detailsUrl: '',
        interestDeadline: setMinutes(setHours(new Date(), 17), 0),
        applyDeadline: undefined,
        attachments: undefined,
        notifyAllStaff: true,
      });
    }
  }, [existingCall, form]);

  const handleSaveCall = async (values: z.infer<typeof callSchema>) => {
    setIsSubmitting(true);
    try {
        if (existingCall) {
            // Update logic
            const callRef = doc(db, 'fundingCalls', existingCall.id);
            await updateDoc(callRef, {
                ...values,
                interestDeadline: values.interestDeadline.toISOString(),
                applyDeadline: values.applyDeadline.toISOString(),
            });
            toast({ title: 'Success', description: 'Funding call has been updated.' });
        } else {
            // Create logic
            const result = await createFundingCall(values);
            if (!result.success) {
                throw new Error(result.error);
            }
            toast({ title: 'Success', description: 'Funding call has been added.' });
        }
        onActionComplete();
        onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving funding call:', error);
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Could not save funding call.' });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleDeleteCall = async () => {
    if (!existingCall) return;
    try {
        await deleteDoc(doc(db, 'fundingCalls', existingCall.id));
        toast({ title: 'Success', description: 'Funding call deleted.' });
        onActionComplete();
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
             <FormField name="description" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Description</FormLabel><FormControl><RichTextEditor {...field} /></FormControl><FormMessage /></FormItem> )} />
             <FormField name="callType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Call Type</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Fellowship">Fellowship</SelectItem><SelectItem value="Grant">Grant</SelectItem><SelectItem value="Collaboration">Collaboration</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <FormField name="interestDeadline" control={form.control} render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Interest Registration Deadline</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? (format(field.value, "PPP")) : (<span>Pick a date</span>)}<Calendar className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><CalendarPicker mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )} />
               <FormField name="applyDeadline" control={form.control} render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Agency Application Deadline</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? (format(field.value, "PPP")) : (<span>Pick a date</span>)}<Calendar className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><CalendarPicker mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )} />
            </div>
             <FormField name="detailsUrl" control={form.control} render={({ field }) => ( <FormItem><FormLabel>URL for Full Details</FormLabel><FormControl><Input type="url" {...field} /></FormControl><FormMessage /></FormItem> )} />
             <FormField name="attachments" control={form.control} render={({ field: { onChange, value, ...rest }}) => ( <FormItem><FormLabel>Attachments (Optional)</FormLabel><FormControl><Input type="file" multiple onChange={(e) => onChange(e.target.files)} {...rest} /></FormControl><FormMessage /></FormItem> )} />
              {!existingCall && (
                 <FormField
                  control={form.control}
                  name="notifyAllStaff"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel>Notify All Staff</FormLabel>
                        <FormDescription>
                          Send an email announcement about this new call to all staff members.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}
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

function ViewDescriptionDialog({ call }: { call: FundingCall }) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-auto py-1 px-2 text-xs">
                    <NotebookText className="mr-2 h-3 w-3" /> View Description
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{call.title}</DialogTitle>
                    <DialogDescription>Full description for the funding call from {call.agency}.</DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto pr-4">
                    <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: call.description || 'No description provided.' }} />
                </div>
            </DialogContent>
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
    const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
    const [selectedCall, setSelectedCall] = useState<FundingCall | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [isRegistrationsOpen, setIsRegistrationsOpen] = useState(false);
    const [isAnnounceDialogOpen, setIsAnnounceDialogOpen] = useState(false);
    const [isAnnouncing, setIsAnnouncing] = useState(false);

    const isAdmin = user.role === 'Super-admin' || user.role === 'admin';
    const isSuperAdmin = user.role === 'Super-admin';

    const firstDay = startOfMonth(currentMonth);
    const lastDay = endOfMonth(currentMonth);
    const daysInMonth = eachDayOfInterval({ start: firstDay, end: lastDay });
    const startingDayIndex = getDay(firstDay);

    const eventRefs = new Map<string, React.RefObject<HTMLDivElement>>();
    calls.forEach(call => {
        eventRefs.set(`deadline-${call.id}`, createRef());
        if (call.meetingDetails?.date) {
            eventRefs.set(`meeting-${call.id}`, createRef());
        }
    });

    const handleDateClick = (dateStr: string) => {
        const firstEventForDate = eventsByDate[dateStr]?.[0];
        if (firstEventForDate) {
            const eventId = firstEventForDate.type === 'meeting' ? `meeting-${firstEventForDate.call.id}` : `deadline-${firstEventForDate.call.id}`;
            const ref = eventRefs.get(eventId);
            ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };


    const eventsByDate = calls.reduce((acc, call) => {
        const deadlineDate = format(parseISO(call.interestDeadline), 'yyyy-MM-dd');
        if (!acc[deadlineDate]) acc[deadlineDate] = [];
        acc[deadlineDate].push({ type: 'deadline', call });
        
        const agencyDeadlineDate = format(parseISO(call.applyDeadline), 'yyyy-MM-dd');
        if (!acc[agencyDeadlineDate]) acc[agencyDeadlineDate] = [];
        acc[agencyDeadlineDate].push({ type: 'agencyDeadline', call });

        if (call.meetingDetails?.date) {
            const meetingDate = format(parseISO(call.meetingDetails.date), 'yyyy-MM-dd');
            if (!acc[meetingDate]) acc[meetingDate] = [];
            acc[meetingDate].push({ type: 'meeting', call });
        }
        return acc;
    }, {} as Record<string, CalendarEvent[]>);


    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            if (isAdmin) {
                const usersQuery = query(collection(db, 'users'));
                const usersSnapshot = await getDocs(usersQuery);
                setAllUsers(usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User)));
            }

            const callsQuery = query(collection(db, 'fundingCalls'), orderBy('interestDeadline', 'desc'));
            const unsubscribeCalls = onSnapshot(callsQuery, (snapshot) => {
                setCalls(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingCall)));
            });

            const userInterestsQuery = query(collection(db, 'emrInterests'), where('userId', '==', user.uid));
            const unsubscribeUserInterests = onSnapshot(userInterestsQuery, (snapshot) => {
                setUserInterests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as EmrInterest})));
            });

            let unsubscribeAllInterests = () => {};
            if (isAdmin) {
                const allInterestsQuery = query(collection(db, 'emrInterests'));
                unsubscribeAllInterests = onSnapshot(allInterestsQuery, (snapshot) => {
                    setAllInterests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as EmrInterest})));
                });
            }
            
            setLoading(false);

            return () => {
                unsubscribeCalls();
                unsubscribeUserInterests();
                unsubscribeAllInterests();
            }

        } catch (error) {
            console.error("Error fetching data:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch EMR data.' });
            setLoading(false);
        }
    }, [toast, user.uid, isAdmin]);

    useEffect(() => {
        const unsubscribePromise = fetchData();
        return () => {
             unsubscribePromise.then(fn => fn && fn());
        }
    }, [fetchData]);
    
    
    const getStatusBadge = (call: FundingCall) => {
        const now = new Date();
        if (call.status === 'Meeting Scheduled') {
            return <Badge variant="default">Meeting Scheduled</Badge>;
        }
        if (isAfter(now, parseISO(call.interestDeadline))) {
            return <Badge variant="secondary">Closed</Badge>;
        }
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/50 dark:text-green-200 dark:border-green-700">Open</Badge>;
    }

    const handleAnnounceCall = async () => {
      if (!selectedCall) return;
      setIsAnnouncing(true);
      try {
        const result = await announceEmrCall(selectedCall.id);
        if (result.success) {
          toast({ title: "Success", description: "Announcement email has been sent to all staff." });
        } else {
          toast({ variant: "destructive", title: "Failed to Announce", description: result.error });
        }
      } catch (error: any) {
        toast({ variant: "destructive", title: "Error", description: error.message || "An unexpected error occurred." });
      } finally {
        setIsAnnouncing(false);
        setIsAnnounceDialogOpen(false);
      }
    };


    if (loading) {
        return <Skeleton className="h-96 w-full" />;
    }

    const upcomingCalls = calls.filter(c => !isAfter(new Date(), parseISO(c.applyDeadline)));

    return (
        <div className="space-y-8">
            {userInterests.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>My EMR Applications</CardTitle>
                        <CardDescription>A summary of your registered interests in external funding calls.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {userInterests.map(interest => {
                                const call = calls.find(c => c.id === interest.callId);
                                if (!call) return null;
                                return (
                                    <div key={interest.id} className="p-3 border rounded-lg bg-background">
                                        <p className="font-semibold">{interest.callTitle || call.title}</p>
                                        <p className="text-sm text-muted-foreground">Registered on: {new Date(interest.registeredAt).toLocaleDateString()}</p>
                                        <div className="mt-2">
                                           <EmrActions user={user} call={call} interestDetails={interest} onActionComplete={fetchData} isDashboardView={true} />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                        <h3 className="text-xl font-semibold text-center w-48">{format(currentMonth, 'MMMM yyyy')}</h3>
                        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                    {isSuperAdmin && (
                        <div className="flex items-center gap-2">
                             <Button onClick={() => { setSelectedCall(null); setIsAddEditDialogOpen(true); }}><Plus className="mr-2 h-4 w-4" /> Add New Call</Button>
                        </div>
                    )}
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div>
                            <div className="grid grid-cols-7 border-t border-l">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                    <div key={day} className="text-center font-semibold p-2 border-b border-r text-sm text-muted-foreground">{day}</div>
                                ))}
                                {Array.from({ length: startingDayIndex }).map((_, i) => (
                                    <div key={`empty-${i}`} className="border-b border-r min-h-[6rem]"></div>
                                ))}
                                {daysInMonth.map(day => {
                                    const dateStr = format(day, 'yyyy-MM-dd');
                                    const eventsOnDay = eventsByDate[dateStr] || [];
                                    const hasDeadline = eventsOnDay.some(e => e.type === 'deadline');
                                    const hasMeeting = eventsOnDay.some(e => e.type === 'meeting');
                                    const hasAgencyDeadline = eventsOnDay.some(e => e.type === 'agencyDeadline');
                                    return (
                                        <div 
                                            key={dateStr} 
                                            className={cn("min-h-[6rem] border-b border-r p-2 flex flex-col hover:bg-muted/50 transition-colors", eventsOnDay.length > 0 ? "cursor-pointer" : "cursor-default")}
                                            onClick={() => eventsOnDay.length > 0 && handleDateClick(dateStr)}
                                        >
                                            <span className="font-semibold">{format(day, 'd')}</span>
                                            <div className="flex-grow flex items-end justify-start gap-1 mt-1">
                                                {hasDeadline && <div className="h-2 w-2 rounded-full bg-green-500" title="Interest Registration Deadline"></div>}
                                                {hasMeeting && <div className="h-2 w-2 rounded-full bg-blue-500" title="Meeting Scheduled"></div>}
                                                {hasAgencyDeadline && <div className="h-2 w-2 rounded-full bg-red-500" title="Agency Application Deadline"></div>}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                        
                        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                            <h4 className="font-semibold">All Upcoming Deadlines</h4>
                            {upcomingCalls.length > 0 ? upcomingCalls.map(call => {
                                const interestDetails = userInterests.find(i => i.callId === call.id);
                                const callRef = eventRefs.get(`deadline-${call.id}`);
                                const registeredCount = allInterests.filter(i => i.callId === call.id).length;
                                const allApplicantsScheduled = registeredCount > 0 && allInterests.filter(i => i.callId === call.id && !!i.meetingSlot).length === registeredCount;

                                return (
                                    <div key={call.id} ref={callRef} className="border p-4 rounded-lg space-y-3">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                                <h4 className="font-semibold text-base">{call.title}</h4>
                                                <p className="text-sm text-muted-foreground">Agency: {call.agency}</p>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <Badge variant="secondary">{call.callType}</Badge>
                                                    {getStatusBadge(call)}
                                                </div>
                                            </div>
                                             <EmrActions user={user} call={call} interestDetails={interestDetails} onActionComplete={fetchData} />
                                        </div>
                                        
                                        <div className="flex items-center justify-between pt-3 border-t">
                                            <div className="text-xs text-muted-foreground space-y-1">
                                                <p>Interest Deadline: <span className="font-medium text-foreground">{format(parseISO(call.interestDeadline), 'PPp')}</span></p>
                                                <p>Application Deadline: <span className="font-medium text-foreground">{format(parseISO(call.applyDeadline), 'PP')}</span></p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {isAdmin && (
                                                    <Button
                                                        variant="ghost" size="sm"
                                                        onClick={() => { setSelectedCall(call); setIsRegistrationsOpen(true); }}
                                                    >
                                                        <Users className="h-4 w-4 mr-1"/> View Registrations ({registeredCount})
                                                    </Button>
                                                )}
                                                {isSuperAdmin && (
                                                    <Button variant="ghost" size="sm" onClick={() => { setSelectedCall(call); setIsAddEditDialogOpen(true); }}><Edit className="h-4 w-4 mr-1"/>Edit</Button>
                                                )}
                                            </div>
                                         </div>

                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-xs">
                                                <ViewDescriptionDialog call={call} />
                                                {call.detailsUrl && <Button variant="link" asChild className="p-0 h-auto text-xs"><a href={call.detailsUrl} target="_blank" rel="noopener noreferrer"><LinkIcon className="h-3 w-3 mr-1"/> View Full Details</a></Button>}
                                            </div>
                                            {isSuperAdmin && (
                                                <div className="flex items-center gap-2">
                                                    {!call.isAnnounced && (
                                                        <Button size="sm" variant="outline" onClick={() => { setSelectedCall(call); setIsAnnounceDialogOpen(true); }}>
                                                            <Send className="mr-2 h-4 w-4" /> Announce
                                                        </Button>
                                                    )}
                                                    {registeredCount > 0 && !allApplicantsScheduled && (
                                                        <Button size="sm" onClick={() => {setSelectedCall(call); setIsScheduleDialogOpen(true);}}>
                                                            <CalendarClock className="mr-2 h-4 w-4" /> Schedule Meeting
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                    </div>
                                )
                            }) : (
                                 <div className="text-center py-10 text-muted-foreground">
                                    No upcoming deadlines.
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
                {isSuperAdmin && (
                    <>
                        <AddEditCallDialog
                            isOpen={isAddEditDialogOpen}
                            onOpenChange={setIsAddEditDialogOpen}
                            existingCall={selectedCall}
                            user={user}
                            onActionComplete={fetchData}
                        />
                        {selectedCall && (
                            <>
                             <ScheduleMeetingDialog
                                isOpen={isScheduleDialogOpen}
                                onOpenChange={setIsScheduleDialogOpen}
                                onActionComplete={fetchData}
                                call={selectedCall}
                                interests={allInterests}
                                allUsers={allUsers}
                             />
                             <RegistrationsDialog 
                                call={selectedCall} 
                                interests={allInterests} 
                                allUsers={allUsers}
                                isOpen={isRegistrationsOpen}
                                onOpenChange={setIsRegistrationsOpen}
                                onActionComplete={fetchData}
                                user={user}
                            />
                             <AlertDialog open={isAnnounceDialogOpen} onOpenChange={setIsAnnounceDialogOpen}>
                               <AlertDialogContent>
                                 <AlertDialogHeader>
                                   <AlertDialogTitle>Announce Funding Call?</AlertDialogTitle>
                                   <AlertDialogDescription>
                                     This will send an email notification to all staff members about the call for "{selectedCall.title}". This action cannot be undone. Are you sure?
                                   </AlertDialogDescription>
                                 </AlertDialogHeader>
                                 <AlertDialogFooter>
                                   <AlertDialogCancel>Cancel</AlertDialogCancel>
                                   <AlertDialogAction onClick={handleAnnounceCall} disabled={isAnnouncing}>
                                     {isAnnouncing && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                     Confirm & Announce
                                   </AlertDialogAction>
                                 </AlertDialogFooter>
                               </AlertDialogContent>
                             </AlertDialog>
                            </>
                        )}
                    </>
                )}
            </Card>
        </div>
    );
}
