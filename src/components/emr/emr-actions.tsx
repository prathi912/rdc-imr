
'use client';

import { useState } from 'react';
import * as z from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { db } from '@/lib/config';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { CheckCircle, Loader2, MessageSquareWarning, Pencil, Replace, Trash2, Upload, Eye } from 'lucide-react';
import type { FundingCall, User, EmrInterest } from '@/types';
import { registerEmrInterest, uploadEmrPpt, removeEmrPpt, withdrawEmrInterest, uploadRevisedEmrPpt, findUserByMisId } from '@/app/actions';
import { isAfter, parseISO, subDays, setHours, setMinutes, setSeconds, format } from 'date-fns';
import { Label } from '../ui/label';

interface EmrActionsProps {
  user: User;
  call: FundingCall;
  interestDetails: EmrInterest | undefined;
  onActionComplete: () => void;
}

const pptUploadSchema = z.object({
    pptFile: z.any().refine((files) => files?.length > 0, "Presentation file is required.")
});

const registerInterestSchema = z.object({
  coPis: z.array(z.object({ uid: z.string(), name: z.string() })).optional(),
});

const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};

function UploadPptDialog({ interest, call, onOpenChange, isOpen, user, onUploadSuccess, isRevision = false }: { interest: EmrInterest; call: FundingCall; isOpen: boolean; onOpenChange: (open: boolean) => void; user: User; onUploadSuccess: () => void, isRevision?: boolean; }) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);

    const form = useForm<z.infer<typeof pptUploadSchema>>({
        resolver: zodResolver(pptUploadSchema),
    });
    
    const handleUpload = async (values: z.infer<typeof pptUploadSchema>) => {
        setIsSubmitting(true);
        try {
            const file = values.pptFile[0];
            const pptDataUrl = await fileToDataUrl(file);
            
            let result;
            if (isRevision) {
                result = await uploadRevisedEmrPpt(interest.id, pptDataUrl, file.name, user.name);
            } else {
                result = await uploadEmrPpt(interest.id, pptDataUrl, file.name, user.name);
            }

            if (result.success) {
                toast({ title: "Success", description: "Your presentation has been uploaded." });
                onUploadSuccess();
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
                onUploadSuccess();
                onOpenChange(false);
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        } finally {
            setIsSubmitting(false);
            setIsDeleteConfirmationOpen(false);
        }
    };

    let isDeadlinePast = false;
    let deadlineMessage = "Please upload your presentation before the deadline.";
    if(call.meetingDetails?.date && !isRevision) {
        const meetingDate = parseISO(call.meetingDetails.date);
        const uploadDeadline = setSeconds(setMinutes(setHours(subDays(meetingDate, 2), 17), 0), 0);
        isDeadlinePast = isAfter(new Date(), uploadDeadline);
        deadlineMessage = `The deadline for submission is ${format(uploadDeadline, "PPpp")}.`;
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isRevision ? 'Upload Revised Presentation' : (interest.pptUrl ? 'Manage Presentation' : 'Upload Presentation')}</DialogTitle>
                    <DialogDescription>
                        {interest.pptUrl && !isRevision ? 'You can view, replace, or remove your uploaded presentation.' : `Please upload your presentation for the call: "${call.title}".`}
                        <br/>
                        {!isRevision && call.meetingDetails && deadlineMessage}
                        <br/>
                        <span className="font-semibold">The presentation file should be under 5MB.</span>
                    </DialogDescription>
                </DialogHeader>
                 {call.meetingDetails && isDeadlinePast && !isRevision ? (
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
                     <div className="flex gap-2">
                        {interest.pptUrl && !isRevision && <Button asChild variant="secondary"><a href={interest.pptUrl} target="_blank" rel="noopener noreferrer"><Eye className="h-4 w-4 mr-2" />View PPT</a></Button>}
                        {interest.pptUrl && !(call.meetingDetails && isDeadlinePast) && !isRevision && (
                            <Button variant="destructive" size="sm" onClick={() => setIsDeleteConfirmationOpen(true)} disabled={isSubmitting}>
                                <Trash2 className="h-4 w-4 mr-2" /> Remove
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                         {!(call.meetingDetails && isDeadlinePast && !isRevision) && (
                            <Button type="submit" form="upload-ppt-form" disabled={isSubmitting}>
                                {isSubmitting ? "Saving..." : (isRevision ? 'Submit Revision' : (interest.pptUrl ? 'Replace File' : 'Upload File'))}
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

export function EmrActions({ user, call, interestDetails, onActionComplete }: EmrActionsProps) {
    const [isRegisterInterestOpen, setIsRegisterInterestOpen] = useState(false);
    const [isUploadPptOpen, setIsUploadPptOpen] = useState(false);
    const [isRevisionUploadOpen, setIsRevisionUploadOpen] = useState(false);
    const [isWithdrawConfirmationOpen, setIsWithdrawConfirmationOpen] = useState(false);
    const { toast } = useToast();

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

    if (!user) return null;

    const isSuperAdmin = user.role === 'Super-admin';
    const isInterestDeadlinePast = isAfter(new Date(), parseISO(call.interestDeadline));

    if (interestDetails) {
        // User has registered interest
        return (
            <div className="flex flex-col items-start gap-2">
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
                        <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-md text-green-600 dark:text-green-300 font-semibold">
                            <CheckCircle className="h-5 w-5"/>
                            <span>Interest Registered</span>
                        </div>
                        {call.status === 'Open' && <Button variant="destructive" size="sm" onClick={() => setIsWithdrawConfirmationOpen(true)}>Withdraw</Button>}
                        <Button size="sm" variant="outline" onClick={() => setIsUploadPptOpen(true)}>
                            {interestDetails?.pptUrl ? <Replace className="h-4 w-4 mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
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
                            <AlertDialogDescription>
                                This will withdraw your interest from the call. Any uploaded presentation will also be deleted. This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleWithdrawInterest} className="bg-destructive hover:bg-destructive/90">Confirm Withdrawal</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        )
    }

    // User has not registered interest
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
