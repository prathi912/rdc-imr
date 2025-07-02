
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
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
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { collection, addDoc } from 'firebase/firestore';
import type { User, IncentiveClaim } from '@/types';
import { fetchScopusDataByUrl, getJournalWebsite } from '@/app/actions';
import { Loader2, AlertCircle, Bot } from 'lucide-react';

const incentiveSchema = z
  .object({
    claimType: z.string().min(1, 'Please select a claim type.'),
    publicationType: z.string().optional(),
    indexType: z.enum(['wos', 'scopus', 'both', 'esci']).optional(),
    relevantLink: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
    journalClassification: z.enum(['Q1', 'Q2', 'Q3', 'Q4']).optional(),
    wosType: z.enum(['sci', 'scie', 'ahi']).optional(),
    impactFactor: z.coerce.number().optional(),
    totalAuthors: z.string().optional(),
    totalInternalAuthors: z.string().optional(),
    totalInternalCoAuthors: z.string().optional(),
    authorType: z.string().optional(),
    benefitMode: z.string().default('incentives'),
    journalName: z.string().optional(),
    journalWebsite: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
    paperTitle: z.string().optional(),
    publicationPhase: z.string().optional(),
    // Patent fields
    patentTitle: z.string().optional(),
    patentStatus: z.enum(['Application Published', 'Granted']).optional(),
    patentApplicantType: z.enum(['Sole', 'Joint']).optional(),
  })
  .refine(
    (data) => {
        if (data.claimType !== 'Research Papers') return true;
        return !!data.paperTitle && data.paperTitle.length >= 5;
    },
    {
        message: 'Paper title is required.',
        path: ['paperTitle'],
    }
  )
   .refine(
    (data) => {
        if (data.claimType !== 'Patents') return true;
        return !!data.patentTitle && data.patentTitle.length >= 5;
    },
    {
        message: 'Patent title is required.',
        path: ['patentTitle'],
    }
  )
  .refine(
    (data) => {
        if (data.claimType !== 'Patents') return true;
        return !!data.patentStatus;
    },
    {
        message: 'Patent status is required.',
        path: ['patentStatus'],
    }
  )
  .refine(
    (data) => {
        if (data.claimType !== 'Patents') return true;
        return !!data.patentApplicantType;
    },
    {
        message: 'Applicant type is required.',
        path: ['patentApplicantType'],
    }
  )
  .refine(
    (data) => {
      if ((data.indexType === 'wos' || data.indexType === 'both') && data.claimType === 'Research Papers') {
        return !!data.wosType;
      }
      return true;
    },
    {
      message: 'For WoS or Both, you must select a WoS Type.',
      path: ['wosType'],
    }
  );

type IncentiveFormValues = z.infer<typeof incentiveSchema>;

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

