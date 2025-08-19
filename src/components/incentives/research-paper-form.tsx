
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import type { User, IncentiveClaim } from '@/types';
import { fetchScopusDataByUrl, getJournalWebsite, uploadFileToServer, fetchWosDataByUrl } from '@/app/actions';
import { Loader2, AlertCircle, Bot } from 'lucide-react';

const SPECIAL_POLICY_FACULTIES = [
    "Faculty of Applied Sciences",
    "Faculty of Medicine",
    "Faculty of Homoeopathy",
    "Faculty of Ayurveda",
    "Faculty of Nursing",
    "Faculty of Pharmacy",
    "Faculty of Physiotherapy",
    "Faculty of Public Health",
    "Faculty of Engineering & Technology"
];

const researchPaperSchema = z
  .object({
    paperTitle: z.string().min(5, 'Paper title is required.'),
    relevantLink: z.string().url('Please enter a valid URL.'),
    journalName: z.string().min(3, 'Journal name is required.'),
    journalWebsite: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
    publicationType: z.string({ required_error: 'Please select a publication type.' }),
    indexType: z.enum(['wos', 'scopus', 'both', 'esci'], { required_error: 'Please select an index type.' }),
    journalClassification: z.enum(['Q1', 'Q2', 'Q3', 'Q4']).optional(),
    wosType: z.enum(['SCIE', 'SSCI', 'A&HCI']).optional(),
    impactFactor: z.coerce.number().optional(),
    publicationPhase: z.string({ required_error: 'Please select a publication phase.' }),
    totalAuthors: z.string({ required_error: 'Please select the total number of authors.' }),
    totalInternalAuthors: z.string().optional(),
    totalInternalCoAuthors: z.string().optional(),
    authorType: z.string({ required_error: 'Please select your author type.' }),
    benefitMode: z.string().default('incentives'),
    selfDeclaration: z.boolean().refine(val => val === true, { message: 'You must agree to the self-declaration.' }),
    publicationProof: z.any().refine((files) => files?.length > 0, 'Proof of publication is required.'),
  })
  .refine((data) => {
      if (data.indexType === 'wos' || data.indexType === 'both') {
        return !!data.wosType;
      }
      return true;
  }, { message: 'For WoS or Both, you must select a WoS Type.', path: ['wosType'] });

type ResearchPaperFormValues = z.infer<typeof researchPaperSchema>;

const authorCountOptions = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10+'];
const authorTypeOptions = [
  'First Author',
  'Corresponding Author',
  'First & Corresponding Author',
  'Co-Author',
];
const publicationPhaseOptions = [
    'Published online first with DOI number',
    'Published with vol and page number',
];

const wosTypeOptions = [
    { value: 'SCIE', label: 'SCIE' },
    { value: 'SSCI', label: 'SSCI' },
    { value: 'A&HCI', label: 'A&HCI' },
];

const indexTypeOptions = [
    { value: 'wos', label: 'WoS' },
    { value: 'scopus', label: 'Scopus' },
    { value: 'both', label: 'Both' },
    { value: 'esci', label: 'ESCI' },
];

const journalClassificationOptions = [
    { value: 'Q1', label: 'Q1' },
    { value: 'Q2', label: 'Q2' },
    { value: 'Q3', label: 'Q3' },
    { value: 'Q4', label: 'Q4' },
];

const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};

