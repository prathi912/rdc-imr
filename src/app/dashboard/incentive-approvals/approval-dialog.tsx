
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/hooks/use-toast';
import type { User, IncentiveClaim } from '@/types';
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

const createApprovalSchema = (stageIndex: number) => z.object({
  action: z.enum(['approve', 'reject'], { required_error: 'Please select an action.' }),
  amount: z.coerce.number().optional(),
  comments: z.string().optional(),
  verifiedFields: verifiedFieldsSchema,
}).refine(data => data.action !== 'approve' || (data.amount !== undefined && data.amount > 0), {
  message: 'Approved amount must be a positive number.',
  path: ['amount'],
}).refine(data => {
    if (data.action === 'reject') {
        return !!data.comments && data.comments.length > 0;
    }
    if (stageIndex < 2 && data.action === 'approve') {
        return !!data.comments && data.comments.trim() !== '';
    }
    return true;
}, {
  message: 'Comments are required for this action.',
  path: ['comments'],
});


type ApprovalFormData = z.infer<ReturnType<typeof createApprovalSchema>>;

const researchPaperFields = [
    { id: 'name', label: 'Name of the Applicant' },
    { id: 'designation', label: 'Designation and Dept.' },
    { id: 'publicationType', label: 'Type of publication' },
    { id: 'journalName', label: 'Name of Journal' },
    { id: 'locale', label: 'Whether National/International' },
    { id: 'indexType', label: 'Indexed In' },
    { id: 'journalClassification', label: 'Q Rating of the Journal' },
    { id: 'authorType', label: 'First/Corresponding Author' },
    { id: 'totalPuAuthors', label: 'No. of Authors from PU' },
    { id: 'issn', label: 'ISSN' },
    { id: 'publicationProof', label: 'PROOF OF PUBLICATION ATTACHED' },
    { id: 'isPuNameInPublication', label: 'Whether “PU” name exists' },
    { id: 'publicationDate', label: 'Published Month & Year' },
    { id: 'authorPosition', label: 'Author Position' }
];


