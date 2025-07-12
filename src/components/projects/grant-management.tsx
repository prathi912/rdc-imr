
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { Project, User, GrantPhase, Transaction, GrantDetails } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { doc, updateDoc } from 'firebase/firestore';
import { uploadFileToServer } from '@/app/actions';
import { useState } from 'react';
import { DollarSign, Banknote, FileText, CheckCircle, PlusCircle, AlertCircle, BadgeCent, ChevronDown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
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
import { Badge } from '../ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';

interface GrantManagementProps {
  project: Project;
  user: User;
  onUpdate: (updatedProject: Project) => void;
}

const addPhaseSchema = z.object({
    name: z.string().min(3, 'Phase name is required.'),
    amount: z.coerce.number().positive("Amount must be a positive number."),
});

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
  const [isAddPhaseOpen, setIsAddPhaseOpen] = useState(false);
  const [isTransactionOpen, setIsTransactionOpen] = useState(false);
  const [currentPhaseId, setCurrentPhaseId] = useState<string | null>(null);

  const isAdmin = user.role === 'admin' || user.role === 'Super-admin' || user.role === 'CRO';
  const isPI = user.uid === project.pi_uid || user.email === project.pi_email;
  const grant = project.grant;

  const phaseForm = useForm<z.infer<typeof addPhaseSchema>>({
    resolver: zodResolver(addPhaseSchema),
    defaultValues: { name: '', amount: 0 },
  });

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

  const handleAddPhase = async (values: z.infer<typeof addPhaseSchema>) => {
    if (!grant) return;
    setIsSubmitting(true);
    try {
        const projectRef = doc(db, 'projects', project.id);
        const newPhase: GrantPhase = {
            id: new Date().toISOString(),
            name: values.name,
            amount: values.amount,
            status: 'Pending Disbursement',
            transactions: [],
        };
        const updatedPhases = [...(grant.phases || []), newPhase];
        const updatedGrant: GrantDetails = {
            ...grant,
            phases: updatedPhases,
            totalAmount: updatedPhases.reduce((acc, p) => acc + p.amount, 0),
        };
        await updateDoc(projectRef, { grant: updatedGrant });
        onUpdate({ ...project, grant: updatedGrant });
        toast({ title: 'Success', description: 'New grant phase added.' });
        phaseForm.reset();
        setIsAddPhaseOpen(false);
    } catch (error) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to add new phase.' });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const handleAddTransaction = async (values: z.infer<typeof transactionSchema>) => {
    if (!grant || !currentPhaseId) return;
    setIsSubmitting(true);
    try {
        const projectRef = doc(db, 'projects', project.id);
        let invoiceUrl: string | undefined;
        const invoiceFile = values.invoice?.[0];
        if (invoiceFile) {
            const dataUrl = await fileToDataUrl(invoiceFile);
            const path = `invoices/${project.id}/${currentPhaseId}/${new Date().toISOString()}-${invoiceFile.name}`;
            const result = await uploadFileToServer(dataUrl, path);
            if (!result.success || !result.url) { throw new Error(result.error || "Invoice upload failed"); }
            invoiceUrl = result.url;
        }

        const newTransaction: Transaction = {
            id: new Date().toISOString() + Math.random(),
            phaseId: currentPhaseId,
            dateOfTransaction: values.dateOfTransaction,
            amount: values.amount,
            vendorName: values.vendorName,
            isGstRegistered: values.isGstRegistered,
            gstNumber: values.gstNumber,
            description: values.description,
            invoiceUrl: invoiceUrl,
        };

        const updatedPhases = (grant.phases || []).map(p => {
            if (p.id === currentPhaseId) {
                return { ...p, transactions: [...(p.transactions || []), newTransaction] };
            }
            return p;
        });

        await updateDoc(projectRef, { 'grant.phases': updatedPhases });
        onUpdate({ ...project, grant: { ...grant, phases: updatedPhases } });
        toast({ title: 'Success', description: 'Transaction added successfully.' });
        transactionForm.reset();
        setIsTransactionOpen(false);
        setCurrentPhaseId(null);
    } catch (error) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to add transaction.' });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const handlePhaseStatusUpdate = async (phaseId: string, newStatus: GrantPhase['status']) => {
    if (!grant) return;
    setIsSubmitting(true);
    try {
        const projectRef = doc(db, 'projects', project.id);
        const updatedPhases = (grant.phases || []).map(p => {
            if (p.id === phaseId) {
                const updatedPhase: GrantPhase = { ...p, status: newStatus };
                if (newStatus === 'Disbursed' && !p.disbursementDate) {
                    updatedPhase.disbursementDate = new Date().toISOString();
                }
                return updatedPhase;
            }
            return p;
        });
        await updateDoc(projectRef, { 'grant.phases': updatedPhases });
        onUpdate({ ...project, grant: { ...grant, phases: updatedPhases }});
        toast({ title: 'Success', description: `Phase status updated to ${newStatus}.`});
    } catch (error) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to update phase status.' });
    } finally {
        setIsSubmitting(false);
    }
  };

  if (!grant) return null;

  return (
    <Card className="mt-8">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className='flex items-center gap-2'>
                <DollarSign className="h-6 w-6" />
                <CardTitle>Grant Management</CardTitle>
            </div>
            {isAdmin && (
                <Dialog open={isAddPhaseOpen} onOpenChange={setIsAddPhaseOpen}>
                    <DialogTrigger asChild><Button><PlusCircle className="mr-2 h-4 w-4"/>Add Grant Phase</Button></DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add New Grant Phase</DialogTitle>
                            <DialogDescription>Define a new disbursement phase for this project.</DialogDescription>
                        </DialogHeader>
                        <Form {...phaseForm}>
                            <form id="add-phase-form" onSubmit={phaseForm.handleSubmit(handleAddPhase)} className="space-y-4 py-4">
                                <FormField name="name" control={phaseForm.control} render={({field}) => (<FormItem><FormLabel>Phase Name</FormLabel><FormControl><Input {...field} placeholder="e.g., Phase 2 - Consumables"/></FormControl><FormMessage/></FormItem>)}/>
                                <FormField name="amount" control={phaseForm.control} render={({field}) => (<FormItem><FormLabel>Amount (₹)</FormLabel><FormControl><Input type="number" {...field}/></FormControl><FormMessage/></FormItem>)}/>
                            </form>
                        </Form>
                         <DialogFooter>
                            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                            <Button type="submit" form="add-phase-form" disabled={isSubmitting}>{isSubmitting ? 'Adding...' : 'Add Phase'}</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
        <CardDescription className='mt-2'>
            Total grant amount: <span className='font-bold text-foreground'>₹{(grant.totalAmount || 0).toLocaleString('en-IN')}</span> | Sanction No: <span className='font-bold text-foreground'>{grant.sanctionNumber || 'N/A'}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {(grant.phases || []).map((phase) => {
            const totalUtilized = phase.transactions?.reduce((acc, t) => acc + t.amount, 0) || 0;
            return (
                <Card key={phase.id} className='bg-muted/30'>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                           <div>
                            <CardTitle className='text-lg'>{phase.name}</CardTitle>
                            <CardDescription className='mt-1'>
                                Amount: <span className='font-semibold text-foreground'>₹{phase.amount.toLocaleString('en-IN')}</span>
                            </CardDescription>
                           </div>
                           <div className='flex items-center gap-2'>
                            <Badge variant={phase.status === 'Disbursed' ? 'default' : 'secondary'}>{phase.status}</Badge>
                            {isAdmin && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button variant="outline" size="sm" disabled={isSubmitting}>Change Status <ChevronDown className="ml-2 h-4 w-4"/></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        <DropdownMenuItem onClick={() => handlePhaseStatusUpdate(phase.id, 'Pending Disbursement')} disabled={phase.status === 'Pending Disbursement'}>Pending Disbursement</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handlePhaseStatusUpdate(phase.id, 'Disbursed')} disabled={phase.status === 'Disbursed'}>Disbursed</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handlePhaseStatusUpdate(phase.id, 'Completed')} disabled={phase.status === 'Completed'}>Completed</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                           </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {phase.status === 'Disbursed' || phase.status === 'Completed' ? (
                            <div className='space-y-4'>
                                <div className='flex justify-between items-center'>
                                     <p className='text-sm font-medium'>Utilization for this phase: <span className='font-bold text-primary'>₹{totalUtilized.toLocaleString('en-IN')}</span></p>
                                    {isPI && phase.status === 'Disbursed' && (
                                        <Button size="sm" variant="outline" onClick={() => { setCurrentPhaseId(phase.id); setIsTransactionOpen(true); }}><PlusCircle className="mr-2 h-4 w-4"/>Add Expense</Button>
                                    )}
                                </div>
                                 {(phase.transactions?.length ?? 0) > 0 ? (
                                    <Table>
                                        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Vendor</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount (₹)</TableHead><TableHead>Invoice</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {phase.transactions?.map(t => (
                                                <TableRow key={t.id}>
                                                    <TableCell>{new Date(t.dateOfTransaction).toLocaleDateString()}</TableCell>
                                                    <TableCell>{t.vendorName}</TableCell>
                                                    <TableCell className='max-w-xs truncate'>{t.description}</TableCell>
                                                    <TableCell className="text-right">{t.amount.toLocaleString('en-IN')}</TableCell>
                                                    <TableCell>{t.invoiceUrl ? <a href={t.invoiceUrl} target="_blank" rel="noopener noreferrer" className="underline">View</a> : 'N/A'}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                 ) : (
                                    <p className='text-center text-sm text-muted-foreground py-4'>No expenses logged for this phase yet.</p>
                                 )}
                            </div>
                        ) : (
                            <p className='text-center text-sm text-muted-foreground py-4'>This phase is pending disbursement. Expenses can be logged once disbursed.</p>
                        )}
                    </CardContent>
                </Card>
            )
        })}
      </CardContent>

      <Dialog open={isTransactionOpen} onOpenChange={setIsTransactionOpen}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Add New Expense</DialogTitle>
                    <DialogDescription>Fill in the details for the expense for phase: {(grant.phases || []).find(p => p.id === currentPhaseId)?.name}.</DialogDescription>
                </DialogHeader>
                <Form {...transactionForm}>
                    <form id="transaction-form" onSubmit={transactionForm.handleSubmit(handleAddTransaction)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
                        <FormField name="dateOfTransaction" control={transactionForm.control} render={({ field }) => ( <FormItem><FormLabel>Date of Transaction</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField name="amount" control={transactionForm.control} render={({ field }) => ( <FormItem><FormLabel>Amount (₹)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField name="vendorName" control={transactionForm.control} render={({ field }) => ( <FormItem><FormLabel>Vendor Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField name="description" control={transactionForm.control} render={({ field }) => ( <FormItem><FormLabel>Description of Service/Purchase</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField name="isGstRegistered" control={transactionForm.control} render={({ field }) => ( <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Is vendor GST registered?</FormLabel></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem> )} />
                        {transactionForm.watch('isGstRegistered') && (
                            <FormField name="gstNumber" control={transactionForm.control} render={({ field }) => ( <FormItem><FormLabel>GST Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                        )}
                        <FormField name="invoice" control={transactionForm.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Upload Invoice</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormMessage /></FormItem> )} />
                    </form>
                </Form>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline" onClick={() => setCurrentPhaseId(null)}>Cancel</Button></DialogClose>
                    <Button type="submit" form="transaction-form" disabled={isSubmitting}>{isSubmitting ? 'Adding...' : 'Add Transaction'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </Card>
  );
}
