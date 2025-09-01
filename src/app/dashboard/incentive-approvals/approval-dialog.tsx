
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/hooks/use-toast';
import type { User, IncentiveClaim, ApprovalStage } from '@/types';
import { processIncentiveClaimAction } from '@/app/incentive-approval-actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Check, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface ApprovalDialogProps {
  claim: IncentiveClaim;
  approver: User;
  claimant: User | null; // Pass the full claimant user object
  stageIndex: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onActionComplete: () => void;
}

const verifiedFieldsSchema = z.record(z.string(), z.boolean()).optional();

const createApprovalSchema = (stageIndex: number, isChecklistEnabled: boolean) => z.object({
  action: z.enum(['approve', 'reject', 'verify']),
  amount: z.coerce.number().positive("Amount cannot be in negative.").optional(),
  comments: z.string().optional(),
  verifiedFields: verifiedFieldsSchema,
}).refine(data => {
    // If it's a checklist-based approval, action is implicitly 'verify'.
    // Otherwise, an action must be explicitly chosen.
    return isChecklistEnabled || !!data.action;
}, {
    message: 'Please select an action.',
    path: ['action'],
})
.refine(data => {
    if (stageIndex > 0 && data.action === 'approve') {
        return data.amount !== undefined && data.amount > 0;
    }
    return true;
}, {
  message: 'Approved amount must be a positive number for this stage.',
  path: ['amount'],
}).refine(data => {
    // Comments are always required for rejection.
    if (data.action === 'reject') {
        return !!data.comments && data.comments.trim() !== '';
    }
    // Comments are required for stages 2 and 3 (index 1 and 2) on approval.
    if (stageIndex >= 1 && data.action === 'approve') {
        return !!data.comments && data.comments.trim() !== '';
    }
    // Comments are optional for Stage 1 (index 0) approval.
    return true;
}, {
  message: 'Comments are required for this action.',
  path: ['comments'],
});


type ApprovalFormData = z.infer<ReturnType<typeof createApprovalSchema>>;

const allPossibleResearchPaperFields: { id: keyof IncentiveClaim | 'name' | 'designation' | 'authorRoleAndPosition', label: string }[] = [
    { id: 'name', label: 'Name of the Applicant' },
    { id: 'designation', label: 'Designation and Dept.' },
    { id: 'publicationType', label: 'Type of publication' },
    { id: 'journalName', label: 'Name of Journal' },
    { id: 'locale', label: 'Whether National/International' },
    { id: 'indexType', label: 'Indexed In' },
    { id: 'wosType', label: 'WoS Type' },
    { id: 'journalClassification', label: 'Q Rating of the Journal' },
    { id: 'authorRoleAndPosition', label: 'Author Role / Position' },
    { id: 'totalPuAuthors', label: 'No. of Authors from PU' },
    { id: 'printIssn', label: 'ISSN' }, // Simplified for display
    { id: 'publicationProofUrls', label: 'PROOF OF PUBLICATION ATTACHED' },
    { id: 'isPuNameInPublication', label: 'Whether “PU” name exists' },
    { id: 'publicationMonth', label: 'Published Month & Year' }, // Simplified for display
];

function getVerificationMark(approval: ApprovalStage | null | undefined, fieldId: string) {
    if (!approval) return null;
    const verifiedStatus = approval.verifiedFields?.[fieldId];
    if (verifiedStatus === true) return <Check className="h-4 w-4 text-green-600" />;
    if (verifiedStatus === false) return <X className="h-4 w-4 text-red-600" />;
    return null;
}