export function ResearchPaperForm() {
  const { toast } = useToast();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetchingScopus, setIsFetchingScopus] = useState(false);
  const [isFetchingWos, setIsFetchingWos] = useState(false);
  const [isFindingWebsite, setIsFindingWebsite] = useState(false);
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false);
  const [orcidOrMisIdMissing, setOrcidOrMisIdMissing] = useState(false);
  
  const form = useForm<ResearchPaperFormValues>({
    resolver: zodResolver(researchPaperSchema),
    defaultValues: {
      benefitMode: 'incentives',
      publicationType: 'Referred paper in journal listed by WOS/Scopus',
      selfDeclaration: false,
    },
  });

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      setBankDetailsMissing(!parsedUser.bankDetails);
      setOrcidOrMisIdMissing(!parsedUser.orcidId || !parsedUser.misId);
    }
  }, []);

  const indexType = form.watch('indexType');
  const relevantLink = form.watch('relevantLink');
  const journalName = form.watch('journalName');

  const isSpecialFaculty = useMemo(() => 
    user?.faculty ? SPECIAL_POLICY_FACULTIES.includes(user.faculty) : false,
  [user?.faculty]);

  const availableIndexTypes = useMemo(() =>
    isSpecialFaculty 
        ? indexTypeOptions.filter(o => o.value !== 'esci') 
        : indexTypeOptions,
  [isSpecialFaculty]);

  const availableClassifications = useMemo(() =>
    (isSpecialFaculty && (indexType === 'wos' || indexType === 'both'))
        ? journalClassificationOptions.filter(o => o.value === 'Q1' || o.value === 'Q2')
        : journalClassificationOptions,
  [isSpecialFaculty, indexType]);
  
  useEffect(() => {
    const currentIndexType = form.getValues('indexType');
    if (currentIndexType && !availableIndexTypes.find(o => o.value === currentIndexType)) {
        form.setValue('indexType', undefined, { shouldValidate: true });
    }
  }, [availableIndexTypes, form]);

  useEffect(() => {
    const currentClassification = form.getValues('journalClassification');
    if (currentClassification && !availableClassifications.find(o => o.value === currentClassification)) {
        form.setValue('journalClassification', undefined, { shouldValidate: true });
    }
  }, [availableClassifications, form]);

  const handleFetchScopusData = async () => {
    if (!relevantLink) return;
    if (!user) {
        toast({ variant: 'destructive', title: 'Not Logged In', description: 'Could not identify the claimant.' });
        return;
    }
    setIsFetchingScopus(true);
    try {
        const result = await fetchScopusDataByUrl(relevantLink, user.name);
        if (result.success && result.data) {
            form.setValue('paperTitle', result.data.title, { shouldValidate: true });
            form.setValue('journalName', result.data.journalName, { shouldValidate: true });
            const totalAuthorsStr = result.data.totalAuthors >= 10 ? '10+' : result.data.totalAuthors.toString();
            if (authorCountOptions.includes(totalAuthorsStr)) {
                form.setValue('totalAuthors', totalAuthorsStr, { shouldValidate: true });
            }
            toast({ title: 'Success', description: 'Form fields have been pre-filled.' });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to fetch data.' });
        }
    } finally {
        setIsFetchingScopus(false);
    }
  };

  const handleFetchWosData = async () => {
    if (!relevantLink) return;
     if (!user) {
        toast({ variant: 'destructive', title: 'Not Logged In', description: 'Could not identify the claimant.' });
        return;
    }
    setIsFetchingWos(true);
    try {
        const result = await fetchWosDataByUrl(relevantLink, user.name);
        if (result.success && result.data) {
            form.setValue('paperTitle', result.data.title, { shouldValidate: true });
            form.setValue('journalName', result.data.journalName, { shouldValidate: true });
            const totalAuthorsStr = result.data.totalAuthors >= 10 ? '10+' : result.data.totalAuthors.toString();
            if (authorCountOptions.includes(totalAuthorsStr)) {
                form.setValue('totalAuthors', totalAuthorsStr, { shouldValidate: true });
            }
            toast({ title: 'Success', description: 'Form fields have been pre-filled from WoS.' });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to fetch data.' });
        }
    } finally {
        setIsFetchingWos(false);
    }
  };

  const handleFindWebsite = async () => {
    if (!journalName) return;
    setIsFindingWebsite(true);
    try {
        const result = await getJournalWebsite({ journalName });
        if (result.success && result.url) {
            form.setValue('journalWebsite', result.url, { shouldValidate: true });
            toast({ title: 'Success', description: 'Journal website link has been filled.' });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to find website.' });
        }
    } finally {
        setIsFindingWebsite(false);
    }
  };

  async function handleSave(status: 'Draft' | 'Pending') {
    if (!user || !user.faculty) return;
    if (status === 'Pending' && (bankDetailsMissing || orcidOrMisIdMissing)) {
        toast({ variant: 'destructive', title: 'Profile Incomplete', description: 'Please add your bank details, ORCID iD, and MIS ID in Settings before submitting a claim.' });
        return;
    }
    
    setIsSubmitting(true);
    try {
        const data = form.getValues();
        const claimId = doc(collection(db, 'incentiveClaims')).id;

        const publicationProofFile = data.publicationProof?.[0];
        let publicationProofUrl: string | undefined;

        if(publicationProofFile){
            const dataUrl = await fileToDataUrl(publicationProofFile);
            const path = `incentive-proofs/${user.uid}/research-paper/${new Date().toISOString()}-${publicationProofFile.name}`;
            const result = await uploadFileToServer(dataUrl, path);
            if (!result.success || !result.url) throw new Error(result.error || 'File upload failed');
            publicationProofUrl = result.url;
        }

        const claimData: Omit<IncentiveClaim, 'id'> = {
            ...data,
            claimType: 'Research Papers',
            uid: user.uid,
            userName: user.name,
            userEmail: user.email,
            faculty: user.faculty,
            status,
            submissionDate: new Date().toISOString(),
            bankDetails: user.bankDetails || null,
            misId: user.misId,
            orcidId: user.orcidId,
            publicationProofUrl: publicationProofUrl,
        };

        await setDoc(doc(db, 'incentiveClaims', claimId), claimData);

        if (status === 'Draft') {
            toast({ title: 'Draft Saved!', description: "You can continue editing from the 'Incentive Claim' page." });
            router.push(`/dashboard/incentive-claim/research-paper?claimId=${claimId}`);
        } else {
            toast({ title: 'Success', description: 'Your incentive claim has been submitted.' });
            router.push('/dashboard/incentive-claim');
        }
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to submit claim.' });
    } finally {
        setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(() => handleSave('Pending'))}>
          <CardContent className="space-y-6 pt-6">
            {(bankDetailsMissing || orcidOrMisIdMissing) && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Profile Incomplete</AlertTitle>
                    <AlertDescription>
                        An ORCID iD, MIS ID, and bank details are mandatory for submitting incentive claims. Please add them to your profile.
                        <Button asChild variant="link" className="p-1 h-auto"><Link href="/dashboard/settings">Go to Settings</Link></Button>
                    </AlertDescription>
                </Alert>
            )}
            <div className="rounded-lg border p-4 space-y-4 animate-in fade-in-0">
                <h3 className="font-semibold text-sm -mb-2">RESEARCH PAPER DETAILS</h3>
                <Separator />
                <FormField control={form.control} name="publicationType" render={({ field }) => ( <FormItem><FormLabel>Please Select</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select publication type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Referred paper in journal listed by WOS/Scopus">Referred paper in journal listed by WOS/Scopus</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="indexType" render={({ field }) => ( <FormItem className="space-y-3"><FormLabel>Select Type</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-wrap items-center gap-x-6 gap-y-2">{availableIndexTypes.map((option) => (<FormItem key={option.value} className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value={option.value} /></FormControl><FormLabel className="font-normal">{option.label}</FormLabel></FormItem>))}</RadioGroup></FormControl><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="relevantLink" render={({ field }) => ( <FormItem><FormLabel>Relevant Link (e.g., DOI, Scopus URL)</FormLabel><div className="flex items-center gap-2"><FormControl><Input placeholder="https://..." {...field} /></FormControl><Button type="button" variant="outline" size="sm" onClick={handleFetchScopusData} disabled={isFetchingScopus || !relevantLink || !['scopus', 'both'].includes(indexType || '')}><Bot className="h-4 w-4 mr-1"/>Scopus</Button><Button type="button" variant="outline" size="sm" onClick={handleFetchWosData} disabled={isFetchingWos || !relevantLink || !['wos', 'both'].includes(indexType || '')}><Bot className="h-4 w-4 mr-1"/>WoS</Button></div><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="journalClassification" render={({ field }) => ( <FormItem className="space-y-3"><FormLabel>Journal Classification</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-wrap items-center gap-x-6 gap-y-2">{availableClassifications.map((option) => (<FormItem key={option.value} className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value={option.value} /></FormControl><FormLabel className="font-normal">{option.label}</FormLabel></FormItem>))}</RadioGroup></FormControl><FormMessage /></FormItem> )} />
                {(indexType === 'wos' || indexType === 'both') && (<FormField control={form.control} name="wosType" render={({ field }) => ( <FormItem className="space-y-3"><FormLabel>Type of WoS</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6">{wosTypeOptions.map((option) => (<FormItem key={option.value} className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value={option.value} /></FormControl><FormLabel className="font-normal">{option.label}</FormLabel></FormItem>))}</RadioGroup></FormControl><FormMessage /></FormItem> )} />)}
                <Separator />
                <FormField control={form.control} name="journalName" render={({ field }) => ( <FormItem><FormLabel>Name of Journal/Proceedings</FormLabel><div className="flex items-center gap-2"><FormControl><Textarea placeholder="Enter the full name" {...field} /></FormControl><Button type="button" variant="outline" size="icon" onClick={handleFindWebsite} disabled={isFindingWebsite || !journalName} title="Find Journal Website"><Bot className="h-4 w-4" /></Button></div><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="journalWebsite" render={({ field }) => ( <FormItem><FormLabel>Journal Website Link</FormLabel><FormControl><Input placeholder="https://..." {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="paperTitle" render={({ field }) => ( <FormItem><FormLabel>Title of the Paper published</FormLabel><FormControl><Textarea placeholder="Enter the full title" {...field} /></FormControl><FormDescription className="text-destructive text-xs">*Note: Do not use special characters ('", !, @, #, $, &).</FormDescription><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="impactFactor" render={({ field }) => ( <FormItem><FormLabel>Impact factor</FormLabel><FormControl><Input type="number" step="0.01" placeholder="e.g., 3.5" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="publicationPhase" render={({ field }) => ( <FormItem><FormLabel>Publication Phase</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="-- Please Select --" /></SelectTrigger></FormControl><SelectContent>{publicationPhaseOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="totalAuthors" render={({ field }) => ( <FormItem><FormLabel>Total No. of Authors</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="-- Please Select --" /></SelectTrigger></FormControl><SelectContent>{authorCountOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )}/>
                  <FormField control={form.control} name="authorType" render={({ field }) => ( <FormItem><FormLabel>Author Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="-- Please Select --" /></SelectTrigger></FormControl><SelectContent>{authorTypeOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )}/>
                </div>
                <FormField name="publicationProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Proof of Publication (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} accept="application/pdf" /></FormControl><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="selfDeclaration" render={({ field }) => ( <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Self Declaration</FormLabel><FormMessage /><p className="text-xs text-muted-foreground">I hereby confirm that I have not applied/claimed for any incentive for the same application/publication earlier.</p></div></FormItem> )} />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => handleSave('Draft')} disabled={isSubmitting}>Save as Draft</Button>
            <Button type="submit" disabled={isSubmitting || bankDetailsMissing || orcidOrMisIdMissing}>
              {isSubmitting ? 'Submitting...' : 'Submit Claim'}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

    