
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { Project, User, GrantDetails, Transaction, BankDetails } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { doc, updateDoc } from 'firebase/firestore';
import { uploadFileToServer } from '@/app/actions';
import { useState, useEffect } from 'react';
import { DollarSign, Banknote, FileText, CheckCircle, PlusCircle, AlertCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import Link from 'next/link';

interface GrantManagementProps {
  project: Project;
  user: User;
  onUpdate: (updatedProject: Project) => void;
}

const transactionSchema = z.object({
    dateOfTransaction: z.string().min(1, 'Transaction date is required.'),
    amount: z.coerce.number().positive("Amount must be a positive number."),
    vendorName: z.string().min(2, "Vendor name is required."),
    isGstRegistered: z.boolean().default(false),
    gstNumber: z.string().optional(),
    description: z.string().min(10, "Description is required."),
    invoice: z.any().optional(), // For file input
}).refine(data => {
    if (data.isGstRegistered) {
        return !!data.gstNumber && data.gstNumber.length > 0;
    }
    return true;
}, {
    message: "GST number is required for registered vendors.",
    path: ["gstNumber"],
});

const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};


export function GrantManagement({ project, user, onUpdate }: GrantManagementProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const isAdmin = user.role === 'admin';
  const isPI = user.uid === project.pi_uid;

  const grant = project.grant;

  useEffect(() => {
    const syncBankDetails = async () => {
      // Condition: This user is the PI, the grant status is pending, but the user *does* have bank details.
      if (isPI && grant?.status === 'Pending Bank Details' && user.bankDetails) {
        try {
          const projectRef = doc(db, 'projects', project.id);
          const grantBankDetails: BankDetails = {
            accountHolderName: user.bankDetails.beneficiaryName,
            accountNumber: user.bankDetails.accountNumber,
            bankName: user.bankDetails.bankName,
            ifscCode: user.bankDetails.ifscCode,
            branchName: user.bankDetails.branchName,
            city: user.bankDetails.city,
          };
          
          const updatedGrant: GrantDetails = {
            ...grant,
            status: 'Bank Details Submitted',
            bankDetails: grantBankDetails,
          };

          await updateDoc(projectRef, { grant: updatedGrant });
          onUpdate({ ...project, grant: updatedGrant }); // Propagate change up to parent component
          toast({ title: 'Success', description: 'Your bank details have been synced with this grant.' });
        } catch (error) {
          console.error("Error syncing bank details:", error);
          toast({ variant: 'destructive', title: 'Error', description: 'Could not sync your bank details with this grant.' });
        }
      }
    };
    
    // Only run if we have the necessary data
    if (grant && user) {
        syncBankDetails();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, user, onUpdate]);

  const transactionForm = useForm<z.infer<typeof transactionSchema>>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      dateOfTransaction: '',
      amount: 0,
      vendorName: '',
      isGstRegistered: false,
      gstNumber: '',
      description: '',
    },
  });
  
  const handleAddTransaction = async (values: z.infer<typeof transactionSchema>) => {
    if (!project.grant) return;
    setIsSubmitting(true);
    try {
        const projectRef = doc(db, 'projects', project.id);
        
        let invoiceUrl: string | undefined;
        const invoiceFile = values.invoice?.[0];
        if (invoiceFile) {
            const dataUrl = await fileToDataUrl(invoiceFile);
            const path = `invoices/${project.id}/${new Date().toISOString()}-${invoiceFile.name}`;
            const result = await uploadFileToServer(dataUrl, path);
            if (!result.success || !result.url) {
              throw new Error(result.error || "Invoice upload failed");
            }
            invoiceUrl = result.url;
        }

        const newTransaction: Transaction = {
            id: new Date().toISOString() + Math.random(),
            dateOfTransaction: values.dateOfTransaction,
            amount: values.amount,
            vendorName: values.vendorName,
            isGstRegistered: values.isGstRegistered,
            gstNumber: values.gstNumber,
            description: values.description,
            invoiceUrl: invoiceUrl,
        };

        const updatedTransactions = [...(project.grant.transactions || []), newTransaction];
        const updatedGrant = { ...project.grant, transactions: updatedTransactions };

        await updateDoc(projectRef, { grant: updatedGrant });
        onUpdate({ ...project, grant: updatedGrant });
        toast({ title: 'Success', description: 'Transaction added successfully.' });
        transactionForm.reset();
        setIsTransactionDialogOpen(false);
    } catch (error) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to add transaction.' });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const handleFinalizeReport = async () => {
    if (!project.grant) return;
    setIsSubmitting(true);
    try {
        const projectRef = doc(db, 'projects', project.id);
        const updatedGrant: GrantDetails = {
            ...project.grant,
            status: 'Utilization Submitted',
            utilizationSubmissionDate: new Date().toISOString(),
        };
        await updateDoc(projectRef, { grant: updatedGrant });
        onUpdate({ ...project, grant: updatedGrant });
        toast({ title: 'Success', description: 'Utilization report finalized and submitted.'});
    } catch (error) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to finalize report.' });
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

  if (!grant) return null;
  
  const totalUtilized = grant.transactions?.reduce((acc, curr) => acc + curr.amount, 0) || 0;

  return (
    <Card className="mt-8">
      <CardHeader>
        <div className="flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            <CardTitle>Grant Management</CardTitle>
        </div>
        <CardDescription>
          Grant of ₹{grant.amount.toLocaleString('en-IN')} awarded. Current status: <span className="font-semibold">{grant.status}</span>
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

        {isPI && grant.status === 'Pending Bank Details' && (
           <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Action Required</AlertTitle>
            <AlertDescription>
                Grant has been awarded, but your bank details are missing. Please add your salary bank account details in your profile to receive the funds.
                <Button asChild variant="link" className="p-1 h-auto ml-1"><Link href="/dashboard/settings">Go to Settings</Link></Button>
            </AlertDescription>
          </Alert>
        )}
        
        {grant.bankDetails && (
            <div className="p-4 border rounded-lg space-y-2">
                <div className="flex items-center gap-2 mb-2">
                    <Banknote className="h-5 w-5 text-muted-foreground"/>
                    <h4 className="font-semibold">Bank Account Details</h4>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {grant.sanctionNumber && (
                        <>
                          <dt className="font-medium text-muted-foreground">Sanction Number</dt>
                          <dd className="font-semibold">{grant.sanctionNumber}</dd>
                        </>
                    )}
                    <dt className="font-medium text-muted-foreground">Account Holder</dt>
                    <dd>{grant.bankDetails.accountHolderName}</dd>
                    <dt className="font-medium text-muted-foreground">Account Number</dt>
                    <dd>{grant.bankDetails.accountNumber}</dd>
                    <dt className="font-medium text-muted-foreground">Bank Name</dt>
                    <dd>{grant.bankDetails.bankName}</dd>
                    <dt className="font-medium text-muted-foreground">Branch</dt>
                    <dd>{grant.bankDetails.branchName}</dd>
                    <dt className="font-medium text-muted-foreground">City</dt>
                    <dd>{grant.bankDetails.city}</dd>
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

        {(grant.status === 'Disbursed' || grant.status === 'Utilization Submitted' || grant.status === 'Completed') && (
            <div className="p-4 border rounded-lg space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <h4 className="font-semibold">Fund Utilization Report</h4>
                    </div>
                    {isPI && grant.status === 'Disbursed' && (
                        <Dialog open={isTransactionDialogOpen} onOpenChange={setIsTransactionDialogOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm"><PlusCircle className="mr-2 h-4 w-4" /> Add Transaction</Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-2xl">
                                <DialogHeader>
                                    <DialogTitle>Add New Transaction</DialogTitle>
                                    <DialogDescription>Fill in the details for the expense.</DialogDescription>
                                </DialogHeader>
                                <Form {...transactionForm}>
                                    <form id="transaction-form" onSubmit={transactionForm.handleSubmit(handleAddTransaction)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
                                        <FormField name="dateOfTransaction" control={transactionForm.control} render={({ field }) => ( <FormItem><FormLabel>Date of Transaction</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                        <FormField name="amount" control={transactionForm.control} render={({ field }) => ( <FormItem><FormLabel>Amount (₹)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                        <FormField name="vendorName" control={transactionForm.control} render={({ field }) => ( <FormItem><FormLabel>Vendor Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                        <FormField name="description" control={transactionForm.control} render={({ field }) => ( <FormItem><FormLabel>Description of Service</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem> )} />
                                        <FormField name="isGstRegistered" control={transactionForm.control} render={({ field }) => ( <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Is vendor GST registered?</FormLabel></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem> )} />
                                        {transactionForm.watch('isGstRegistered') && (
                                            <FormField name="gstNumber" control={transactionForm.control} render={({ field }) => ( <FormItem><FormLabel>GST Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                        )}
                                        <FormField name="invoice" control={transactionForm.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Upload Invoice</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormMessage /></FormItem> )} />
                                    </form>
                                </Form>
                                <DialogFooter>
                                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                                    <Button type="submit" form="transaction-form" disabled={isSubmitting}>{isSubmitting ? 'Adding...' : 'Add Transaction'}</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
                 <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="font-medium text-muted-foreground">Total Sanctioned: <span className="font-bold text-foreground">₹{grant.amount.toLocaleString('en-IN')}</span></div>
                    <div className="font-medium text-muted-foreground">Total Utilized: <span className="font-bold text-foreground">₹{totalUtilized.toLocaleString('en-IN')}</span></div>
                </div>
                 {grant.transactions && grant.transactions.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Vendor</TableHead>
                                <TableHead className="text-right">Amount (₹)</TableHead>
                                <TableHead>Invoice</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {grant.transactions.map(t => (
                                <TableRow key={t.id}>
                                    <TableCell>{new Date(t.dateOfTransaction).toLocaleDateString()}</TableCell>
                                    <TableCell>{t.vendorName}</TableCell>
                                    <TableCell className="text-right">{t.amount.toLocaleString('en-IN')}</TableCell>
                                    <TableCell>{t.invoiceUrl ? <a href={t.invoiceUrl} target="_blank" rel="noopener noreferrer" className="underline">View</a> : 'N/A'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                 ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No transactions have been added yet.</p>
                 )}
                 {isPI && grant.status === 'Disbursed' && grant.transactions && grant.transactions.length > 0 && (
                     <div className="flex justify-end pt-4">
                         <Button onClick={handleFinalizeReport} disabled={isSubmitting}>{isSubmitting ? "Submitting..." : "Finalize and Submit Report"}</Button>
                     </div>
                 )}
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
