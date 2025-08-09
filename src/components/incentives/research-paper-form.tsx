
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
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import type { User, IncentiveClaim } from '@/types';
import { fetchScopusDataByUrl, getJournalWebsite, fetchWosDataByUrl } from '@/app/actions';
import { Loader2, AlertCircle, Bot } from 'lucide-react';

const SPECIAL_POLICY_FACULTIES = [
    "Faculty of Applied Sciences", "Faculty of Medicine", "Faculty of Homoeopathy", "Faculty of Ayurved",
    "Faculty of Nursing", "Faculty of Pharmacy", "Faculty of Physiotherapy", "Faculty of Public Health",
    "Faculty of Engineering & Technology"
];

const researchPaperSchema = z
  .object({
    publicationType: z.string().optional(),
    indexType: z.enum(['wos', 'scopus', 'both', 'esci']).optional(),
    relevantLink: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
    journalClassification: z.enum(['Q1', 'Q2', 'Q3', 'Q4']).optional(),
    wosType: z.enum(['SCIE', 'SSCI', 'A&HCI']).optional(),
    impactFactor: z.coerce.number().optional(),
    authorType: z.string({ required_error: 'Please select your author type.' }),
    journalName: z.string().min(3, "Journal name is required."),
    journalWebsite: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
    paperTitle: z.string().min(5, "Paper title is required."),
    publicationPhase: z.string().optional(),
  })
  .refine((data) => {
      if ((data.indexType === 'wos' || data.indexType === 'both')) {
        return !!data.wosType;
      }
      return true;
  }, { message: 'For WoS or Both, you must select a WoS Type.', path: ['wosType'] });

type ResearchPaperFormValues = z.infer<typeof researchPaperSchema>;