function ResearchPaperClaimDetails({ 
    claim, 
    claimant, 
    form, 
    isChecklistEnabled, 
    stageIndex, 
    previousApprovals 
}: { 
    claim: IncentiveClaim, 
    claimant: User | null, 
    form: any, 
    isChecklistEnabled: boolean,
    stageIndex: number,
    previousApprovals: (ApprovalStage | null)[]
}) {
    const approval1 = previousApprovals[0];
    const approval2 = previousApprovals[1];

    const renderDetail = (fieldId: string, label: string, value?: string | number | null | boolean | string[]) => {
        if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return null;
        let displayValue = String(value);
        if (typeof value === 'boolean') {
            displayValue = value ? 'Yes' : 'No';
        }
        if (Array.isArray(value)) {
            displayValue = value.join(', ');
        }
        return (
            <div className="grid grid-cols-12 gap-2 text-sm items-center py-1">
                <span className="text-muted-foreground col-span-5">{label}</span>
                <span className="col-span-4">{displayValue}</span>
                <div className="col-span-3 flex justify-end gap-1">
                    {stageIndex > 0 && (
                        <div className="w-7 h-7 flex items-center justify-center">
                            <TooltipProvider><Tooltip><TooltipTrigger>{getVerificationMark(approval1, fieldId)}</TooltipTrigger><TooltipContent><p>Approver 1 Verification</p></TooltipContent></Tooltip></TooltipProvider>
                        </div>
                    )}
                     {stageIndex > 1 && (
                        <div className="w-7 h-7 flex items-center justify-center">
                             <TooltipProvider><Tooltip><TooltipTrigger>{getVerificationMark(approval2, fieldId)}</TooltipTrigger><TooltipContent><p>Approver 2 Verification</p></TooltipContent></Tooltip></TooltipProvider>
                        </div>
                    )}
                    {isChecklistEnabled && (
                        <FormField
                            control={form.control}
                            name={`verifiedFields.${fieldId}`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <div className="flex items-center gap-1">
                                            <Button type="button" size="icon" variant={field.value === true ? 'secondary' : 'ghost'} className="h-7 w-7" onClick={() => field.onChange(field.value === true ? undefined : true)}>
                                                <Check className="h-4 w-4" />
                                            </Button>
                                            <Button type="button" size="icon" variant={field.value === false ? 'destructive' : 'ghost'} className="h-7 w-7" onClick={() => field.onChange(field.value === false ? undefined : false)}>
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4 rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center justify-between">
                <h4 className="font-semibold">Research Paper Details to Verify</h4>
                <div className="grid grid-cols-3 gap-1 text-xs font-semibold text-center">
                    {stageIndex > 0 && <span>Appr. 1</span>}
                    {stageIndex > 1 && <span>Appr. 2</span>}
                    {isChecklistEnabled && <span>Your Verify</span>}
                </div>
            </div>
            <div className="space-y-1">
                {renderDetail('name', 'Name of the Applicant', claimant?.name)}
                {renderDetail('designation', 'Designation and Dept.', `${claimant?.designation || 'N/A'}, ${claimant?.department || 'N/A'}`)}
                {renderDetail('publicationType', 'Type of publication', claim.publicationType)}
                {renderDetail('journalName', 'Name of Journal', claim.journalName)}
                {renderDetail('locale', 'Whether National/International', claim.locale)}
                {renderDetail('indexType', 'Indexed In', claim.indexType?.toUpperCase())}
                {renderDetail('wosType', 'WoS Type', claim.wosType)}
                {renderDetail('journalClassification', 'Q Rating of the Journal', claim.journalClassification)}
                {renderDetail('authorRoleAndPosition', 'Author Role / Position', `${claim.authorType || 'N/A'} / ${claim.authorPosition || 'N/A'}`)}
                {renderDetail('totalPuAuthors', 'No. of Authors from PU', claim.totalPuAuthors)}
                {renderDetail('printIssn', 'ISSN', `${claim.printIssn || 'N/A'} (Print), ${claim.electronicIssn || 'N/A'} (Electronic)`)}
                {renderDetail('publicationProofUrls', 'PROOF OF PUBLICATION ATTACHED', !!claim.publicationProofUrls && claim.publicationProofUrls.length > 0)}
                {renderDetail('isPuNameInPublication', 'Whether “PU” name exists', claim.isPuNameInPublication)}
                {renderDetail('publicationMonth', 'Published Month & Year', `${claim.publicationMonth}, ${claim.publicationYear}`)}
            </div>
            {isChecklistEnabled && <FormMessage>{form.formState.errors.verifiedFields?.message}</FormMessage>}
        </div>
    );
}

function MembershipClaimDetails({ claim, claimant }: { claim: IncentiveClaim, claimant: User | null }) {
  const renderDetail = (label: string, value?: string | number | null) => {
    if (!value && value !== 0) return null;
    return (
      <div className="grid grid-cols-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span>{value}</span>
      </div>
    );
  };

  return (
    <div className="space-y-4 rounded-lg border bg-muted/50 p-4">
        <h4 className="font-semibold">Membership Details to Verify</h4>
        <div className="space-y-1">
            {renderDetail('Designation and Dept.', `${claimant?.designation || 'N/A'}, ${claimant?.department || 'N/A'}`)}
            {renderDetail('Department/Faculty', claimant?.faculty)}
            {renderDetail('Type of Membership', claim.membershipType)}
            {renderDetail('Professional Body', claim.professionalBodyName)}
            {renderDetail('Locale of Professional Body', claim.membershipLocale)}
            {renderDetail('Membership Number', claim.membershipNumber)}
            {renderDetail('Amount Paid', `₹${claim.membershipAmountPaid?.toLocaleString('en-IN')}`)}
            {renderDetail('Payment Date', claim.membershipPaymentDate ? new Date(claim.membershipPaymentDate).toLocaleDateString() : 'N/A')}
        </div>
    </div>
  );
}

export function ApprovalDialog({ claim, approver, claimant, stageIndex, isOpen, onOpenChange, onActionComplete }: ApprovalDialogProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const isMembershipClaim = claim.claimType === 'Membership of Professional Bodies';
    const isResearchPaperClaim = claim.claimType === 'Research Papers';
    // Checklist is only for stage 1 (index 0) of Research Papers
    const isChecklistEnabled = (isResearchPaperClaim && stageIndex === 0);
    
    // Dynamically determine which fields need verification based on the claim's data
    const getFieldsToVerify = () => {
        if (!isResearchPaperClaim) return [];

        const claimWithUserData = {
            ...claim,
            name: claimant?.name,
            designation: `${claimant?.designation || 'N/A'}, ${claimant?.department || 'N/A'}`,
            authorRoleAndPosition: `${claim.authorType || 'N/A'} / ${claim.authorPosition || 'N/A'}`
        };

        return allPossibleResearchPaperFields
            .filter(field => {
                const value = (claimWithUserData as any)[field.id];
                return value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0);
            })
            .map(field => field.id);
    };
    const fieldsToVerify = getFieldsToVerify();
    
    const approvalSchema = createApprovalSchema(stageIndex, isChecklistEnabled);
    const formSchemaWithVerification = approvalSchema.refine(data => {
        if (!isChecklistEnabled) return true;
        // Check if every required field has a boolean value (true or false)
        return fieldsToVerify.every(fieldId => typeof data.verifiedFields?.[fieldId] === 'boolean');
    }, {
        message: 'You must verify all visible fields (mark as correct or incorrect).',
        path: ['verifiedFields'],
    });

    const getDefaultAmount = () => {
        if (stageIndex >= 2 && claim.approvals && claim.approvals.length > 1) {
            const stageApproval = claim.approvals.find(a => a?.stage === stageIndex); // Find previous stage's amount
            if (stageApproval && stageApproval.status === 'Approved') {
                return stageApproval.approvedAmount;
            }
        }
        return claim.finalApprovedAmount || claim.calculatedIncentive || 0;
    };

    const form = useForm<ApprovalFormData>({
        resolver: zodResolver(formSchemaWithVerification),
        defaultValues: {
            amount: getDefaultAmount(),
            verifiedFields: {},
            action: isChecklistEnabled ? 'verify' : 'approve',
        }
    });

    useEffect(() => {
        if (isOpen) {
            form.reset({
                amount: getDefaultAmount(),
                verifiedFields: {},
                action: isChecklistEnabled ? 'verify' : 'approve',
                comments: '',
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, claim, stageIndex]);


    const action = form.watch('action');

    const handleSubmit = async (values: ApprovalFormData) => {
        setIsSubmitting(true);
        try {
            const actionToSubmit = values.action;

            const result = await processIncentiveClaimAction(claim.id, actionToSubmit, approver, stageIndex, values);
            if (result.success) {
                let successMessage = 'Action submitted successfully.';
                if (actionToSubmit === 'verify') successMessage = 'Checklist verified and claim forwarded.';
                else if (actionToSubmit === 'approve') successMessage = 'Claim has been approved.';
                else if (actionToSubmit === 'reject') successMessage = 'Claim has been rejected.';
                
                toast({ title: 'Success', description: successMessage });
                onActionComplete();
                onOpenChange(false);
                form.reset();
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Action Failed', description: error.message || 'An unexpected error occurred.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const previousApprovals = (claim.approvals || []).filter(a => a?.stage < stageIndex + 1);
    
    const getCommentLabel = () => {
        const currentAction = form.getValues('action');
        if (currentAction === 'reject') return 'Your Comments (Required)';
        if (stageIndex >= 1 && currentAction === 'approve') return 'Your Comments (Required)';
        return 'Your Comments (Optional)';
    };
    
    const profileLink = claimant?.campus === 'Goa' ? `/goa/${claimant.misId}` : `/profile/${claimant.misId}`;
    const hasProfileLink = claimant && claimant.misId;

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Stage {stageIndex + 1} Approval</DialogTitle>
                    <DialogDescription>
                        Review and take action on the claim for {' '}
                        {hasProfileLink ? (
                            <Link href={profileLink} target="_blank" className="text-primary hover:underline">{claim.userName}</Link>
                        ) : (
                            claim.userName
                        )}.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="max-h-[60vh] overflow-y-auto pr-4 space-y-4">
                    {previousApprovals.length > 0 && (
                        <div className="space-y-4">
                            <h4 className="font-semibold text-sm">Previous Approval History</h4>
                            {previousApprovals.map((approval, index) => (
                                approval && (
                                <div key={index} className="p-4 border rounded-lg bg-muted/50 space-y-2 text-sm">
                                    <div className="flex justify-between items-center">
                                        <p className="font-semibold">Stage {approval.stage}: {approval.approverName}</p>
                                        <p className={`font-semibold ${approval.status === 'Approved' ? 'text-green-600' : 'text-red-600'}`}>{approval.status}</p>
                                    </div>
                                    <p><strong className="text-muted-foreground">Comments:</strong> {approval.comments || 'N/A'}</p>
                                    {approval.status === 'Approved' && approval.stage > 1 && (
                                        <p><strong className="text-muted-foreground">Approved Amount:</strong> ₹{approval.approvedAmount.toLocaleString('en-IN')}</p>
                                    )}
                                </div>
                                )
                            ))}
                            <Separator />
                        </div>
                    )}

                    <Form {...form}>
                        {isMembershipClaim && <MembershipClaimDetails claim={claim} claimant={claimant} />}
                        {isResearchPaperClaim && <ResearchPaperClaimDetails claim={claim} claimant={claimant} form={form} isChecklistEnabled={isChecklistEnabled} stageIndex={stageIndex} previousApprovals={claim.approvals || []} />}


                        <form id="approval-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                             {!isChecklistEnabled && (
                                <FormField
                                    name="action"
                                    control={form.control}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Your Action</FormLabel>
                                            <FormControl>
                                                <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex space-x-4">
                                                    <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="approve" /></FormControl><FormLabel className="font-normal">Approve</FormLabel></FormItem>
                                                    <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="reject" /></FormControl><FormLabel className="font-normal">Reject</FormLabel></FormItem>
                                                </RadioGroup>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}
                            {action === 'approve' && stageIndex > 0 && (
                                <FormField
                                    name="amount"
                                    control={form.control}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Approved Amount (INR)</FormLabel>
                                            <FormControl><Input type="number" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}
                             {((action === 'reject') || (stageIndex > 0 && action === 'approve')) && (
                                <FormField
                                    name="comments"
                                    control={form.control}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{getCommentLabel()}</FormLabel>
                                            <FormControl><Textarea {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                             )}
                        </form>
                    </Form>
                </div>
                 <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button type="submit" form="approval-form" disabled={isSubmitting}>
                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Submitting...</> : (
                            isChecklistEnabled ? 'Submit & Forward' : 'Submit Action'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
