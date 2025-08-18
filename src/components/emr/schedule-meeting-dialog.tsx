
// src/components/emr/schedule-meeting-dialog.tsx
'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import * as z from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from '@/components/ui/checkbox';
import type { FundingCall, User, EmrInterest } from '@/types';
import { format, parseISO, startOfToday, isToday, parse } from 'date-fns';
import { cn } from '@/lib/utils';
import { Calendar, ChevronDown, Loader2 } from 'lucide-react';
import { scheduleEmrMeeting } from '@/app/actions';

interface ScheduleMeetingDialogProps {
    call: FundingCall;
    interests: EmrInterest[];
    allUsers: User[];
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onActionComplete: () => void;
}

const scheduleSchema = z.object({
    date: z.date({ required_error: 'A meeting date is required.' }).min(startOfToday(), "Meeting date cannot be in the past."),
    time: z.string().min(1, "Time is required."),
    venue: z.string().min(3, 'Meeting venue is required.'),
    pptDeadline: z.date({ required_error: 'A presentation deadline is required.'}),
    evaluatorUids: z.array(z.string()).min(1, 'Please select at least one evaluator.'),
}).refine(data => {
    if (isToday(data.date)) {
        const now = new Date();
        const meetingTime = parse(data.time, 'HH:mm', data.date);
        return meetingTime > now;
    }
    return true;
}, {
    message: "Meeting time must be in the future for today's date.",
    path: ['time'],
}).refine(data => data.pptDeadline <= data.date, {
    message: 'PPT deadline must be on or before the meeting date.',
    path: ['pptDeadline'],
});


const applicantsSchema = z.object({
    applicantUids: z.array(z.string()).min(1, 'Please select at least one applicant.'),
});

export function ScheduleMeetingDialog({ call, interests, allUsers, isOpen, onOpenChange, onActionComplete }: ScheduleMeetingDialogProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const scheduleForm = useForm<z.infer<typeof scheduleSchema>>({
        resolver: zodResolver(scheduleSchema),
        defaultValues: {
            venue: 'RDC Committee Room, PIMSR',
            evaluatorUids: call.meetingDetails?.assignedEvaluators || [],
            date: call.meetingDetails?.date ? parseISO(call.meetingDetails.date) : undefined,
            time: call.meetingDetails?.time || '',
            pptDeadline: call.meetingDetails?.pptDeadline ? parseISO(call.meetingDetails.pptDeadline) : undefined,
        },
    });

    const applicantsForm = useForm<z.infer<typeof applicantsSchema>>({
        resolver: zodResolver(applicantsSchema),
        defaultValues: {
            applicantUids: [],
        }
    });

    useEffect(() => {
        if (isOpen) {
            scheduleForm.reset({
                venue: 'RDC Committee Room, PIMSR',
                evaluatorUids: call.meetingDetails?.assignedEvaluators || [],
                date: call.meetingDetails?.date ? parseISO(call.meetingDetails.date) : undefined,
                time: call.meetingDetails?.time || '',
                pptDeadline: call.meetingDetails?.pptDeadline ? parseISO(call.meetingDetails.pptDeadline) : undefined,
            });
            applicantsForm.reset({
                applicantUids: [],
            });
        }
    }, [call, isOpen, scheduleForm, applicantsForm]);

    const handleScheduleSubmit = async (scheduleValues: z.infer<typeof scheduleSchema>) => {
        const applicantUids = applicantsForm.getValues('applicantUids');
        if (applicantUids.length === 0) {
            applicantsForm.setError('applicantUids', { type: 'manual', message: 'Please select at least one applicant.' });
            return;
        }

        setIsSubmitting(true);
        try {
            const meetingDetails = {
                date: format(scheduleValues.date, 'yyyy-MM-dd'),
                time: scheduleValues.time,
                venue: scheduleValues.venue,
                pptDeadline: scheduleValues.pptDeadline.toISOString(),
                evaluatorUids: scheduleValues.evaluatorUids,
            };
            const result = await scheduleEmrMeeting(call.id, meetingDetails, applicantUids);

            if (result.success) {
                toast({ title: 'Success', description: 'Meeting slots scheduled and participants notified.' });
                onActionComplete();
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
    
    const usersWithInterest = interests.filter(i => i.callId === call.id && !i.meetingSlot);
    const availableEvaluators = allUsers.filter(u => ['Super-admin', 'admin', 'CRO'].includes(u.role) && !usersWithInterest.some(interest => interest.userId === u.uid));

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Schedule Meeting for: {call.title}</DialogTitle>
                    <DialogDescription>Select applicants and set the details for the evaluation meeting.</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
                    <Form {...applicantsForm}>
                        <form id="applicants-form" className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                            <h4 className="font-semibold">Select Applicants</h4>
                            <FormField
                                control={applicantsForm.control}
                                name="applicantUids"
                                render={() => (
                                    <FormItem>
                                        <div className="flex items-center space-x-2 p-2 border-b">
                                            <Checkbox
                                                id="select-all-applicants"
                                                checked={applicantsForm.watch('applicantUids')?.length === usersWithInterest.length && usersWithInterest.length > 0}
                                                onCheckedChange={(checked) => applicantsForm.setValue('applicantUids', checked ? usersWithInterest.map(i => i.userId) : [])}
                                            />
                                            <FormLabel htmlFor="select-all-applicants" className="font-medium">Select All</FormLabel>
                                        </div>
                                        {usersWithInterest.map(interest => (
                                            <FormField
                                                key={interest.id}
                                                control={applicantsForm.control}
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
                        </form>
                    </Form>
                    <Form {...scheduleForm}>
                        <form id="schedule-form" onSubmit={scheduleForm.handleSubmit(handleScheduleSubmit)} className="space-y-4">
                             <FormField name="date" control={scheduleForm.control} render={({ field }) => ( 
                                <FormItem className="flex flex-col">
                                    <FormLabel>Meeting Date</FormLabel>
                                    <Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal w-full", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP") : (<span>Pick a date</span>)}<Calendar className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><CalendarPicker mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date < startOfToday()} initialFocus /></PopoverContent></Popover>
                                    <FormMessage />
                                </FormItem> 
                            )} />
                             <FormField name="time" control={scheduleForm.control} render={({ field }) => ( <FormItem><FormLabel>Meeting Time</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem> )} />
                             <FormField name="venue" control={scheduleForm.control} render={({ field }) => ( <FormItem><FormLabel>Venue</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                             <FormField name="pptDeadline" control={scheduleForm.control} render={({ field }) => ( 
                                <FormItem className="flex flex-col">
                                    <FormLabel>Presentation Upload Deadline</FormLabel>
                                    <Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal w-full", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPp") : (<span>Pick date and time</span>)}<Calendar className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><CalendarPicker mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date < startOfToday()} initialFocus /><div className="p-2 border-t"><Input type="time" onChange={e => {const time = e.target.value; field.onChange(currentDate => setHours(setMinutes(currentDate || new Date(), parseInt(time.split(':')[1])), parseInt(time.split(':')[0])))}}/></div></PopoverContent></Popover>
                                    <FormMessage />
                                </FormItem> 
                            )} />
                             <FormField
                                control={scheduleForm.control}
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
                        </form>
                    </Form>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" form="schedule-form" disabled={isSubmitting}>
                      {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Scheduling...</> : 'Confirm & Schedule'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