const authorTypeOptions = [ 'First Author', 'Co-Author' ];
const publicationPhaseOptions = [ 'Published online first with DOI number', 'Published with vol and page number' ];
const wosTypeOptions = [ { value: 'SCIE', label: 'SCIE' }, { value: 'SSCI', label: 'SSCI' }, { value: 'A&HCI', label: 'A&HCI' } ];
const indexTypeOptions = [ { value: 'wos', label: 'WoS' }, { value: 'scopus', label: 'Scopus' }, { value: 'both', label: 'Both' }, { value: 'esci', label: 'ESCI' } ];
const journalClassificationOptions = [ { value: 'Q1', label: 'Q1' }, { value: 'Q2', label: 'Q2' }, { value: 'Q3', label: 'Q3' }, { value: 'Q4', label: 'Q4' } ];

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
      publicationType: 'Referred paper in journal listed by WOS/Scopus',
      indexType: undefined,
      relevantLink: '',
      journalClassification: undefined,
      wosType: undefined,
      impactFactor: 0,
      authorType: '',
      journalName: '',
      journalWebsite: '',
      paperTitle: '',
      publicationPhase: '',
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
    [user?.faculty]
  );

  const availableIndexTypes = useMemo(() =>
    isSpecialFaculty 
        ? indexTypeOptions.filter(o => o.value !== 'esci') 
        : indexTypeOptions,
    [isSpecialFaculty]
  );

  const availableClassifications = useMemo(() =>
    (isSpecialFaculty && (indexType === 'wos' || indexType === 'both'))
        ? journalClassificationOptions.filter(o => o.value === 'Q1' || o.value === 'Q2')
        : journalClassificationOptions,
    [isSpecialFaculty, indexType]
  );
  
  useEffect(() => {
    const currentClassification = form.getValues('journalClassification');
    if (currentClassification && !availableClassifications.find(o => o.value === currentClassification)) {
        form.setValue('journalClassification', undefined, { shouldValidate: true });
    }
  }, [availableClassifications, form]);

  useEffect(() => {
    const currentIndexType = form.getValues('indexType');
    if (currentIndexType && !availableIndexTypes.find(o => o.value === currentIndexType)) {
        form.setValue('indexType', undefined, { shouldValidate: true });
    }
  }, [availableIndexTypes, form]);

  const handleFetchScopusData = async () => {
    const link = form.getValues('relevantLink');
    if (!link || !user) return;
    setIsFetchingScopus(true);
    toast({ title: 'Fetching Scopus Data...' });
    try {
        const result = await fetchScopusDataByUrl(link, user.name);
        if (result.success && result.data) {
            const { title, journalName, totalAuthors } = result.data;
            form.setValue('paperTitle', title, { shouldValidate: true });
            form.setValue('journalName', journalName, { shouldValidate: true });
            
            toast({ title: 'Success', description: 'Form fields pre-filled.' });
            if (result.claimantIsAuthor === false) { toast({ variant: 'destructive', title: 'Author Not Found', description: `Could not verify "${user.name}" in the author list.`, duration: 8000 }); }
        } else { toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to fetch data.' }); }
    } catch (error: any) { toast({ variant: 'destructive', title: 'Error', description: error.message || 'An unexpected error occurred.' }); } finally { setIsFetchingScopus(false); }
  };

  const handleFetchWosData = async () => {
    const link = form.getValues('relevantLink');
    if (!link || !user) return;
    setIsFetchingWos(true);
    toast({ title: 'Fetching WoS Data...' });
    try {
        const result = await fetchWosDataByUrl(link, user.name);
        if (result.success && result.data) {
            const { title, journalName, totalAuthors } = result.data;
            form.setValue('paperTitle', title, { shouldValidate: true });
            form.setValue('journalName', journalName, { shouldValidate: true });
            
            toast({ title: 'Success', description: 'Form fields pre-filled from Web of Science.' });
            if (result.claimantIsAuthor === false) { toast({ variant: 'destructive', title: 'Author Not Found', description: `Could not verify "${user.name}" in the author list.`, duration: 8000 }); }
        } else { toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to fetch data.' }); }
    } catch (error: any) { toast({ variant: 'destructive', title: 'Error', description: error.message || 'An unexpected error occurred.' }); } finally { setIsFetchingWos(false); }
  };

  const handleFindWebsite = async () => {
    const name = form.getValues('journalName');
    if (!name) return;
    setIsFindingWebsite(true);
    toast({ title: 'Finding Website...' });
    try {
        const result = await getJournalWebsite({ journalName: name });
        if (result.success && result.url) { form.setValue('journalWebsite', result.url, { shouldValidate: true }); toast({ title: 'Success', description: 'Journal website link has been filled.' }); }
        else { toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to find website.' }); }
    } catch (error: any) { toast({ variant: 'destructive', title: 'Error', description: error.message || 'An unexpected error occurred.' }); } finally { setIsFindingWebsite(false); }
  };

  async function handleSave(status: 'Draft' | 'Pending') {
    if (!user || !user.faculty) {
      toast({ variant: 'destructive', title: 'Error', description: 'User information not found. Please log in again.' });
      return;
    }
    // Re-check profile completeness on submission
    if (status === 'Pending' && (!user.bankDetails || !user.orcidId || !user.misId)) {
        toast({
            variant: 'destructive',
            title: 'Profile Incomplete',
            description: 'Please add your bank details, ORCID iD, and MIS ID in Settings before submitting a claim.',
        });
        return;
    }
    
    setIsSubmitting(true);
    try {
      const data = form.getValues();
      const claimId = doc(collection(db, 'incentiveClaims')).id;

      const claimData: Omit<IncentiveClaim, 'id'> = {
        ...data,
        misId: user.misId || null,
        orcidId: user.orcidId || null,
        claimType: 'Research Papers',
        benefitMode: 'incentives',
        uid: user.uid,
        userName: user.name,
        userEmail: user.email,
        faculty: user.faculty,
        status,
        submissionDate: new Date().toISOString(),
        bankDetails: user.bankDetails || null,
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
                <FormField control={form.control} name="publicationType" render={({ field }) => ( <FormItem><FormLabel>Please Select</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSubmitting}><FormControl><SelectTrigger><SelectValue placeholder="Select publication type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Referred paper in journal listed by WOS/Scopus">Referred paper in journal listed by WOS/Scopus</SelectItem></SelectContent></Select><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="indexType" render={({ field }) => ( <FormItem className="space-y-3"><FormLabel>Select Type</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-wrap items-center gap-x-6 gap-y-2" disabled={isSubmitting}>{availableIndexTypes.map((option) => (<FormItem key={option.value} className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value={option.value} /></FormControl><FormLabel className="font-normal">{option.label}</FormLabel></FormItem>))}</RadioGroup></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="relevantLink" render={({ field }) => ( <FormItem><FormLabel>Relevant Link (e.g., DOI, Scopus URL)</FormLabel><div className="flex items-center gap-2"><FormControl><Input placeholder="https://www.scopus.com/record/display.uri?eid=..." {...field} disabled={isSubmitting} /></FormControl><Button type="button" variant="outline" size="sm" onClick={handleFetchScopusData} disabled={isSubmitting || isFetchingScopus || !relevantLink || (indexType !== 'scopus' && indexType !== 'both')} title="Fetch data from Scopus">{isFetchingScopus ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}Scopus</Button><Button type="button" variant="outline" size="sm" onClick={handleFetchWosData} disabled={isSubmitting || isFetchingWos || !relevantLink || (indexType !== 'wos' && indexType !== 'both')} title="Fetch data from Web of Science">{isFetchingWos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}WoS</Button></div><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="journalClassification" render={({ field }) => ( <FormItem className="space-y-3"><FormLabel>Journal Classification</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-wrap items-center gap-x-6 gap-y-2" disabled={isSubmitting}>{availableClassifications.map((option) => (<FormItem key={option.value} className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value={option.value} /></FormControl><FormLabel className="font-normal">{option.label}</FormLabel></FormItem>))}</RadioGroup></FormControl><FormMessage /></FormItem> )}/>
                {(indexType === 'wos' || indexType === 'both') && (<FormField control={form.control} name="wosType" render={({ field }) => ( <FormItem className="space-y-3"><FormLabel>Type of WoS</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6" disabled={isSubmitting}>{wosTypeOptions.map((option) => (<FormItem key={option.value} className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value={option.value} /></FormControl><FormLabel className="font-normal">{option.label}</FormLabel></FormItem>))}</RadioGroup></FormControl><FormMessage /></FormItem> )}/>)}
                <Separator />
                <FormField control={form.control} name="journalName" render={({ field }) => ( <FormItem><FormLabel>Name of Journal/Proceedings</FormLabel><div className="flex items-center gap-2"><FormControl><Textarea placeholder="Enter the full name of the journal or proceedings" {...field} disabled={isSubmitting} /></FormControl><Button type="button" variant="outline" size="icon" onClick={handleFindWebsite} disabled={isSubmitting || isFindingWebsite || !journalName} title="Find Journal Website with AI">{isFindingWebsite ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}<span className="sr-only">Find Website</span></Button></div><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="journalWebsite" render={({ field }) => ( <FormItem><FormLabel>Journal Website Link</FormLabel><FormControl><Input placeholder="https://www.examplejournal.com" {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="paperTitle" render={({ field }) => ( <FormItem><FormLabel>Title of the Paper published</FormLabel><FormControl><Textarea placeholder="Enter the full title of your paper" {...field} disabled={isSubmitting} /></FormControl><FormDescription className="text-destructive text-xs">* Note:-Please ensure that there should not be any special character (", ', !, @, #, $, &) in the Title of the Paper published.</FormDescription><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="impactFactor" render={({ field }) => ( <FormItem><FormLabel>Impact factor</FormLabel><FormControl><Input type="number" step="0.01" placeholder="e.g., 3.5" {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem> )}/>
                <FormField
                  control={form.control}
                  name="authorType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Author Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="-- Please Select --" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {authorTypeOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField control={form.control} name="publicationPhase" render={({ field }) => ( <FormItem><FormLabel>Publication Phase</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}><FormControl><SelectTrigger><SelectValue placeholder="-- Please Select --" /></SelectTrigger></FormControl><SelectContent>{publicationPhaseOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )}/>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSave('Draft')}
              disabled={isSubmitting || orcidOrMisIdMissing}
            >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save as Draft
            </Button>
            <Button type="submit" disabled={isSubmitting || orcidOrMisIdMissing}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Submitting...' : 'Submit Claim'}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
