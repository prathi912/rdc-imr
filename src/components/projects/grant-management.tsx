'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { Project, User, GrantDetails } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { useState } from 'react';
import { DollarSign, Banknote, FileText, CheckCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface GrantManagementProps {
  project: Project;
  user: User;
  onUpdate: (updatedProject: Project) => void;
}

const bankDetailsSchema = z.object({
  accountHolderName: z.string().min(2, "Account holder's name is required."),
  accountNumber: z.string().min(5, "A valid account number is required."),
  bankName: z.string().min(2, "Bank name is required."),
  ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code format."),
});

const utilizationSchema = z.object({
  amountSpent: z.coerce.number().positive("Amount spent must be a positive number."),
  description: z.string().min(20, "Please provide a detailed description of fund utilization."),
});

export function GrantManagement({ project, user, onUpdate }: GrantManagementProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isAdmin = user.role === 'admin';
  const isPI = user.uid === project.pi_uid;

  const bankForm = useForm<z.infer<typeof bankDetailsSchema>>({
    resolver: zodResolver(bankDetailsSchema),
    defaultValues: project.grant?.bankDetails || {
      accountHolderName: '',
      accountNumber: '',
      bankName: '',
      ifscCode: '',
    },
  });

  const utilizationForm = useForm<z.infer<typeof utilizationSchema>>({
    resolver: zodResolver(utilizationSchema),
    defaultValues: project.grant?.utilizationReport || {
      amountSpent: 0,
      description: '',
    },
  });

  const handleBankDetailsSubmit = async (values: z.infer<typeof bankDetailsSchema>) => {
    if (!project.grant) return;
    setIsSubmitting(true);
    try {
      const projectRef = doc(db, 'projects', project.id);
      const updatedGrant: GrantDetails = {
        ...project.grant,
        bankDetails: values,
        status: 'Bank Details Submitted',
      };
      await updateDoc(projectRef, { grant: updatedGrant });
      onUpdate({ ...project, grant: updatedGrant });
      toast({ title: 'Success', description: 'Bank details submitted successfully. Awaiting disbursement.' });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to submit bank details.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUtilizationSubmit = async (values: z.infer<typeof utilizationSchema>) => {
    if (!project.grant) return;
    setIsSubmitting(true);
    try {
      const projectRef = doc(db, 'projects', project.id);
      const updatedGrant: GrantDetails = {
        ...project.grant,
        utilizationReport: {
          ...values,
          submissionDate: new Date().toISOString(),
        },
        status: 'Utilization Submitted',
      };
      await updateDoc(projectRef, { grant: updatedGrant });
      onUpdate({ ...project, grant: updatedGrant });
      toast({ title: 'Success', description: 'Utilization report submitted successfully.' });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to submit utilization report.' });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleAdminStatusUpdate = async (newStatus: GrantDetails['status']) => {
    if (!project.grant) return;
    setIsSubmitting(true);
    try {
        const projectRef = doc(db, 'projects', project.id);
        const updatedGrant: GrantDetails = {
            ...project.grant,
            status: newStatus,
        };
        if (newStatus === 'Disbursed' && !updatedGrant.disbursementDate) {
            updatedGrant.disbursementDate = new Date().toISOString();
        }

        await updateDoc(projectRef, { grant: updatedGrant });
        onUpdate({ ...project, grant: updatedGrant });
        toast({ title: 'Success', description: `Grant status updated to ${newStatus}.`});

    } catch (error) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to update grant status.' });
    } finally {
        setIsSubmitting(false);
    }
  };

  const grant = project.grant;
  if (!grant) return null;

  return (
    <Card className="mt-8">
      <CardHeader>
        <div className="flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            <CardTitle>Grant Management</CardTitle>
        </div>
        <CardDescription>
          Grant of ₹{grant.amount.toLocaleString('en-IN')} awarded for this project. Current status: <span className="font-semibold">{grant.status}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isAdmin && (
            <div className="p-4 border rounded-lg space-y-4 bg-muted/30">
                <h4 className="font-semibold">Admin Controls</h4>
                <div className="flex items-center gap-4">
                    <Select onValueChange={(value: GrantDetails['status']) => handleAdminStatusUpdate(value)} defaultValue={grant.status} disabled={isSubmitting}>
                        <SelectTrigger className="w-[240px]">
                            <SelectValue placeholder="Update grant status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Pending Bank Details">Pending Bank Details</SelectItem>
                            <SelectItem value="Bank Details Submitted">Bank Details Submitted</SelectItem>
                            <SelectItem value="Disbursed">Disbursed</SelectItem>
                            <SelectItem value="Utilization Submitted">Utilization Submitted</SelectItem>
                            <SelectItem value="Completed">Completed</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        )}

        {isPI && grant.status === 'Pending Bank Details' && !grant.bankDetails && (
          <Form {...bankForm}>
            <form onSubmit={bankForm.handleSubmit(handleBankDetailsSubmit)} className="space-y-4 p-4 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                    <Banknote className="h-5 w-5 text-muted-foreground"/>
                    <h4 className="font-semibold">Submit Bank Account Details</h4>
                </div>
              <FormField name="accountHolderName" control={bankForm.control} render={({ field }) => ( <FormItem><FormLabel>Account Holder Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
              <FormField name="accountNumber" control={bankForm.control} render={({ field }) => ( <FormItem><FormLabel>Account Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField name="bankName" control={bankForm.control} render={({ field }) => ( <FormItem><FormLabel>Bank Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="ifscCode" control={bankForm.control} render={({ field }) => ( <FormItem><FormLabel>IFSC Code</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
              </div>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Submitting...' : 'Submit Bank Details'}</Button>
            </form>
          </Form>
        )}
        
        {grant.bankDetails && (
            <div className="p-4 border rounded-lg space-y-2">
                <div className="flex items-center gap-2 mb-2">
                    <Banknote className="h-5 w-5 text-muted-foreground"/>
                    <h4 className="font-semibold">Bank Account Details</h4>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="font-medium text-muted-foreground">Account Holder</dt>
                    <dd>{grant.bankDetails.accountHolderName}</dd>
                    <dt className="font-medium text-muted-foreground">Account Number</dt>
                    <dd>{grant.bankDetails.accountNumber}</dd>
                    <dt className="font-medium text-muted-foreground">Bank Name</dt>
                    <dd>{grant.bankDetails.bankName}</dd>
                    <dt className="font-medium text-muted-foreground">IFSC Code</dt>
                    <dd>{grant.bankDetails.ifscCode}</dd>
                    {grant.disbursementDate && (
                        <>
                            <dt className="font-medium text-muted-foreground mt-2">Disbursement Date</dt>
                            <dd>{new Date(grant.disbursementDate).toLocaleDateString()}</dd>
                        </>
                    )}
                </dl>
            </div>
        )}

        {isPI && (grant.status === 'Disbursed' || (grant.status === 'Utilization Submitted' && grant.utilizationReport === undefined)) && (
          <Form {...utilizationForm}>
            <form onSubmit={utilizationForm.handleSubmit(handleUtilizationSubmit)} className="space-y-4 p-4 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-5 w-5 text-muted-foreground"/>
                    <h4 className="font-semibold">Submit Fund Utilization Report</h4>
                </div>
              <FormField name="amountSpent" control={utilizationForm.control} render={({ field }) => ( <FormItem><FormLabel>Amount Spent (₹)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
              <FormField name="description" control={utilizationForm.control} render={({ field }) => ( <FormItem><FormLabel>Utilization Description</FormLabel><FormControl><Textarea rows={5} {...field} /></FormControl><FormMessage /></FormItem> )} />
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Submitting...' : 'Submit Report'}</Button>
            </form>
          </Form>
        )}
        
        {grant.utilizationReport && (
            <div className="p-4 border rounded-lg space-y-2">
                <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-5 w-5 text-muted-foreground"/>
                    <h4 className="font-semibold">Fund Utilization Report</h4>
                </div>
                 <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="font-medium text-muted-foreground">Amount Spent</dt>
                    <dd>₹{grant.utilizationReport.amountSpent.toLocaleString('en-IN')}</dd>
                    <dt className="font-medium text-muted-foreground">Submission Date</dt>
                    <dd>{new Date(grant.utilizationReport.submissionDate).toLocaleDateString()}</dd>
                 </dl>
                 <div className="space-y-1 pt-2">
                     <p className="font-medium text-sm text-muted-foreground">Description</p>
                     <p className="text-sm whitespace-pre-wrap">{grant.utilizationReport.description}</p>
                 </div>
            </div>
        )}

        {grant.status === 'Completed' && (
            <div className="flex items-center gap-2 text-green-600 p-4 border border-green-200 bg-green-50 dark:bg-green-950/50 rounded-lg">
                <CheckCircle className="h-5 w-5" />
                <p className="font-semibold">This grant process has been completed.</p>
            </div>
        )}
      </CardContent>
    </Card>
  );
}
