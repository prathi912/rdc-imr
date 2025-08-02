// src/components/emr/emr-management-client.tsx
'use client';

import { useState } from 'react';
import type { FundingCall, User, EmrInterest } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Download, Trash2, CalendarClock, Eye, MoreHorizontal, MessageSquare, Loader2, FileUp, FileText as ViewIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Textarea } from '../ui/textarea';
import { Form, FormControl, FormField, FormItem, FormMessage, FormLabel } from '../ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useForm } from 'react-hook-form';
import { deleteEmrInterest, updateEmrStatus, updateEmrInterestDurationAndStatus } from '@/app/actions';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { ScheduleMeetingDialog } from './schedule-meeting-dialog';

interface EmrManagementClientProps {
    call: FundingCall;
    interests: EmrInterest[];
    allUsers: User[];
    currentUser: User;
    onActionComplete: () => void;
}

const deleteRegistrationSchema = z.object({
    remarks: z.string().min(10, "Please provide a reason for deleting the registration."),
});

const durationStatusSchema = z.object({
    durationAmount: z.number().min(0, "Duration must be a positive number."),
    isOpenToPi: z.boolean(),
});

const adminRemarksSchema = z.object({
    remarks: z.string().min(10, "Please provide remarks for the applicant."),
});


export function EmrManagementClient({ call, interests, allUsers, currentUser, onActionComplete }: EmrManagementClientProps) {
    const { toast } = useToast();
    const userMap = new Map(allUsers.map(u => [u.uid, u]));
    const [isDeleting, setIsDeleting] = useState(false);
    const [interestToUpdate, setInterestToUpdate] = useState<EmrInterest | null>(null);
    const [statusToUpdate, setStatusToUpdate] = useState<EmrInterest['status'] | null>(null);
    const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
    const [isRemarksDialogOpen, setIsRemarksDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const [isDurationDialogOpen, setIsDurationDialogOpen] = useState(false);


    const deleteForm = useForm<z.infer<typeof deleteRegistrationSchema>>({
        resolver: zodResolver(deleteRegistrationSchema),
        defaultValues: { remarks: '' },
    });
    
    const remarksForm = useForm<z.infer<typeof adminRemarksSchema>>({
        resolver: zodResolver(adminRemarksSchema),
    });

    const durationForm = useForm<z.infer<typeof durationStatusSchema>>({
        resolver: zodResolver(durationStatusSchema),
        defaultValues: { durationAmount: 0, isOpenToPi: true },
    });

    const handleDeleteInterest = async (values: z.infer<typeof deleteRegistrationSchema>) => {
        if (!interestToUpdate) return;
        setIsDeleting(true);
        try {
            const result = await deleteEmrInterest(interestToUpdate.id, values.remarks, currentUser.name);
            if (result.success) {
                toast({ title: "Registration Deleted", description: "The user has been notified." });
                setIsDeleteDialogOpen(false);
                setInterestToUpdate(null);
                onActionComplete();
            } else {
                toast({ variant: 'destructive', title: "Error", description: result.error });
            }
        } finally {
            setIsDeleting(false);
        }
    };

    const handleOpenDeleteDialog = (interest: EmrInterest) => {
        setInterestToUpdate(interest);
        deleteForm.reset({ remarks: '' });
        setIsDeleteDialogOpen(true);
    };

    const handleOpenDurationDialog = (interest: EmrInterest) => {
        setInterestToUpdate(interest);
        durationForm.reset({
            durationAmount: interest.durationAmount || 0,
            isOpenToPi: interest.isOpenToPi !== undefined ? interest.isOpenToPi : true,
        });
        setIsDurationDialogOpen(true);
    };

    const handleDurationSubmit = async (values: z.infer<typeof durationStatusSchema>) => {
        if (!interestToUpdate) return;
        try {
            const result = await updateEmrInterestDurationAndStatus(
                interestToUpdate.id,
                values.durationAmount,
                values.isOpenToPi
            );
            if (result.success) {
                toast({ title: "Updated", description: "Duration and open/closed status updated." });
                setIsDurationDialogOpen(false);
                setInterestToUpdate(null);
                onActionComplete();
            } else {
                toast({ variant: 'destructive', title: "Error", description: result.error });
            }
        } catch (error) {
            toast({ variant: 'destructive', title: "Error", description: "Failed to update details." });
        }
    };
    
    
    const handleStatusUpdate = async (interestId: string, newStatus: EmrInterest['status'], remarks?: string) => {
        const result = await updateEmrStatus(interestId, newStatus, remarks);
         if (result.success) {
            toast({ title: "Status Updated", description: "The applicant has been notified." });
            onActionComplete();
        } else {
            toast({ variant: 'destructive', title: "Error", description: result.error });
        }
    };

    const handleRemarksSubmit = (values: z.infer<typeof adminRemarksSchema>) => {
        if (interestToUpdate && statusToUpdate) {
            handleStatusUpdate(interestToUpdate.id, statusToUpdate, values.remarks);
        }
        setIsRemarksDialogOpen(false);
    };
    
    const handleOpenRemarksDialog = (interest: EmrInterest, status: EmrInterest['status']) => {
        setInterestToUpdate(interest);
        setStatusToUpdate(status);
        remarksForm.reset({ remarks: '' });
        setIsRemarksDialogOpen(true);
    };

    const handleExport = () => {
        const dataToExport = interests.map(interest => {
            const interestedUser = userMap.get(interest.userId);
            return {
                'Interest ID': interest.interestId || 'N/A',
                'PI Name': interest.userName,
                'PI Email': interest.userEmail,
                'PI Department': interestedUser?.department || interest.department,
                'Co-PIs': interest.coPiNames?.join(', ') || 'None',
                'Duration': interest.durationAmount ?? 'N/A',
                'Open to PI': interest.isOpenToPi ? 'Yes' : 'No',
                'Status': interest.status,
                'Presentation URL': interest.pptUrl || 'Not Submitted'
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Registrations');
        XLSX.writeFile(workbook, `registrations_${call.title.replace(/\s+/g, '_')}.xlsx`);
    };
    
    
    const unscheduledApplicantsExist = interests.some(i => !i.meetingSlot);

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <CardTitle>Applicant Registrations ({interests.length})</CardTitle>
                    <div className="flex items-center gap-2">
                         {unscheduledApplicantsExist && (
                            <Button onClick={() => setIsScheduleDialogOpen(true)}>
                                <CalendarClock className="mr-2 h-4 w-4" /> Schedule Meeting
                            </Button>
                         )}
                        <Button variant="outline" onClick={handleExport} disabled={interests.length === 0}>
                            <Download className="mr-2 h-4 w-4" /> Export XLSX
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
                 {interests.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                        <TableHead>PI</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Open to PI</TableHead>
                        <TableHead className="hidden sm:table-cell">Status</TableHead>
                        <TableHead>Docs</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {interests.map(interest => {
                                const interestedUser = userMap.get(interest.userId);
                                const isMeetingScheduled = !!interest.meetingSlot;
                                const isPostDecision = ['Recommended', 'Not Recommended', 'Revision Needed', 'Endorsement Submitted', 'Endorsement Signed', 'Submitted to Agency'].includes(interest.status);
                                
                                return (
                                    <TableRow key={interest.id}>
                                        <TableCell className="font-medium whitespace-nowrap">
                                            {interestedUser?.misId ? (
                                                <Link href={`/profile/${interestedUser.misId}`} target="_blank" className="text-primary hover:underline">
                                                    {interest.userName}
                                                </Link>
                                            ) : (
                                                interest.userName
                                            )}
                                            <div className="text-xs text-muted-foreground">{interest.interestId}</div>
                                        </TableCell>
                                        <TableCell>
                                            {interest.durationAmount ?? 'N/A'}
                                        </TableCell>
                                        <TableCell>
                                            {interest.isOpenToPi ? 'Yes' : 'No'}
                                        </TableCell>
                                        <TableCell className="hidden sm:table-cell">
                                            <Badge variant={interest.status === 'Recommended' ? 'default' : 'secondary'}>{interest.status}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {interest.pptUrl && <Button asChild size="icon" variant="ghost"><a href={interest.pptUrl} target="_blank" rel="noopener noreferrer" title="View Presentation"><ViewIcon className="h-4 w-4" /></a></Button>}
                                                {interest.revisedPptUrl && <Button asChild size="icon" variant="ghost"><a href={interest.revisedPptUrl} target="_blank" rel="noopener noreferrer" title="View Revised Presentation"><FileUp className="h-4 w-4" /></a></Button>}
                                                {interest.endorsementFormUrl && <Button asChild size="icon" variant="ghost"><a href={interest.endorsementFormUrl} target="_blank" rel="noopener noreferrer" title="View Endorsement Form"><FileUp className="h-4 w-4" /></a></Button>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /><span className="sr-only">Actions</span></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                    <DropdownMenuSeparator />
                                                    {isMeetingScheduled && (
                                                        <>
                                                            {interest.status === 'Recommended' && (
                                                                <DropdownMenuItem disabled>Recommended</DropdownMenuItem> // Now it's the PI's turn
                                                            )}
                                                            {interest.status === 'Endorsement Submitted' && (
                                                                <DropdownMenuItem onClick={() => handleStatusUpdate(interest.id, 'Endorsement Signed')}>Mark as Endorsement Signed</DropdownMenuItem>
                                                            )}
                                                            
                                                            {!isPostDecision && (
                                                                <>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem onClick={() => handleStatusUpdate(interest.id, 'Recommended')}>Recommended</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleStatusUpdate(interest.id, 'Not Recommended')}>Not Recommended</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleOpenRemarksDialog(interest, 'Revision Needed')}>Revision is Needed</DropdownMenuItem>
                                                                </>
                                                            )}
                                                            <DropdownMenuSeparator />
                                                        </>
                                                    )}
                                                    <DropdownMenuItem onClick={() => handleOpenDurationDialog(interest)}>
                                                        Edit Duration / Open Status
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem className="text-destructive" onClick={() => handleOpenDeleteDialog(interest)}>
                                                        <Trash2 className="mr-2 h-4 w-4" /> Delete Registration
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
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
            </CardContent>

             <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Registration for {interestToUpdate?.userName}?</AlertDialogTitle>
                        <AlertDialogDescription>Please provide a reason for this deletion. The user will be notified.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <Form {...deleteForm}>
                        <form id="delete-interest-form" onSubmit={deleteForm.handleSubmit(handleDeleteInterest)}>
                            <FormField
                                control={deleteForm.control}
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
            <Dialog open={isRemarksDialogOpen} onOpenChange={setIsRemarksDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Provide Remarks for {statusToUpdate}</DialogTitle>
                        <DialogDescription>These comments will be sent to the applicant.</DialogDescription>
                    </DialogHeader>
                     <Form {...remarksForm}>
                        <form id="remarks-form" onSubmit={remarksForm.handleSubmit(handleRemarksSubmit)} className="py-4">
                            <FormField
                                control={remarksForm.control}
                                name="remarks"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormControl><Textarea rows={4} {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </form>
                    </Form>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                        <Button type="submit" form="remarks-form">Submit Remarks</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <ScheduleMeetingDialog
                isOpen={isScheduleDialogOpen}
                onOpenChange={setIsScheduleDialogOpen}
                onActionComplete={onActionComplete}
                call={call}
                interests={interests}
                allUsers={allUsers}
             />
        </Card>
    );
}