'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { collection, addDoc } from 'firebase/firestore';
import type { User, IncentiveClaim } from '@/types';
import { uploadFileToServer } from '@/app/actions';
import { Loader2, AlertCircle } from 'lucide-react';

const apcSchema = z.object({
  apcTypeOfArticle: z.string({ required_error: 'Please select an article type.' }),
  apcOtherArticleType: z.string().optional(),
  apcPaperTitle: z.string().min(5, 'Paper title is required.'),
  apcAuthors: z.string().min(3, 'Author names are required.'),
  apcTotalStudentAuthors: z.coerce.number().optional(),
  apcStudentNames: z.string().optional(),
  apcJournalDetails: z.string().min(5, 'Journal details are required.'),
  apcQRating: z.string().optional(),
  apcNationalInternational: z.enum(['National', 'International'], { required_error: 'This field is required.' }),
  apcApcWaiverRequested: z.boolean().optional(),
  apcApcWaiverProof: z.any().optional(),
  apcJournalWebsite: z.string().url('Please enter a valid URL.'),
  apcIssnNo: z.string().min(5, 'ISSN is required.'),
  apcIndexingStatus: z.array(z.string()).refine(value => value.some(item => item), { message: "You have to select at least one indexing status." }),
  apcOtherIndexingStatus: z.string().optional(),
  apcSciImpactFactor: z.coerce.number().optional(),
  apcPublicationProof: z.any().refine((files) => files?.length > 0, 'Proof of publication is required.'),
  apcInvoiceProof: z.any().refine((files) => files?.length > 0, 'Proof of payment/invoice is required.'),
  apcPuNameInPublication: z.boolean().optional(),
  apcAmountClaimed: z.coerce.number().positive('Claimed amount must be positive.'),
  apcTotalAmount: z.coerce.number().positive('Total amount must be positive.'),
  apcSelfDeclaration: z.boolean().refine(val => val === true, { message: 'You must agree to the self-declaration.' }),
}).refine(data => data.apcTypeOfArticle !== 'Other' || (!!data.apcOtherArticleType && data.apcOtherArticleType.length > 0), {
  message: 'Please specify the article type.',
  path: ['apcOtherArticleType'],
}).refine(data => !data.apcIndexingStatus.includes('Other') || (!!data.apcOtherIndexingStatus && data.apcOtherIndexingStatus.length > 0), {
  message: 'Please specify the other indexing status.',
  path: ['apcOtherIndexingStatus'],
}).refine(data => !data.apcApcWaiverRequested || (!!data.apcApcWaiverProof && data.apcApcWaiverProof.length > 0), {
  message: 'Proof of waiver request is required.',
  path: ['apcApcWaiverProof'],
});

type ApcFormValues = z.infer<typeof apcSchema>;

const articleTypes = ['Research Paper Publication', 'Review Article', 'Letter to Editor', 'Other'];
const indexingStatuses = ['Scopus', 'Web of science', 'Pubmed', 'UGC - CARE list', 'Other'];

const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};

