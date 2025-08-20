'use client';

import { useState } from 'react';
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

interface ApprovalDialogProps {
  claim: IncentiveClaim;
  approver: User;
  stageIndex: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onActionComplete: () => void;
}

const approvalSchema = z.object({
  action: z.enum(['approve', 'reject'], { required_error: 'Please select an action.' }),
  amount: z.coerce.number().optional(),
  comments: z.string().optional(),
}).refine(data => data.action !== 'approve' || (data.amount !== undefined && data.amount > 0), {
  message: 'Approved amount must be a positive number.',
  path: ['amount'],
}).refine(data => data.action !== 'reject' || (!!data.comments && data.comments.length > 10), {
  message: 'Comments are required for rejection (min 10 characters).',
  path: ['comments'],
});

type ApprovalFormData = z.infer<typeof approvalSchema>;

export function ApprovalDialog({ claim, approver, stageIndex, isOpen, onOpenChange, onActionComplete }: ApprovalDialogProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const form = useForm<ApprovalFormData>({
        resolver: zodResolver(approvalSchema),
        defaultValues: {
            amount: claim.calculatedIncentive || 0,
        }
    });

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
    
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Stage {stageIndex + 1} Approval</DialogTitle>
                    <DialogDescription>Review and take action on the claim for {claim.userName}.</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form id="approval-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
                        <FormField
                            name="action"
                            control={form.control}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Action</FormLabel>
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
                                    <FormLabel>Comments {action === 'reject' && '(Required)'}</FormLabel>
                                    <FormControl><Textarea {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </form>
                </Form>
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
