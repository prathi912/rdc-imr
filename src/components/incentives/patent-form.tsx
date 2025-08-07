
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import type { User, IncentiveClaim } from '@/types';
import { uploadFileToServer } from '@/app/actions';
import { Loader2, AlertCircle } from 'lucide-react';

const patentSchema = z
  .object({
    patentTitle: z.string().min(3, 'Patent title is required.'),
    patentStatus: z.enum(['Filed', 'Published', 'Granted'], { required_error: 'Patent status is required.' }),
    patentApplicantType: z.enum(['Sole', 'Joint']).optional(),
    patentSpecificationType: z.enum(['Full', 'Provisional'], { required_error: 'Specification type is required.' }),
    patentApplicationNumber: z.string().min(3, 'Application number is required.'),
    patentTotalStudents: z.coerce.number().optional(),
    patentStudentNames: z.string().optional(),
    patentFiledInPuName: z.boolean().optional(),
    patentFiledFromIprCell: z.boolean().optional(),
    patentPermissionTaken: z.boolean().optional(),
    patentApprovalProof: z.any().optional(),
    patentForm1: z.any().refine((files) => files?.length > 0, 'Proof (Form 1) is required.'),
    patentGovtReceipt: z.any().refine((files) => files?.length > 0, 'Proof (Govt. Receipt) is required.'),
    patentSelfDeclaration: z.boolean().refine(val => val === true, { message: 'You must agree to the self declaration.' }),
  })
  .refine(data => data.patentFiledInPuName !== undefined, { message: 'This field is required.', path: ['patentFiledInPuName'] })
  .refine(data => data.patentFiledFromIprCell !== undefined, { message: 'This field is required.', path: ['patentFiledFromIprCell'] })
  .refine(data => !(data.patentFiledFromIprCell === false) || (data.patentPermissionTaken !== undefined), { message: 'This field is required.', path: ['patentPermissionTaken'] });

type PatentFormValues = z.infer<typeof patentSchema>;

const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};

