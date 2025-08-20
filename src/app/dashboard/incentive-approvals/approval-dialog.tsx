
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
import { Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';

interface ApprovalDialogProps {
  claim: IncentiveClaim;
  approver: User;
  claimant: User | null; // Pass the full claimant user object
  stageIndex: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onActionComplete: () => void;
}

const createApprovalSchema = (stageIndex: number) => z.object({
  action: z.enum(['approve', 'reject'], { required_error: 'Please select an action.' }),
  amount: z.coerce.number().optional(),
  comments: z.string().optional(),
  fieldsVerified: z.boolean().optional(),
}).refine(data => data.action !== 'approve' || (data.amount !== undefined && data.amount > 0), {
  message: 'Approved amount must be a positive number.',
  path: ['amount'],
}).refine(data => {
    if (data.action === 'reject') {
        return !!data.comments && data.comments.length > 10;
    }
    if (stageIndex < 2 && data.action === 'approve') { // Stage 1 (index 0) and Stage 2 (index 1)
        return !!data.comments && data.comments.length > 10;
    }
    return true;
}, {
  message: 'Comments are required for this action (min 10 characters).',
  path: ['comments'],
});


type ApprovalFormData = z.infer<ReturnType<typeof createApprovalSchema>>;

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
            {renderDetail('Faculty', claimant?.faculty)}
            {renderDetail('Type of Membership', claim.membershipType)}
            {renderDetail('Professional Body', claim.professionalBodyName)}
            {renderDetail('Locale', claim.membershipLocale)}
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
    
    const approvalSchema = createApprovalSchema(stageIndex);
    const formSchemaWithMembership = approvalSchema.refine(data => !(isMembershipClaim && data.action === 'approve') || data.fieldsVerified === true, {
        message: 'You must confirm that you have checked all fields.',
        path: ['fieldsVerified'],
    });

    const getDefaultAmount = () => {
        // For Stage 3, default to the amount from Stage 2
        if (stageIndex === 2 && claim.approvals && claim.approvals.length > 1) {
            const stage2Approval = claim.approvals.find(a => a.stage === 2);
            if (stage2Approval && stage2Approval.status === 'Approved') {
                return stage2Approval.approvedAmount;
            }
        }
        // Fallback for other stages or if Stage 2 data is not available
        return claim.finalApprovedAmount || claim.calculatedIncentive || 0;
    };

    const form = useForm<ApprovalFormData>({
        resolver: zodResolver(formSchemaWithMembership),
        defaultValues: {
            amount: getDefaultAmount(),
            fieldsVerified: false,
        }
    });

    // When the dialog opens, reset the form with the potentially new default amount.
    useEffect(() => {
        if (isOpen) {
            form.reset({
                amount: getDefaultAmount(),
                fieldsVerified: false,
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
                             {isMembershipClaim && action === 'approve' && (
                                <FormField
                                    control={form.control}
                                    name="fieldsVerified"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                />
                                            </FormControl>
                                            <div className="space-y-1 leading-none">
                                                <FormLabel>
                                                    I confirm that I have checked all the fields of the applicant.
                                                </FormLabel>
                                                <FormMessage />
                                            </div>
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
                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Submitting...</> : 'Submit Action'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