export function IncentiveForm() {
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetchingScopus, setIsFetchingScopus] = useState(false);
  const [isFindingWebsite, setIsFindingWebsite] = useState(false);
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false);
  
  const form = useForm<IncentiveFormValues>({
    resolver: zodResolver(incentiveSchema),
    defaultValues: {
      claimType: 'Research Papers',
      publicationType: 'Referred paper in journal listed by WOS/Scopus',
      benefitMode: 'incentives',
      relevantLink: '',
      impactFactor: '' as any, // Initialize to empty string to make it a controlled component
      totalAuthors: '',
      totalInternalAuthors: '',
      totalInternalCoAuthors: '',
      authorType: '',
      journalName: '',
      journalWebsite: '',
      paperTitle: '',
      publicationPhase: '',
      journalClassification: undefined,
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

  const claimType = form.watch('claimType');
  const indexType = form.watch('indexType');
  const relevantLink = form.watch('relevantLink');
  const journalName = form.watch('journalName');
  
  const handleFetchScopusData = async () => {
    const link = form.getValues('relevantLink');
    if (!link) {
        toast({ variant: 'destructive', title: 'No Link Provided', description: 'Please enter a link to fetch data from.' });
        return;
    }

    if (!user) {
        toast({ variant: 'destructive', title: 'Not Logged In', description: 'Could not identify the claimant. Please log in again.' });
        return;
    }

    setIsFetchingScopus(true);
    toast({ title: 'Fetching Scopus Data', description: 'Please wait...' });

    try {
        const result = await fetchScopusDataByUrl(link, user.name);
        if (result.success && result.data) {
            const { title, journalName, totalAuthors, totalInternalAuthors, totalInternalCoAuthors } = result.data;
            form.setValue('paperTitle', title, { shouldValidate: true });
            form.setValue('journalName', journalName, { shouldValidate: true });
            
            const formatCount = (count: number) => count >= 10 ? '10+' : count.toString();

            const totalAuthorsStr = formatCount(totalAuthors);
            if (authorCountOptions.includes(totalAuthorsStr)) {
                form.setValue('totalAuthors', totalAuthorsStr, { shouldValidate: true });
            }
            
            const totalInternalAuthorsStr = formatCount(totalInternalAuthors);
            if (authorCountOptions.includes(totalInternalAuthorsStr)) {
                form.setValue('totalInternalAuthors', totalInternalAuthorsStr, { shouldValidate: true });
            }

            const totalInternalCoAuthorsStr = formatCount(totalInternalCoAuthors);
            if (authorCountOptions.includes(totalInternalCoAuthorsStr)) {
                form.setValue('totalInternalCoAuthors', totalInternalCoAuthorsStr, { shouldValidate: true });
            }
            
            toast({ title: 'Success', description: 'Form fields have been pre-filled.' });

            if (result.claimantIsAuthor === false) { // check for explicit false
                toast({
                    variant: 'destructive',
                    title: 'Author Not Found',
                    description: `Could not verify "${user.name}" in the author list. Please check the publication link and your profile name.`,
                    duration: 8000,
                });
            }
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to fetch data.' });
        }
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'An unexpected error occurred.' });
    } finally {
        setIsFetchingScopus(false);
    }
  };

  const handleFindWebsite = async () => {
    const name = form.getValues('journalName');
    if (!name) {
        toast({ variant: 'destructive', title: 'No Journal Name', description: 'Please enter a journal name to find its website.' });
        return;
    }

    setIsFindingWebsite(true);
    toast({ title: 'Finding Website', description: 'AI is searching for the journal website...' });

    try {
        const result = await getJournalWebsite({ journalName: name });
        if (result.success && result.url) {
            form.setValue('journalWebsite', result.url, { shouldValidate: true });
            toast({ title: 'Success', description: 'Journal website link has been filled.' });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to find website.' });
        }
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'An unexpected error occurred.' });
    } finally {
        setIsFindingWebsite(false);
    }
  };

  async function onSubmit(data: IncentiveFormValues) {
    if (!user || !user.faculty || !user.bankDetails) {
        toast({ variant: 'destructive', title: 'Bank Details Missing', description: 'You must add your bank details in Settings to submit a claim.' });
        return;
    }
    setIsSubmitting(true);
    try {
        const claimData: Omit<IncentiveClaim, 'id'> = {
            ...data,
            uid: user.uid,
            userName: user.name,
            userEmail: user.email,
            faculty: user.faculty,
            status: 'Pending',
            submissionDate: new Date().toISOString(),
            bankDetails: user.bankDetails,
        };
        await addDoc(collection(db, 'incentiveClaims'), claimData);
        toast({ title: 'Success', description: 'Your incentive claim has been submitted.' });
        form.reset();
    } catch (error) {
        console.error('Error submitting claim: ', error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to submit claim. Please try again.' });
    } finally {
        setIsSubmitting(false);
    }
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Incentive Claim Form</CardTitle>
        <CardDescription>
          Fill out the details below to apply for the incentive. Select the claim type to see relevant fields.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
             {bankDetailsMissing && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Bank Details Required</AlertTitle>
                    <AlertDescription>
                        Please add your salary bank account details in your profile before you can submit an incentive claim.
                        <Button asChild variant="link" className="p-1 h-auto"><Link href="/dashboard/settings">Go to Settings</Link></Button>
                    </AlertDescription>
                </Alert>
            )}

            <div className="flex items-center gap-4">
              <FormField
                control={form.control}
                name="claimType"
                render={({ field }) => (
                  <FormItem className="flex-grow">
                    <FormLabel>Claim Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting || bankDetailsMissing}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a claim type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Research Papers">Research Papers</SelectItem>
                        <SelectItem value="Patents">Patents</SelectItem>
                        <SelectItem value="Books">Books (Coming Soon)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button variant="link" type="button" className="self-end pb-2 h-auto">Important Information</Button>
            </div>
            
            {claimType === 'Research Papers' && (
                <div className="rounded-lg border p-4 space-y-4 animate-in fade-in-0">
                    <h3 className="font-semibold text-sm -mb-2">RESEARCH PAPER DETAILS</h3>
                    <Separator />

                    <FormField
                    control={form.control}
                    name="publicationType"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Please Select</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting || bankDetailsMissing}>
                            <FormControl>
                                <SelectTrigger>
                                <SelectValue placeholder="Select publication type" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="Referred paper in journal listed by WOS/Scopus">
                                Referred paper in journal listed by WOS/Scopus
                                </SelectItem>
                            </SelectContent>
                            </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                        control={form.control}
                        name="indexType"
                        render={({ field }) => (
                            <FormItem className="space-y-3">
                            <FormLabel>Select Type</FormLabel>
                            <FormControl>
                                <RadioGroup
                                onValueChange={field.onChange}
                                value={field.value}
                                className="flex flex-wrap items-center gap-x-6 gap-y-2"
                                disabled={isSubmitting || bankDetailsMissing}
                                >
                                <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="wos" /></FormControl><FormLabel className="font-normal">WoS</FormLabel></FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="scopus" /></FormControl><FormLabel className="font-normal">Scopus</FormLabel></FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="both" /></FormControl><FormLabel className="font-normal">Both</FormLabel></FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="esci" /></FormControl><FormLabel className="font-normal">ESCI</FormLabel></FormItem>
                                </RadioGroup>
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="relevantLink"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Relevant Link (e.g., DOI, Scopus URL)</FormLabel>
                            <div className="flex items-center gap-2">
                                <FormControl>
                                    <Input placeholder="https://www.scopus.com/record/display.uri?eid=..." {...field} disabled={isSubmitting || bankDetailsMissing} />
                                </FormControl>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={handleFetchScopusData}
                                    disabled={isSubmitting || bankDetailsMissing || isFetchingScopus || !relevantLink || (indexType !== 'scopus' && indexType !== 'both')}
                                    title="Fetch data from Scopus"
                                >
                                    {isFetchingScopus ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                                    <span className="sr-only">Fetch from Scopus</span>
                                </Button>
                            </div>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    
                    <FormField
                        control={form.control}
                        name="journalClassification"
                        render={({ field }) => (
                            <FormItem className="space-y-3">
                            <FormLabel>Journal Classification</FormLabel>
                            <FormControl>
                                <RadioGroup
                                onValueChange={field.onChange}
                                value={field.value}
                                className="flex flex-wrap items-center gap-x-6 gap-y-2"
                                disabled={isSubmitting || bankDetailsMissing}
                                >
                                <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Q1" /></FormControl><FormLabel className="font-normal">Q1</FormLabel></FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Q2" /></FormControl><FormLabel className="font-normal">Q2</FormLabel></FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Q3" /></FormControl><FormLabel className="font-normal">Q3</FormLabel></FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Q4" /></FormControl><FormLabel className="font-normal">Q4</FormLabel></FormItem>
                                </RadioGroup>
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />


                    {(indexType === 'wos' || indexType === 'both') && (
                        <FormField
                            control={form.control}
                            name="wosType"
                            render={({ field }) => (
                                <FormItem className="space-y-3">
                                <FormLabel>Type of WoS</FormLabel>
                                <FormControl>
                                    <RadioGroup
                                    onValueChange={field.onChange}
                                    value={field.value}
                                    className="flex items-center space-x-6"
                                    disabled={isSubmitting || bankDetailsMissing}
                                    >
                                    <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="sci" /></FormControl><FormLabel className="font-normal">SCI</FormLabel></FormItem>
                                    <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="scie" /></FormControl><FormLabel className="font-normal">SCIE</FormLabel></FormItem>
                                    <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="ahi" /></FormControl><FormLabel className="font-normal">A&amp;HI</FormLabel></FormItem>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                    )}
                    <Separator />
                    <FormField
                        control={form.control}
                        name="journalName"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Name of Journal/Proceedings</FormLabel>
                            <div className="flex items-center gap-2">
                                <FormControl>
                                    <Textarea placeholder="Enter the full name of the journal or proceedings" {...field} disabled={isSubmitting || bankDetailsMissing} />
                                </FormControl>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={handleFindWebsite}
                                    disabled={isSubmitting || bankDetailsMissing || isFindingWebsite || !journalName}
                                    title="Find Journal Website with AI"
                                >
                                    {isFindingWebsite ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                                    <span className="sr-only">Find Website</span>
                                </Button>
                            </div>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="journalWebsite"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Journal Website Link</FormLabel>
                            <FormControl>
                                <Input placeholder="https://www.examplejournal.com" {...field} disabled={isSubmitting || bankDetailsMissing} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="paperTitle"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Title of the Paper published</FormLabel>
                            <FormControl>
                                <Textarea placeholder="Enter the full title of your paper" {...field} disabled={isSubmitting || bankDetailsMissing} />
                            </FormControl>
                            <FormDescription className="text-destructive text-xs">* Note:-Please ensure that there should not be any special character (", ', !, @, #, $, &) in the Title of the Paper published.</FormDescription>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="impactFactor"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Impact factor</FormLabel>
                            <FormControl>
                                <Input type="number" step="0.01" placeholder="e.g., 3.5" {...field} disabled={isSubmitting || bankDetailsMissing} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                    control={form.control}
                    name="totalAuthors"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Total No. of Authors</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting || bankDetailsMissing}>
                            <FormControl>
                            <SelectTrigger><SelectValue placeholder="-- Please Select --" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>{authorCountOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select>
                        <FormDescription className="text-destructive text-xs">* Note:-More than Two First Authors or More than Two Corresponding Authors are Not Allowed. In this case you have to select more Co-Authors only.</FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="totalInternalAuthors"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Total No. of Internal Authors</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting || bankDetailsMissing}>
                            <FormControl>
                            <SelectTrigger><SelectValue placeholder="-- Please Select --" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>{authorCountOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="totalInternalCoAuthors"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Total No. of Internal Co Authors</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting || bankDetailsMissing}>
                            <FormControl>
                            <SelectTrigger><SelectValue placeholder="-- Please Select --" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>{authorCountOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="authorType"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Author Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting || bankDetailsMissing}>
                            <FormControl>
                            <SelectTrigger><SelectValue placeholder="-- Please Select --" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>{authorTypeOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                    />

                    <FormField
                        control={form.control}
                        name="benefitMode"
                        render={({ field }) => (
                            <FormItem className="space-y-3">
                            <FormLabel>Benefit Mode</FormLabel>
                            <FormControl>
                                <RadioGroup
                                onValueChange={field.onChange}
                                value={field.value}
                                className="flex items-center space-x-6"
                                disabled={isSubmitting || bankDetailsMissing}
                                >
                                <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="incentives" /></FormControl><FormLabel className="font-normal">Incentives</FormLabel></FormItem>
                                </RadioGroup>
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    
                    <FormField
                        control={form.control}
                        name="publicationPhase"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Publication Phase</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting || bankDetailsMissing}>
                                    <FormControl>
                                        <SelectTrigger><SelectValue placeholder="-- Please Select --" /></SelectTrigger>
                                    </FormControl>
                                    <SelectContent>{publicationPhaseOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            )}

            {claimType === 'Patents' && (
                 <div className="rounded-lg border p-4 space-y-4 animate-in fade-in-0">
                    <h3 className="font-semibold text-sm -mb-2">PATENT DETAILS</h3>
                    <Separator />
                    <FormField
                        control={form.control}
                        name="patentTitle"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Title of the Patent</FormLabel>
                            <FormControl>
                                <Textarea placeholder="Enter the full title of your patent" {...field} disabled={isSubmitting || bankDetailsMissing} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                     <FormField
                        control={form.control}
                        name="patentStatus"
                        render={({ field }) => (
                            <FormItem className="space-y-3">
                            <FormLabel>Patent Status</FormLabel>
                            <FormControl>
                                <RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6" disabled={isSubmitting || bankDetailsMissing}>
                                    <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Application Published" /></FormControl><FormLabel className="font-normal">Application Published</FormLabel></FormItem>
                                    <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Granted" /></FormControl><FormLabel className="font-normal">Granted</FormLabel></FormItem>
                                </RadioGroup>
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                     <FormField
                        control={form.control}
                        name="patentApplicantType"
                        render={({ field }) => (
                            <FormItem className="space-y-3">
                            <FormLabel>Applicant Type</FormLabel>
                            <FormControl>
                                <RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6" disabled={isSubmitting || bankDetailsMissing}>
                                    <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Sole" /></FormControl><FormLabel className="font-normal">Parul University as Sole Applicant</FormLabel></FormItem>
                                    <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Joint" /></FormControl><FormLabel className="font-normal">Parul University as Joint Applicant</FormLabel></FormItem>
                                </RadioGroup>
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                 </div>
            )}

          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmitting || bankDetailsMissing || claimType === 'Books'}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Submitting...' : 'Submit Claim'}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