export function ApcForm() {
  const { toast } = useToast();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false);
  
  const form = useForm<ApcFormValues>({
    resolver: zodResolver(apcSchema),
    defaultValues: {
      apcTypeOfArticle: '',
      apcOtherArticleType: '',
      apcPaperTitle: '',
      apcAuthors: '',
      apcJournalDetails: '',
      apcJournalWebsite: '',
      apcIssnNo: '',
      apcPuNameInPublication: false,
      apcIndexingStatus: [],
      apcSelfDeclaration: false,
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
    }
  }, []);

  const watchArticleType = form.watch('apcTypeOfArticle');
  const watchWaiverRequested = form.watch('apcApcWaiverRequested');
  const watchIndexingStatus = form.watch('apcIndexingStatus');

  async function onSubmit(data: ApcFormValues) {
    if (!user || !user.faculty || !user.bankDetails) {
      toast({ variant: 'destructive', title: 'Bank Details Missing', description: 'You must add your bank details in Settings to submit a claim.' });
      return;
    }
    setIsSubmitting(true);
    try {
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

      const [apcApcWaiverProofUrl, apcPublicationProofUrl, apcInvoiceProofUrl] = await Promise.all([
        uploadFileHelper(data.apcApcWaiverProof?.[0], 'apc-waiver-proof'),
        uploadFileHelper(data.apcPublicationProof?.[0], 'apc-publication-proof'),
        uploadFileHelper(data.apcInvoiceProof?.[0], 'apc-invoice-proof'),
      ]);

      const claimData: Omit<IncentiveClaim, 'id'> = {
        ...data,
        orcidId: user.orcidId,
        claimType: 'Seed Money for APC',
        benefitMode: 'reimbursement',
        uid: user.uid,
        userName: user.name,
        userEmail: user.email,
        faculty: user.faculty,
        status: 'Pending',
        submissionDate: new Date().toISOString(),
        bankDetails: user.bankDetails,
      };

      if (apcApcWaiverProofUrl) claimData.apcApcWaiverProofUrl = apcApcWaiverProofUrl;
      if (apcPublicationProofUrl) claimData.apcPublicationProofUrl = apcPublicationProofUrl;
      if (apcInvoiceProofUrl) claimData.apcInvoiceProofUrl = apcInvoiceProofUrl;

      await addDoc(collection(db, 'incentiveClaims'), claimData);
      toast({ title: 'Success', description: 'Your incentive claim for APC has been submitted.' });
      router.push('/dashboard/incentive-claim');
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
        <form onSubmit={form.handleSubmit(onSubmit)}>
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

            <div className="rounded-lg border p-4 space-y-4 animate-in fade-in-0">
                <h3 className="font-semibold text-sm -mb-2">ARTICLE &amp; JOURNAL DETAILS</h3>
                <Separator />
                <FormField control={form.control} name="apcTypeOfArticle" render={({ field }) => ( <FormItem><FormLabel>Type of Article</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-6">{articleTypes.map(type => (<FormItem key={type} className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value={type} /></FormControl><FormLabel className="font-normal">{type}</FormLabel></FormItem>))}</RadioGroup></FormControl><FormMessage /></FormItem> )}/>
                {watchArticleType === 'Other' && <FormField name="apcOtherArticleType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Please specify other article type</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />}
                <FormField name="apcPaperTitle" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Title of the Paper</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="apcAuthors" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Name of Author(s)</FormLabel><FormControl><Textarea placeholder="Comma-separated list of authors" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="apcTotalStudentAuthors" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Total Number of Student authors</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="apcStudentNames" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Names of Student Authors</FormLabel><FormControl><Textarea placeholder="Comma-separated list of student names" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="apcJournalDetails" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Details of the Journal</FormLabel><FormControl><Textarea placeholder="Name, Vol, Page No., Year, DOI" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="apcQRating" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Q Rating of the Journal</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="apcNationalInternational" control={form.control} render={({ field }) => ( <FormItem><FormLabel>National / International</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="National" /></FormControl><FormLabel className="font-normal">National</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="International" /></FormControl><FormLabel className="font-normal">International</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                <FormField name="apcJournalWebsite" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Journal Website</FormLabel><FormControl><Input type="url" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="apcIssnNo" control={form.control} render={({ field }) => ( <FormItem><FormLabel>ISSN No.</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="apcIndexingStatus" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Indexing/Listing status of the Journal</FormLabel>{indexingStatuses.map(item => (<FormField key={item} control={form.control} name="apcIndexingStatus" render={({ field }) => ( <FormItem key={item} className="flex flex-row items-start space-x-3 space-y-0"><FormControl><Checkbox checked={field.value?.includes(item)} onCheckedChange={(checked) => { return checked ? field.onChange([...(field.value || []), item]) : field.onChange(field.value?.filter(value => value !== item)); }} /></FormControl><FormLabel className="font-normal">{item}</FormLabel></FormItem> )} />))}<FormMessage /></FormItem> )} />
                {watchIndexingStatus?.includes('Other') && <FormField name="apcOtherIndexingStatus" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Please specify other indexing status</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />}
                <FormField name="apcSciImpactFactor" control={form.control} render={({ field }) => ( <FormItem><FormLabel>SCI Impact Factor</FormLabel><FormControl><Input type="number" step="any" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="apcPuNameInPublication" control={form.control} render={({ field }) => ( <FormItem><div className="flex items-center justify-between"><FormLabel>Is "PU" name present in the publication?</FormLabel><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></div><FormMessage /></FormItem> )} />
                <FormField name="apcPublicationProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Proof of Publication Attached</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} accept="application/pdf" /></FormControl><FormMessage /></FormItem> )} />
            </div>

            <div className="rounded-lg border p-4 space-y-4 animate-in fade-in-0">
                <h3 className="font-semibold text-sm -mb-2">FINANCIAL &amp; DECLARATION DETAILS</h3>
                <Separator />
                <FormField name="apcApcWaiverRequested" control={form.control} render={({ field }) => ( <FormItem><div className="flex items-center justify-between"><FormLabel>Whether APC waiver was requested</FormLabel><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></div><FormMessage /></FormItem> )} />
                {watchWaiverRequested && <FormField name="apcApcWaiverProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>If yes, give proof</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} accept="application/pdf" /></FormControl><FormMessage /></FormItem> )} />}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField name="apcAmountClaimed" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Amount claimed (INR)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                  <FormField name="apcTotalAmount" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Total amount of APC (INR)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                </div>
                <FormField name="apcInvoiceProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attachment Proof (Invoice, Receipt, Payment Proof &amp; Abstract)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} accept="application/pdf" /></FormControl><FormMessage /></FormItem> )} />
                 <FormField control={form.control} name="apcSelfDeclaration" render={({ field }) => ( <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Self Declaration</FormLabel><FormMessage /><p className="text-xs text-muted-foreground">I hereby confirm that I have not applied/claimed for any incentive for the same application/publication earlier.</p></div></FormItem> )} />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmitting || bankDetailsMissing}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Submitting...' : 'Submit Claim'}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
