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
import { Download, Trash2, CalendarClock, Eye } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Textarea } from '../ui/textarea';
import { Form, FormControl, FormField, FormItem, FormMessage } from '../ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useForm } from 'react-hook-form';
import { deleteEmrInterest } from '@/app/actions';
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

export function EmrManagementClient({ call, interests, allUsers, currentUser, onActionComplete }: EmrManagementClientProps) {
    const { toast } = useToast();
    const userMap = new Map(allUsers.map(u => [u.uid, u]));
    const [isDeleting, setIsDeleting] = useState(false);
    const [interestToDelete, setInterestToDelete] = useState<EmrInterest | null>(null);
    const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);

    const form = useForm<z.infer<typeof deleteRegistrationSchema>>({
        resolver: zodResolver(deleteRegistrationSchema),
    });

    const handleDeleteInterest = async (values: z.infer<typeof deleteRegistrationSchema>) => {
        if (!interestToDelete) return;
        setIsDeleting(true);
        try {
            const result = await deleteEmrInterest(interestToDelete.id, values.remarks, currentUser.name);
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
        const dataToExport = interests.map(interest => {
            const interestedUser = userMap.get(interest.userId);
            return {
                'PI Name': interest.userName,
                'PI Email': interest.userEmail,
                'PI Department': interestedUser?.department || interest.department,
                'Co-PIs': interest.coPiNames?.join(', ') || 'None',
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
            <CardContent>
                 {interests.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>PI</TableHead>
                                <TableHead>Department</TableHead>
                                <TableHead>Co-PI(s)</TableHead>
                                <TableHead>Presentation</TableHead>
                                <TableHead>Endorsement Form</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {interests.map(interest => {
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
                                        <TableCell>{interestedUser?.department || interest.department}</TableCell>
                                        <TableCell>{interest.coPiNames?.join(', ') || 'None'}</TableCell>
                                        <TableCell>
                                            {interest.pptUrl ? (
                                                <Button asChild variant="link" className="p-0 h-auto">
                                                    <a href={interest.pptUrl} target="_blank" rel="noopener noreferrer">View PPT</a>
                                                </Button>
                                            ) : 'Not Submitted'}
                                        </TableCell>
                                        <TableCell>
                                            {interest.endorsementFormUrl ? (
                                                 <Button asChild variant="link" className="p-0 h-auto">
                                                     <a href={interest.endorsementFormUrl} target="_blank" rel="noopener noreferrer">View Form</a>
                                                 </Button>
                                             ) : 'Not Submitted'}
                                         </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="destructive" size="icon" onClick={() => setInterestToDelete(interest)}>
                                                <Trash2 className="h-4 w-4" />
                                                <span className="sr-only">Delete Registration</span>
                                            </Button>
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
