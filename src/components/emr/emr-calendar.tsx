

'use client';

import { useState, useEffect, useCallback, createRef } from 'react';
import * as z from 'zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { db } from '@/lib/config';
import { collection, query, orderBy, onSnapshot, addDoc, doc, deleteDoc, updateDoc, where, getDocs } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
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
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Calendar, CheckCircle, Clock, Edit, Plus, Trash2, Users, ChevronLeft, ChevronRight, Link as LinkIcon, Loader2, Video, Upload, File, NotebookText, Replace, Eye } from 'lucide-react';
import type { FundingCall, User, EmrInterest } from '@/types';
import { format, differenceInDays, differenceInHours, differenceInMinutes, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isAfter, subDays, setHours, setMinutes, setSeconds } from 'date-fns';
import { registerEmrInterest, scheduleEmrMeeting, uploadEmrPpt, removeEmrPpt } from '@/app/actions';
import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar as CalendarPicker } from '../ui/calendar';
import { Separator } from '../ui/separator';


interface EmrCalendarProps {
  user: User;
}

type CalendarEvent = {
  type: 'deadline' | 'meeting';
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
});

const scheduleMeetingSchema = z.object({
    date: z.date({ required_error: 'A meeting date is required.' }),
    venue: z.string().min(3, 'Meeting venue is required.'),
    slots: z.array(z.object({
        userId: z.string(),
        time: z.string().min(1, "Time is required.")
    }))
});

const pptUploadSchema = z.object({
    pptFile: z.any().refine((files) => files?.length > 0, "Presentation file is required.")
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
                                    <TableHead>Department</TableHead>
                                    <TableHead>Meeting Slot</TableHead>
                                    <TableHead>Presentation</TableHead>
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
             <FormField name="description" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Description</FormLabel><FormControl><RichTextEditor {...field} /></FormControl><FormMessage /></FormItem> )} />
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