export function PatentForm() {
  const { toast } = useToast();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false);
  const [orcidMissing, setOrcidMissing] = useState(false);
  
  const form = useForm<PatentFormValues>({
    resolver: zodResolver(patentSchema),
    defaultValues: {
      patentTitle: '',
      patentStatus: undefined,
      patentApplicantType: undefined,
      patentSpecificationType: undefined,
      patentApplicationNumber: '',
      patentTotalStudents: 0,
      patentStudentNames: '',
      patentFiledInPuName: false,
      patentFiledFromIprCell: false,
      patentPermissionTaken: false,
      patentApprovalProof: undefined,
      patentForm1: undefined,
      patentGovtReceipt: undefined,
      patentSelfDeclaration: false,
    },
  });

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      if (!parsedUser.bankDetails) {
        setBankDetailsMissing(true);
      }
      if (!parsedUser.orcidId) {
        setOrcidMissing(true);
      }
    }
  }, []);
  
  const patentFiledFromIprCell = form.watch('patentFiledFromIprCell');

  async function handleSave(status: 'Draft' | 'Pending') {
    if (!user || !user.faculty) return;
    if (status === 'Pending' && (bankDetailsMissing || orcidMissing)) {
        toast({
            variant: 'destructive',
            title: 'Profile Incomplete',
            description: 'Please add your bank details and ORCID iD in Settings before submitting a claim.',
        });
        return;
    }
    
    setIsSubmitting(true);
    try {
        const data = form.getValues();
        const claimId = doc(collection(db, 'incentiveClaims')).id;

        const uploadFileHelper = async (file: File | undefined, folderName: string): Promise<string | undefined> => {
            if (!file || !user) return undefined;
            const dataUrl = await fileToDataUrl(file);
            const path = `incentive-proofs/${user.uid}/${folderName}/${new Date().toISOString()}-${file.name}`;
            const result = await uploadFileToServer(dataUrl, path);
            if (!result.success || !result.url) {
                throw new Error(result.error || `File upload failed for ${folderName}`);
            }
            return result.url;
        };

        const patentApprovalProofUrl = await uploadFileHelper(data.patentApprovalProof?.[0], 'patent-approval');
        const patentForm1Url = await uploadFileHelper(data.patentForm1?.[0], 'patent-form1');
        const patentGovtReceiptUrl = await uploadFileHelper(data.patentGovtReceipt?.[0], 'patent-govt-receipt');

        const claimData: Omit<IncentiveClaim, 'id'> = {
            ...data,
            misId: user.misId,
            orcidId: user.orcidId,
            claimType: 'Patents',
            benefitMode: 'incentives',
            uid: user.uid,
            userName: user.name,
            userEmail: user.email,
            faculty: user.faculty,
            status,
            submissionDate: new Date().toISOString(),
            bankDetails: user.bankDetails,
        };

        if (patentApprovalProofUrl) claimData.patentApprovalProofUrl = patentApprovalProofUrl;
        if (patentForm1Url) claimData.patentForm1Url = patentForm1Url;
        if (patentGovtReceiptUrl) claimData.patentGovtReceiptUrl = patentGovtReceiptUrl;

        await setDoc(doc(db, 'incentiveClaims', claimId), claimData);

        if (status === 'Draft') {
          toast({ title: 'Draft Saved!', description: "You can continue editing from the 'Incentive Claim' page." });
          router.push(`/dashboard/incentive-claim/patent?claimId=${claimId}`);
        } else {
          toast({ title: 'Success', description: 'Your incentive claim for patent has been submitted.' });
          router.push('/dashboard/incentive-claim');
        }

    } catch (error: any) {
        console.error('Error submitting claim: ', error);
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to submit claim. Please try again.' });
    } finally {
        setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(() => handleSave('Pending'))}>
          <CardContent className="space-y-6 pt-6">
             {bankDetailsMissing && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Bank Details Required</AlertTitle>
                    <AlertDescription>
                        Please add your salary bank account details in your profile before you can submit a claim.
                        <Button asChild variant="link" className="p-1 h-auto"><Link href="/dashboard/settings">Go to Settings</Link></Button>
                    </AlertDescription>
                </Alert>
            )}
             {orcidMissing && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>ORCID iD Required</AlertTitle>
                    <AlertDescription>
                        An ORCID iD is mandatory for submitting incentive claims. Please add it to your profile.
                        <Button asChild variant="link" className="p-1 h-auto"><Link href="/dashboard/settings">Go to Settings</Link></Button>
                    </AlertDescription>
                </Alert>
            )}
            <div className="rounded-lg border p-4 space-y-4 animate-in fade-in-0">
                <h3 className="font-semibold text-sm -mb-2">PATENT DETAILS</h3>
                <Separator />
                <FormField name="patentTitle" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Title of the Patent</FormLabel><FormControl><Textarea placeholder="Enter the full title of your patent" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="patentSpecificationType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Specification Type</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Full" /></FormControl><FormLabel className="font-normal">Full</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Provisional" /></FormControl><FormLabel className="font-normal">Provisional</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                <FormField name="patentApplicationNumber" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Ref. No/Application Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="patentTotalStudents" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Total Number of Students</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="patentStudentNames" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Name of Students</FormLabel><FormControl><Textarea placeholder="Comma-separated list of student names" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="patentFiledInPuName" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Was the patent filed in the name of PU as an Applicant?</FormLabel><FormControl><RadioGroup onValueChange={(val) => field.onChange(val === 'true')} value={String(field.value)} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="true" /></FormControl><FormLabel className="font-normal">Yes</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="false" /></FormControl><FormLabel className="font-normal">No</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                <FormField name="patentFiledFromIprCell" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Was the patent filed from IPR Cell, PU?</FormLabel><FormControl><RadioGroup onValueChange={(val) => field.onChange(val === 'true')} value={String(field.value)} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="true" /></FormControl><FormLabel className="font-normal">Yes</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="false" /></FormControl><FormLabel className="font-normal">No</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                {patentFiledFromIprCell === false && (
                     <FormField name="patentPermissionTaken" control={form.control} render={({ field }) => ( <FormItem><FormLabel>If No, was permission from PU taken?</FormLabel><FormControl><RadioGroup onValueChange={(val) => field.onChange(val === 'true')} value={String(field.value)} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="true" /></FormControl><FormLabel className="font-normal">Yes</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="false" /></FormControl><FormLabel className="font-normal">No</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                )}
                <FormField name="patentStatus" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Status of Application</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Filed" /></FormControl><FormLabel className="font-normal">Filed</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Published" /></FormControl><FormLabel className="font-normal">Published</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Granted" /></FormControl><FormLabel className="font-normal">Granted</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                <FormField name="patentApprovalProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach Proof of Approval (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="patentForm1" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach Proof (Form 1) (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="patentGovtReceipt" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach Proof (Govt. Receipt) (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormMessage /></FormItem> )} />
                 <FormField control={form.control} name="patentSelfDeclaration" render={({ field }) => ( <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Self Declaration</FormLabel><FormMessage /><p className="text-xs text-muted-foreground">I hereby confirm that I have not applied/claimed for any incentive for the same application/publication earlier.</p></div></FormItem> )} />
            </div>

          </CardContent>
          <CardFooter className="flex justify-between">
             <Button
              type="button"
              variant="outline"
              onClick={() => handleSave('Draft')}
              disabled={isSubmitting || bankDetailsMissing || orcidMissing}
            >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save as Draft
            </Button>
            <Button type="submit" disabled={isSubmitting || bankDetailsMissing || orcidMissing}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Submitting...' : 'Submit Claim'}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