function ResearchPaperClaimDetails({ claim, claimant, form, isChecklistEnabled }: { claim: IncentiveClaim, claimant: User | null, form: any, isChecklistEnabled: boolean }) {
  const renderDetail = (fieldId: string, label: string, value?: string | number | null | boolean | string[]) => {
    if (value === undefined || value === null || value === '') return null;
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
        <span className="col-span-5">{displayValue}</span>
         {isChecklistEnabled && (
            <FormField
                control={form.control}
                name={`verifiedFields.${fieldId}`}
                render={({ field }) => (
                    <FormItem className="col-span-2 flex justify-end gap-2">
                        <FormControl>
                            <div className="flex items-center gap-2">
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
    );
  };

  return (
    <div className="space-y-4 rounded-lg border bg-muted/50 p-4">
        <div className="flex items-center justify-between">
            <h4 className="font-semibold">Research Paper Details to Verify</h4>
            {isChecklistEnabled && <h4 className="font-semibold text-xs pr-4">Verification</h4>}
        </div>
        <div className="space-y-1">
            {renderDetail('name', 'Name of the Applicant', claimant?.name)}
            {renderDetail('designation', 'Designation and Dept.', `${claimant?.designation || 'N/A'}, ${claimant?.department || 'N/A'}`)}
            {renderDetail('publicationType', 'Type of publication', claim.publicationType)}
            {renderDetail('journalName', 'Name of Journal', claim.journalName)}
            {renderDetail('locale', 'Whether National/International', claim.locale)}
            {renderDetail('indexType', 'Indexed In', claim.indexType?.toUpperCase())}
            {renderDetail('journalClassification', 'Q Rating of the Journal', claim.journalClassification)}
            {renderDetail('authorType', 'First/Corresponding Author', claim.authorType)}
            {renderDetail('totalPuAuthors', 'No. of Authors from PU', claim.totalPuAuthors)}
            {renderDetail('issn', 'ISSN', `${claim.printIssn || 'N/A'} (Print), ${claim.electronicIssn || 'N/A'} (Electronic)`)}
            {renderDetail('publicationProof', 'PROOF OF PUBLICATION ATTACHED', !!claim.publicationProofUrls && claim.publicationProofUrls.length > 0)}
            {renderDetail('isPuNameInPublication', 'Whether “PU” name exists', claim.isPuNameInPublication)}
            {renderDetail('publicationDate', 'Published Month & Year', `${claim.publicationMonth}, ${claim.publicationYear}`)}
            {renderDetail('authorPosition', 'Author Position', 'N/A')}
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
    const isChecklistEnabled = (isResearchPaperClaim && stageIndex < 2);
    
    const approvalSchema = createApprovalSchema(stageIndex);
    const formSchemaWithVerification = approvalSchema.refine(data => {
        if (!isChecklistEnabled || data.action !== 'approve') return true;
        return researchPaperFields.every(field => data.verifiedFields?.[field.id] !== undefined);
    }, {
        message: 'You must verify all fields (mark as correct or incorrect).',
        path: ['verifiedFields'],
    });

    const getDefaultAmount = () => {
        if (stageIndex === 2 && claim.approvals && claim.approvals.length > 1) {
            const stage2Approval = claim.approvals.find(a => a.stage === 2);
            if (stage2Approval && stage2Approval.status === 'Approved') {
                return stage2Approval.approvedAmount;
            }
        }
        return claim.finalApprovedAmount || claim.calculatedIncentive || 0;
    };

    const form = useForm<ApprovalFormData>({
        resolver: zodResolver(formSchemaWithVerification),
        defaultValues: {
            amount: getDefaultAmount(),
            verifiedFields: {},
        }
    });

    useEffect(() => {
        if (isOpen) {
            form.reset({
                amount: getDefaultAmount(),
                verifiedFields: {},
                action: undefined,
                comments: '',
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, claim, stageIndex]);


    const action = form.watch('action');

    const handleSubmit = async (values: ApprovalFormData) => {
        setIsSubmitting(true);
        try {
            const result = await processIncentiveClaimAction(claim.id, values.action, approver, stageIndex, values);
            if (result.success) {
                toast({ title: 'Success', description: `Claim has been ${values.action === 'approve' ? 'approved' : 'rejected'}.` });
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
        if (action === 'reject') return 'Your Comments (Required)';
        if (stageIndex < 2 && action === 'approve') return 'Your Comments (Required)';
        return 'Your Comments (Optional)';
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Stage {stageIndex + 1} Approval</DialogTitle>
                    <DialogDescription>Review and take action on the claim for {claim.userName}.</DialogDescription>
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
                                    {approval.status === 'Approved' && (
                                        <p><strong className="text-muted-foreground">Approved Amount:</strong> ₹{approval.approvedAmount.toLocaleString('en-IN')}</p>
                                    )}
                                </div>
                                )
                            ))}
                            <Separator />
                        </div>
                    )}

                    {isMembershipClaim && <MembershipClaimDetails claim={claim} claimant={claimant} />}
                    {isResearchPaperClaim && <ResearchPaperClaimDetails claim={claim} claimant={claimant} form={form} isChecklistEnabled={isChecklistEnabled} />}


                    <Form {...form}>
                        <form id="approval-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                            <FormField
                                name="action"
                                control={form.control}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Your Action</FormLabel>
                                        <FormControl>
                                            <RadioGroup onValueChange={field.onChange} value={field.value} className="flex space-x-4">
                                                <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="approve" /></FormControl><FormLabel className="font-normal">Approve</FormLabel></FormItem>
                                                <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="reject" /></FormControl><FormLabel className="font-normal">Reject</FormLabel></FormItem>
                                            </RadioGroup>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {action === 'approve' && (
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
                        </form>
                    </Form>
                </div>
                 <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button type="submit" form="approval-form" disabled={isSubmitting}>
                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Submitting...</> : 'Submit Action'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