function ScheduleMeetingDialog({ call, onOpenChange, isOpen, interests }: { call: FundingCall; isOpen: boolean; onOpenChange: (open: boolean) => void; interests: EmrInterest[] }) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const form = useForm<z.infer<typeof scheduleMeetingSchema>>({
        resolver: zodResolver(scheduleMeetingSchema),
        defaultValues: {
            venue: "RDC Committee Room, PIMSR",
            slots: interests.filter(i => i.callId === call.id).map(i => ({ userId: i.userId, time: i.meetingSlot?.time || '' }))
        },
    });

    const { fields } = useFieldArray({
        control: form.control,
        name: "slots",
    });

    const handleScheduleMeeting = async (values: z.infer<typeof scheduleMeetingSchema>) => {
        setIsSubmitting(true);
        try {
            const result = await scheduleEmrMeeting(call.id, {
                date: format(values.date, 'yyyy-MM-dd'),
                venue: values.venue,
                slots: values.slots
            });
            if (result.success) {
                toast({ title: 'Success', description: 'Meeting slots scheduled and participants notified.' });
                onOpenChange(false);
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        } catch (error) {
            console.error('Error scheduling meeting:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not schedule meeting.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const usersWithInterest = interests.filter(i => i.callId === call.id);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Schedule Meeting for: {call.title}</DialogTitle>
                    <DialogDescription>Set the date, venue, and a time slot for each registered participant.</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form id="schedule-meeting-form" onSubmit={form.handleSubmit(handleScheduleMeeting)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
                         <div className="grid grid-cols-2 gap-4">
                            <FormField name="date" control={form.control} render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Meeting Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP") : (<span>Pick a date</span>)}<Calendar className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><CalendarPicker mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )} />
                            <FormField name="venue" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Venue</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                         </div>
                         <Separator />
                         <div className="space-y-4">
                             {fields.map((field, index) => {
                                const userOfInterest = usersWithInterest.find(u => u.userId === field.userId);
                                return (
                                <FormField
                                    key={field.id}
                                    control={form.control}
                                    name={`slots.${index}.time`}
                                    render={({ field }) => (
                                    <FormItem>
                                        <div className="grid grid-cols-3 items-center gap-4">
                                            <FormLabel className="text-right">{userOfInterest?.userName}</FormLabel>
                                            <FormControl className="col-span-2">
                                                <Input type="time" {...field} />
                                            </FormControl>
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                                )
                            })}
                         </div>
                    </form>
                </Form>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" form="schedule-meeting-form" disabled={isSubmitting}>{isSubmitting ? 'Scheduling...' : 'Schedule & Notify'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function UploadPptDialog({ interest, call, onOpenChange, isOpen, user }: { interest: EmrInterest; call: FundingCall; isOpen: boolean; onOpenChange: (open: boolean) => void; user: User; }) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);

    const form = useForm<z.infer<typeof pptUploadSchema>>({
        resolver: zodResolver(pptUploadSchema),
    });

    const fileToDataUrl = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });
    };
    
    const handleUpload = async (values: z.infer<typeof pptUploadSchema>) => {
        setIsSubmitting(true);
        try {
            const file = values.pptFile[0];
            const pptDataUrl = await fileToDataUrl(file);
            const result = await uploadEmrPpt(interest.id, pptDataUrl, file.name, user.name);

            if (result.success) {
                toast({ title: "Success", description: "Your presentation has been uploaded." });
                onOpenChange(false);
            } else {
                toast({ variant: "destructive", title: "Upload Failed", description: result.error });
            }
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "An unexpected error occurred." });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDelete = async () => {
        setIsSubmitting(true);
        try {
            const result = await removeEmrPpt(interest.id);
            if (result.success) {
                toast({ title: 'Presentation Removed' });
                onOpenChange(false); // Close the dialog after successful deletion
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        } finally {
            setIsSubmitting(false);
            setIsDeleteConfirmationOpen(false);
        }
    };

    if (!call.meetingDetails) return null;
    
    const meetingDate = parseISO(call.meetingDetails.date);
    const uploadDeadline = setSeconds(setMinutes(setHours(subDays(meetingDate, 3), 17), 0), 0);
    const isDeadlinePast = isAfter(new Date(), uploadDeadline);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{interest.pptUrl ? 'Manage Presentation' : 'Upload Presentation'}</DialogTitle>
                    <DialogDescription>
                        {interest.pptUrl ? 'You can view, replace, or remove your uploaded presentation.' : `Please upload your presentation for the call: "${call.title}".`}
                        The deadline for submission is {format(uploadDeadline, "PPpp")}.
                    </DialogDescription>
                </DialogHeader>
                 {isDeadlinePast ? (
                    <div className="text-center text-destructive font-semibold p-4">
                        The deadline to upload or modify your presentation has passed.
                        {interest.pptUrl && <Button asChild variant="link"><a href={interest.pptUrl} target="_blank" rel="noopener noreferrer">View Final Submission</a></Button>}
                    </div>
                ) : (
                <Form {...form}>
                    <form id="upload-ppt-form" onSubmit={form.handleSubmit(handleUpload)} className="space-y-4 py-4">
                        <FormField
                            name="pptFile"
                            control={form.control}
                            render={({ field: { value, onChange, ...fieldProps } }) => (
                                <FormItem>
                                    <FormLabel>{interest.pptUrl ? 'Replace Presentation File' : 'Presentation File'}</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...fieldProps}
                                            type="file"
                                            accept=".ppt, .pptx"
                                            onChange={(e) => onChange(e.target.files)}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </form>
                </Form>
                )}
                <DialogFooter className="justify-between">
                     <div>
                        {interest.pptUrl && !isDeadlinePast && (
                            <Button variant="destructive" size="sm" onClick={() => setIsDeleteConfirmationOpen(true)} disabled={isSubmitting}>
                                <Trash2 className="h-4 w-4 mr-2" /> Remove
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                         {!isDeadlinePast && (
                            <Button type="submit" form="upload-ppt-form" disabled={isSubmitting}>
                                {isSubmitting ? "Saving..." : (interest.pptUrl ? 'Replace File' : 'Upload File')}
                            </Button>
                        )}
                    </div>
                </DialogFooter>
                 <AlertDialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently remove your presentation from the server.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90" disabled={isSubmitting}>
                                {isSubmitting ? "Deleting..." : "Confirm & Remove"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </DialogContent>
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
    const [isUploadPptOpen, setIsUploadPptOpen] = useState(false);
    const [selectedCall, setSelectedCall] = useState<FundingCall | null>(null);
    const [selectedInterest, setSelectedInterest] = useState<EmrInterest | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());

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

        if (call.meetingDetails?.date) {
            const meetingDate = format(parseISO(call.meetingDetails.date), 'yyyy-MM-dd');
            if (!acc[meetingDate]) acc[meetingDate] = [];
            acc[meetingDate].push({ type: 'meeting', call });
        }
        return acc;
    }, {} as Record<string, CalendarEvent[]>);


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


    const handleRegisterInterest = async (call: FundingCall) => {
        if (isAfter(new Date(), parseISO(call.interestDeadline))) {
            toast({ variant: 'destructive', title: 'Registration Closed', description: 'The deadline to register interest has passed.' });
            return;
        }
        const result = await registerEmrInterest(call.id, user);
        if (result.success) {
            toast({ title: 'Interest Registered!', description: 'Your interest has been successfully recorded.' });
        } else {
            toast({ variant: 'destructive', title: 'Registration Failed', description: result.error });
        }
    };
    
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


    if (loading) {
        return <Skeleton className="h-96 w-full" />;
    }

    const upcomingCalls = calls.filter(c => !isAfter(new Date(), parseISO(c.interestDeadline)));

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
                                return (
                                    <div 
                                        key={dateStr} 
                                        className={cn("min-h-[6rem] border-b border-r p-2 flex flex-col hover:bg-muted/50 transition-colors", eventsOnDay.length > 0 ? "cursor-pointer" : "cursor-default")}
                                        onClick={() => eventsOnDay.length > 0 && handleDateClick(dateStr)}
                                    >
                                        <span className="font-semibold">{format(day, 'd')}</span>
                                        <div className="flex-grow flex items-end justify-start gap-1 mt-1">
                                            {hasDeadline && <div className="h-2 w-2 rounded-full bg-green-500" title="Registration Deadline"></div>}
                                            {hasMeeting && <div className="h-2 w-2 rounded-full bg-blue-500" title="Meeting Scheduled"></div>}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                    
                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                        <h4 className="font-semibold">All Upcoming Deadlines</h4>
                        {upcomingCalls.length > 0 ? upcomingCalls.map(call => {
                            const userHasRegistered = userInterests.some(i => i.callId === call.id);
                            const interestDetails = userInterests.find(i => i.callId === call.id);
                            const isInterestDeadlinePast = isAfter(new Date(), parseISO(call.interestDeadline));
                            const hasInterest = allInterests.some(i => i.callId === call.id);
                            const callRef = eventRefs.get(`deadline-${call.id}`);

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
                                         <div className="flex flex-col items-end gap-2 text-sm">
                                            {userHasRegistered ? (
                                                <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-md text-green-600 dark:text-green-300 font-semibold">
                                                    <CheckCircle className="h-5 w-5"/>
                                                    <span>Interest Registered</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <Button onClick={() => handleRegisterInterest(call)} disabled={isInterestDeadlinePast}>
                                                        Register Interest
                                                    </Button>
                                                    <p className="text-xs text-muted-foreground"><TimeLeft deadline={call.interestDeadline} /></p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {userHasRegistered && call.meetingDetails?.date && (
                                        <div ref={eventRefs.get(`meeting-${call.id}`)} className="text-sm p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-md">
                                            <p className="font-semibold text-blue-800 dark:text-blue-200 flex items-center gap-2"><Video className="h-4 w-4"/>Your Presentation Slot</p>
                                            <p><strong>Date:</strong> {format(parseISO(call.meetingDetails.date), 'PP')}</p>
                                            {interestDetails?.meetingSlot?.time ? (
                                                <p><strong>Your Time Slot:</strong> {interestDetails.meetingSlot.time}</p>
                                            ) : <p>Your time slot is pending.</p>}
                                            <p><strong>Venue:</strong> {call.meetingDetails.venue}</p>
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between pt-3 border-t">
                                        <div className="text-xs text-muted-foreground space-y-1">
                                            <p>Interest Deadline: <span className="font-medium text-foreground">{format(parseISO(call.interestDeadline), 'PPp')}</span></p>
                                            <p>Application Deadline: <span className="font-medium text-foreground">{format(parseISO(call.applyDeadline), 'PP')}</span></p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {userHasRegistered && interestDetails?.pptUrl && (
                                                 <Button asChild size="sm" variant="outline"><a href={interestDetails.pptUrl} target="_blank" rel="noreferrer"><Eye className="h-4 w-4 mr-2"/>View PPT</a></Button>
                                            )}
                                            {userHasRegistered && interestDetails && (
                                                <Button size="sm" variant="outline" onClick={() => { setSelectedInterest(interestDetails!); setSelectedCall(call); setIsUploadPptOpen(true); }}>
                                                    {interestDetails.pptUrl ? <Replace className="h-4 w-4 mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                                                    {interestDetails.pptUrl ? 'Manage PPT' : 'Upload PPT'}
                                                </Button>
                                            )}
                                            {isAdmin && (
                                                <div className="flex items-center gap-2">
                                                    <RegistrationsDialog call={call} interests={allInterests} allUsers={allUsers} />
                                                    {hasInterest && call.status !== 'Meeting Scheduled' && isSuperAdmin && (
                                                        <Button size="sm" onClick={() => { setSelectedCall(call); setIsScheduleDialogOpen(true); }}>
                                                            <Calendar className="mr-2 h-4 w-4" /> Schedule
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                            {isSuperAdmin && (
                                                <Button variant="ghost" size="sm" onClick={() => { setSelectedCall(call); setIsAddEditDialogOpen(true); }}><Edit className="h-4 w-4 mr-1"/>Edit</Button>
                                            )}
                                        </div>
                                     </div>

                                    <div className="flex items-center gap-2 text-xs">
                                        <ViewDescriptionDialog call={call} />
                                        {call.detailsUrl && <Button variant="link" asChild className="p-0 h-auto text-xs"><a href={call.detailsUrl} target="_blank" rel="noopener noreferrer"><LinkIcon className="h-3 w-3 mr-1"/> View Full Details</a></Button>}
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
                <AddEditCallDialog
                    isOpen={isAddEditDialogOpen}
                    onOpenChange={setIsAddEditDialogOpen}
                    existingCall={selectedCall}
                    user={user}
                />
            )}
            {selectedCall && isSuperAdmin && (
                <ScheduleMeetingDialog
                    call={selectedCall}
                    interests={allInterests}
                    isOpen={isScheduleDialogOpen}
                    onOpenChange={setIsScheduleDialogOpen}
                />
            )}
            {selectedInterest && selectedCall && (
                <UploadPptDialog
                    interest={selectedInterest}
                    call={selectedCall}
                    isOpen={isUploadPptOpen}
                    onOpenChange={(isOpen) => {
                        setIsUploadPptOpen(isOpen);
                        if (!isOpen) {
                            setSelectedInterest(null);
                            setSelectedCall(null);
                        }
                    }}
                    user={user}
                />
            )}
        </Card>
    );
}

