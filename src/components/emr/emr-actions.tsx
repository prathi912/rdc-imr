
'use client';

import { useState } from 'react';
import * as z from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { CheckCircle, Loader2, Replace, Trash2, Upload, Eye, MessageSquareWarning, Pencil, CalendarClock } from 'lucide-react';
import type { FundingCall, User, EmrInterest } from '@/types';
import { registerEmrInterest, withdrawEmrInterest, findUserByMisId } from '@/app/actions';
import { isAfter, parseISO } from 'date-fns';
import { Label } from '../ui/label';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { UploadPptDialog } from './upload-ppt-dialog';
import { format } from 'date-fns';


interface EmrActionsProps {
  user: User;
  call: FundingCall;
  interestDetails: EmrInterest | undefined;
  onActionComplete: () => void;
  isDashboardView?: boolean;
}

const registerInterestSchema = z.object({
  coPis: z.array(z.object({ uid: z.string(), name: z.string() })).optional(),
});


function RegisterInterestDialog({ call, user, isOpen, onOpenChange, onRegisterSuccess }: { call: FundingCall; user: User; isOpen: boolean; onOpenChange: (open: boolean) => void; onRegisterSuccess: () => void; }) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [coPiSearchTerm, setCoPiSearchTerm] = useState('');
    const [foundCoPi, setFoundCoPi] = useState<{ uid: string; name: string } | null>(null);
    const [coPiList, setCoPiList] = useState<{ uid: string; name: string }[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const form = useForm<z.infer<typeof registerInterestSchema>>({
        resolver: zodResolver(registerInterestSchema),
    });

    const handleRegister = async () => {
        setIsSubmitting(true);
        try {
            const result = await registerEmrInterest(call.id, user, coPiList);
            if (result.success) {
                toast({ title: 'Interest Registered!', description: 'Your interest has been successfully recorded.' });
                onRegisterSuccess();
                onOpenChange(false);
            } else {
                toast({ variant: 'destructive', title: 'Registration Failed', description: result.error });
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSearchCoPi = async () => {
        if (!coPiSearchTerm) return;
        setIsSearching(true);
        setFoundCoPi(null);
        try {
            const result = await findUserByMisId(coPiSearchTerm);
            if (result.success && result.user) {
                setFoundCoPi(result.user);
            } else {
                toast({ variant: 'destructive', title: 'User Not Found', description: result.error });
            }
        } catch (error) {
            toast({ variant: 'destructive', title: 'Search Failed', description: 'An error occurred while searching.' });
        } finally {
            setIsSearching(false);
        }
    };

    const handleAddCoPi = () => {
        if (foundCoPi && !coPiList.some(coPi => coPi.uid === foundCoPi.uid)) {
            if (user && foundCoPi.uid === user.uid) {
                toast({ variant: 'destructive', title: 'Cannot Add Self', description: 'You cannot add yourself as a Co-PI.' });
                return;
            }
            setCoPiList([...coPiList, foundCoPi]);
        }
        setFoundCoPi(null);
        setCoPiSearchTerm('');
    };

    const handleRemoveCoPi = (uidToRemove: string) => {
        setCoPiList(coPiList.filter(coPi => coPi.uid !== uidToRemove));
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Register Interest for: {call.title}</DialogTitle>
                    <DialogDescription>Confirm your interest and add any Co-Principal Investigators (Co-PIs) to your team.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Search & Add Co-PI by MIS ID (Optional)</Label>
                        <div className="flex items-center gap-2">
                            <Input placeholder="Search by Co-PI's MIS ID" value={coPiSearchTerm} onChange={(e) => setCoPiSearchTerm(e.target.value)} />
                            <Button type="button" onClick={handleSearchCoPi} disabled={isSearching}>
                                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
                            </Button>
                        </div>
                        {foundCoPi && (
                            <div className="flex items-center justify-between p-2 border rounded-md">
                                <p>{foundCoPi.name}</p>
                                <Button type="button" size="sm" onClick={handleAddCoPi}>Add</Button>
                            </div>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label>Current Co-PI(s)</Label>
                        {coPiList.length > 0 ? (
                            coPiList.map((coPi) => (
                                <div key={coPi.uid} className="flex items-center justify-between p-2 bg-secondary rounded-md">
                                    <p className="text-sm font-medium">{coPi.name}</p>
                                    <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveCoPi(coPi.uid)}>Remove</Button>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-muted-foreground">No Co-PIs added.</p>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button onClick={handleRegister} disabled={isSubmitting}>
                        {isSubmitting ? 'Registering...' : 'Confirm Registration'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function EmrActions({ user, call, interestDetails, onActionComplete, isDashboardView = false }: EmrActionsProps) {
    const [isRegisterInterestOpen, setIsRegisterInterestOpen] = useState(false);
    const [isUploadPptOpen, setIsUploadPptOpen] = useState(false);
    const [isRevisionUploadOpen, setIsRevisionUploadOpen] = useState(false);
    const [isWithdrawConfirmationOpen, setIsWithdrawConfirmationOpen] = useState(false);
    const { toast } = useToast();

    if (!user) return null;
    
    const handleWithdrawInterest = async () => {
        if (!interestDetails) return;
        const result = await withdrawEmrInterest(interestDetails.id);
        if (result.success) {
            toast({ title: 'Interest Withdrawn' });
            onActionComplete();
        } else {
            toast({ variant: 'destructive', title: 'Withdrawal Failed', description: result.error });
        }
        setIsWithdrawConfirmationOpen(false);
    };


    const isSuperAdmin = user.role === 'Super-admin';
    const isInterestDeadlinePast = isAfter(new Date(), parseISO(call.interestDeadline));

    if (interestDetails) {
        if (isDashboardView) {
            return (
                <div className="flex flex-col items-start gap-2">
                    {interestDetails.meetingSlot && (
                        <div className="w-full p-3 rounded-lg border-l-4 border-primary bg-primary/10 mb-2">
                            <div className="flex items-center gap-2 font-semibold">
                                <CalendarClock className="h-5 w-5"/>
                                <span>Presentation Scheduled</span>
                            </div>
                            <div className="text-sm mt-2 pl-7 space-y-1">
                                <p><strong>Date:</strong> {format(parseISO(interestDetails.meetingSlot.date), 'MMMM d, yyyy')}</p>
                                <p><strong>Time:</strong> {interestDetails.meetingSlot.time}</p>
                                <p><strong>Venue:</strong> {call.meetingDetails?.venue || 'TBD'}</p>
                            </div>
                        </div>
                    )}
                    {interestDetails.status === 'Revision Needed' ? (
                        <Alert variant="destructive">
                            <MessageSquareWarning className="h-4 w-4" />
                            <AlertTitle>Revision Required</AlertTitle>
                            <AlertDescription>
                                The committee has requested a revision. Please review the comments and submit an updated presentation.
                                <p className="font-semibold mt-2">Admin Remarks: {interestDetails.adminRemarks}</p>
                                <Button size="sm" className="mt-2" onClick={() => setIsRevisionUploadOpen(true)}>
                                    <Pencil className="h-4 w-4 mr-2"/> Submit Revised PPT
                                </Button>
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-md text-green-600 dark:text-green-300 text-sm font-semibold">
                                <CheckCircle className="h-4 w-4"/>
                                <span>Interest Registered</span>
                            </div>
                            {call.status === 'Open' && <Button variant="destructive" size="sm" onClick={() => setIsWithdrawConfirmationOpen(true)}>Withdraw</Button>}
                            <Button size="sm" variant="outline" onClick={() => setIsUploadPptOpen(true)}>
                                {interestDetails?.pptUrl ? 'Manage PPT' : 'Upload PPT'}
                            </Button>
                        </div>
                    )}
                    {isUploadPptOpen && <UploadPptDialog isOpen={isUploadPptOpen} onOpenChange={setIsUploadPptOpen} interest={interestDetails} call={call} user={user} onUploadSuccess={onActionComplete} />}
                    {isRevisionUploadOpen && <UploadPptDialog isOpen={isRevisionUploadOpen} onOpenChange={setIsRevisionUploadOpen} interest={interestDetails} call={call} user={user} onUploadSuccess={onActionComplete} isRevision={true} />}
                    <AlertDialog open={isWithdrawConfirmationOpen} onOpenChange={setIsWithdrawConfirmationOpen}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>This will withdraw your interest from the call. Any uploaded presentation will also be deleted. This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleWithdrawInterest} className="bg-destructive hover:bg-destructive/90">Confirm Withdrawal</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            );
        }

        // Default view for calendar
        return (
             <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-md text-green-600 dark:text-green-300 font-semibold">
                <CheckCircle className="h-5 w-5"/>
                <span>Interest Registered</span>
            </div>
        );
    }

    if (isSuperAdmin || isInterestDeadlinePast) return null;

    return (
        <div>
            <Button onClick={() => setIsRegisterInterestOpen(true)}>
                Register Interest
            </Button>
            {isRegisterInterestOpen && <RegisterInterestDialog isOpen={isRegisterInterestOpen} onOpenChange={setIsRegisterInterestOpen} call={call} user={user} onRegisterSuccess={onActionComplete} />}
        </div>
    )
}
