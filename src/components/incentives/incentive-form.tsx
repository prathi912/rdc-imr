
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
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { collection, addDoc } from 'firebase/firestore';
import type { User, IncentiveClaim } from '@/types';
import { fetchScopusDataByUrl, getJournalWebsite, uploadFileToServer } from '@/app/actions';
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
    patentStatus: z.enum(['Filed', 'Published', 'Granted']).optional(),
    patentApplicantType: z.enum(['Sole', 'Joint']).optional(),
    patentOrcidId: z.string().optional(),
    patentSpecificationType: z.enum(['Full', 'Provisional']).optional(),
    patentApplicationNumber: z.string().optional(),
    patentTotalStudents: z.coerce.number().optional(),
    patentStudentNames: z.string().optional(),
    patentFiledInPuName: z.boolean().optional(),
    patentFiledFromIprCell: z.boolean().optional(),
    patentPermissionTaken: z.boolean().optional(),
    patentApprovalProof: z.any().optional(),
    patentForm1: z.any().optional(),
    patentGovtReceipt: z.any().optional(),
    patentSelfDeclaration: z.boolean().optional(),
    // Conference fields
    conferenceName: z.string().optional(),
    conferencePaperTitle: z.string().optional(),
    conferenceType: z.enum(['International', 'National', 'Regional/State']).optional(),
    conferenceVenue: z.enum(['India', 'Indian Subcontinent', 'South Korea, Japan, Australia and Middle East', 'Europe', 'African/South American/North American']).optional(),
    presentationType: z.enum(['Oral', 'Poster', 'Other']).optional(),
    govtFundingRequestProof: z.any().optional(),
    registrationFee: z.coerce.number().optional(),
    travelFare: z.coerce.number().optional(),
    conferenceMode: z.enum(['Online', 'Offline']).optional(),
    onlinePresentationOrder: z.enum(['First', 'Second', 'Third', 'Additional']).optional(),
    wasPresentingAuthor: z.boolean().optional(),
    isPuNamePresent: z.boolean().optional(),
    abstractUpload: z.any().optional(),
    organizerName: z.string().optional(),
    eventWebsite: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
    conferenceDate: z.string().optional(),
    presentationDate: z.string().optional(),
    registrationFeeProof: z.any().optional(),
    participationCertificate: z.any().optional(),
    wonPrize: z.boolean().optional(),
    prizeDetails: z.string().optional(),
    prizeProof: z.any().optional(),
    attendedOtherConference: z.boolean().optional(),
    travelPlaceVisited: z.string().optional(),
    travelMode: z.enum(['Bus', 'Train', 'Air', 'Other']).optional(),
    travelReceipts: z.any().optional(),
    conferenceSelfDeclaration: z.boolean().optional(),
    orcidId: z.string().optional(),

    // Book/Book Chapter fields
    bookApplicationType: z.enum(['Book Chapter', 'Book']).optional(),
    publicationTitle: z.string().optional(),
    bookAuthors: z.string().optional(),
    bookTitleForChapter: z.string().optional(),
    bookEditor: z.string().optional(),
    totalPuAuthors: z.coerce.number().optional(),
    totalPuStudents: z.coerce.number().optional(),
    puStudentNames: z.string().optional(),
    bookChapterPages: z.coerce.number().optional(),
    bookTotalPages: z.coerce.number().optional(),
    publisherName: z.string().optional(),
    isSelfPublished: z.boolean().optional(),
    publisherType: z.enum(['National', 'International']).optional(),
    isScopusIndexed: z.boolean().optional(),
    authorRole: z.enum(['Editor', 'Author']).optional(),
    isbn: z.string().optional(),
    bookType: z.enum(['Textbook', 'Reference Book']).optional(),
    publisherWebsite: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
    bookProof: z.any().optional(),
    scopusProof: z.any().optional(),
    publicationOrderInYear: z.enum(['First', 'Second', 'Third']).optional(),
    bookSelfDeclaration: z.boolean().optional(),
  })
  .refine((data) => {
      if (data.claimType !== 'Research Papers') return true;
      return !!data.paperTitle && data.paperTitle.length >= 5;
  }, { message: 'Paper title is required.', path: ['paperTitle'] })
  .refine((data) => {
      if ((data.indexType === 'wos' || data.indexType === 'both') && data.claimType === 'Research Papers') {
        return !!data.wosType;
      }
      return true;
  }, { message: 'For WoS or Both, you must select a WoS Type.', path: ['wosType'] })
  // Conference validations
  .refine((data) => {
      if (data.claimType !== 'Conference Presentations') return true;
      return !!data.conferenceName && data.conferenceName.length > 2;
  }, { message: 'Conference name is required.', path: ['conferenceName']})
  .refine((data) => {
      if (data.claimType !== 'Conference Presentations') return true;
      return !!data.conferencePaperTitle && data.conferencePaperTitle.length > 5;
  }, { message: 'Paper title is required.', path: ['conferencePaperTitle']})
  .refine((data) => {
      if (data.claimType !== 'Conference Presentations') return true;
      return !!data.conferenceType;
  }, { message: 'Conference type is required.', path: ['conferenceType']})
  .refine((data) => {
      if (data.claimType !== 'Conference Presentations') return true;
      return !!data.conferenceVenue;
  }, { message: 'Conference venue is required.', path: ['conferenceVenue']})
  .refine((data) => {
      if (data.claimType !== 'Conference Presentations') return true;
      return !!data.presentationType;
  }, { message: 'Presentation type is required.', path: ['presentationType']})
  .refine((data) => {
      if (data.claimType === 'Conference Presentations' && data.conferenceVenue !== 'India') {
          return !!data.govtFundingRequestProof && data.govtFundingRequestProof.length > 0;
      }
      return true;
  }, { message: 'Proof of government funding request is required for conferences outside India.', path: ['govtFundingRequestProof']})
  .refine((data) => {
    if (data.claimType !== 'Conference Presentations') return true;
    return !!data.participationCertificate && data.participationCertificate.length > 0;
  }, { message: 'Participation certificate is required.', path: ['participationCertificate']})
  .refine((data) => {
    if (data.claimType !== 'Conference Presentations') return true;
    return data.conferenceSelfDeclaration === true;
  }, { message: 'You must agree to the self-declaration.', path: ['conferenceSelfDeclaration']})
  // Patent validations
  .refine((data) => {
      if (data.claimType !== 'Patents') return true;
      return !!data.patentTitle && data.patentTitle.length > 2;
  }, { message: 'Patent title is required.', path: ['patentTitle'] })
  .refine((data) => {
      if (data.claimType !== 'Patents') return true;
      return !!data.patentSpecificationType;
  }, { message: 'Specification type is required.', path: ['patentSpecificationType'] })
  .refine((data) => {
      if (data.claimType !== 'Patents') return true;
      return !!data.patentApplicationNumber && data.patentApplicationNumber.length > 2;
  }, { message: 'Application number is required.', path: ['patentApplicationNumber'] })
  .refine((data) => {
      if (data.claimType !== 'Patents') return true;
      return data.patentFiledInPuName !== undefined;
  }, { message: 'This field is required.', path: ['patentFiledInPuName'] })
    .refine((data) => {
      if (data.claimType !== 'Patents') return true;
      return data.patentFiledFromIprCell !== undefined;
  }, { message: 'This field is required.', path: ['patentFiledFromIprCell'] })
  .refine((data) => {
      if (data.claimType === 'Patents' && data.patentFiledFromIprCell === false) {
          return data.patentPermissionTaken !== undefined;
      }
      return true;
  }, { message: 'This field is required.', path: ['patentPermissionTaken'] })
  .refine((data) => {
      if (data.claimType !== 'Patents') return true;
      return !!data.patentStatus;
  }, { message: 'Patent status is required.', path: ['patentStatus'] })
  .refine((data) => {
      if (data.claimType !== 'Patents') return true;
      return !!data.patentForm1 && data.patentForm1.length > 0;
  }, { message: 'Proof (Form 1) is required.', path: ['patentForm1'] })
    .refine((data) => {
      if (data.claimType !== 'Patents') return true;
      return !!data.patentGovtReceipt && data.patentGovtReceipt.length > 0;
  }, { message: 'Proof (Govt. Receipt) is required.', path: ['patentGovtReceipt'] })
  .refine((data) => {
      if (data.claimType !== 'Patents') return true;
      return !!data.patentSelfDeclaration && data.patentSelfDeclaration === true;
  }, { message: 'You must agree to the self declaration.', path: ['patentSelfDeclaration'] })
  // Book/Book Chapter validations
  .refine(data => data.claimType !== 'Books' || !!data.bookApplicationType, { message: 'Please select an application type.', path: ['bookApplicationType'] })
  .refine(data => data.claimType !== 'Books' || (!!data.publicationTitle && data.publicationTitle.length > 2), { message: 'Title is required.', path: ['publicationTitle'] })
  .refine(data => !(data.claimType === 'Books' && data.bookApplicationType === 'Book Chapter') || (!!data.bookTitleForChapter && data.bookTitleForChapter.length > 2), { message: 'Book title is required for a book chapter.', path: ['bookTitleForChapter'] })
  .refine(data => data.claimType !== 'Books' || !!data.publisherName, { message: 'Publisher name is required.', path: ['publisherName'] })
  .refine(data => data.claimType !== 'Books' || data.isSelfPublished !== undefined, { message: 'This field is required.', path: ['isSelfPublished'] })
  .refine(data => data.claimType !== 'Books' || !!data.publisherType, { message: 'Publisher type is required.', path: ['publisherType'] })
  .refine(data => data.claimType !== 'Books' || !!data.isbn, { message: 'ISBN is required.', path: ['isbn'] })
  .refine(data => data.claimType !== 'Books' || (!!data.bookProof && data.bookProof.length > 0), { message: 'Proof of book/chapter is required.', path: ['bookProof'] })
  .refine(data => data.claimType !== 'Books' || data.bookSelfDeclaration === true, { message: 'You must agree to the self-declaration.', path: ['bookSelfDeclaration'] });

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

const conferenceVenueOptions = {
    'International': ['India', 'Indian Subcontinent', 'South Korea, Japan, Australia and Middle East', 'Europe', 'African/South American/North American'],
    'National': ['India'],
    'Regional/State': ['India'],
}

const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};


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
      benefitMode: 'incentives',
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
  const conferenceType = form.watch('conferenceType');
  const conferenceVenue = form.watch('conferenceVenue');
  const patentFiledFromIprCell = form.watch('patentFiledFromIprCell');
  const conferenceMode = form.watch('conferenceMode');
  const wonPrize = form.watch('wonPrize');
  const bookApplicationType = form.watch('bookApplicationType');
  const isScopusIndexed = form.watch('isScopusIndexed');
  
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

        const govtFundingRequestProofUrl = await uploadFileHelper(data.govtFundingRequestProof?.[0], 'conference-funding-proof');
        const patentApprovalProofUrl = await uploadFileHelper(data.patentApprovalProof?.[0], 'patent-approval');
        const patentForm1Url = await uploadFileHelper(data.patentForm1?.[0], 'patent-form1');
        const patentGovtReceiptUrl = await uploadFileHelper(data.patentGovtReceipt?.[0], 'patent-govt-receipt');
        const abstractUrl = await uploadFileHelper(data.abstractUpload?.[0], 'conference-abstract');
        const registrationFeeProofUrl = await uploadFileHelper(data.registrationFeeProof?.[0], 'conference-reg-proof');
        const participationCertificateUrl = await uploadFileHelper(data.participationCertificate?.[0], 'conference-cert');
        const prizeProofUrl = await uploadFileHelper(data.prizeProof?.[0], 'conference-prize-proof');
        const travelReceiptsUrl = await uploadFileHelper(data.travelReceipts?.[0], 'conference-travel-receipts');
        const bookProofUrl = await uploadFileHelper(data.bookProof?.[0], 'book-proof');
        const scopusProofUrl = await uploadFileHelper(data.scopusProof?.[0], 'book-scopus-proof');


        const claimData: Omit<IncentiveClaim, 'id'> = {
            ...data,
            govtFundingRequestProofUrl,
            patentApprovalProofUrl,
            patentForm1Url,
            patentGovtReceiptUrl,
            abstractUrl,
            registrationFeeProofUrl,
            participationCertificateUrl,
            prizeProofUrl,
            travelReceiptsUrl,
            bookProofUrl,
            scopusProofUrl,
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
    } catch (error: any) {
        console.error('Error submitting claim: ', error);
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to submit claim. Please try again.' });
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
                        <SelectItem value="Conference Presentations">Assistance for Paper Presentation/Workshop/FDP/STTP</SelectItem>
                        <SelectItem value="Books">Books</SelectItem>
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
                            <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSubmitting || bankDetailsMissing}>
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
                    <FormField name="orcidId" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Your ORCID ID</FormLabel><FormControl><Input placeholder="e.g., 0000-0002-1825-0097" {...field} /></FormControl><FormMessage /></FormItem> )} />
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
                     <FormField control={form.control} name="patentSelfDeclaration" render={({ field }) => ( <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Self Declaration</FormLabel><FormMessage /></div></FormItem> )} />
                 </div>
            )}

            {claimType === 'Conference Presentations' && (
                <div className="rounded-lg border p-4 space-y-6 animate-in fade-in-0">
                    <div>
                        <h3 className="font-semibold text-sm -mb-2">EVENT &amp; PRESENTATION DETAILS</h3>
                        <Separator className="mt-4"/>
                        <div className="space-y-4 mt-4">
                            <FormField name="conferencePaperTitle" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Paper Title</FormLabel><FormControl><Input placeholder="Title of the paper presented" {...field} /></FormControl><FormMessage /></FormItem> )} />
                            <FormField name="conferenceName" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Conference/Event Name</FormLabel><FormControl><Input placeholder="Full name of the conference" {...field} /></FormControl><FormMessage /></FormItem> )} />
                            <FormField name="organizerName" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Organizer Name</FormLabel><FormControl><Input placeholder="e.g., IEEE, Springer" {...field} /></FormControl><FormMessage /></FormItem> )} />
                             <FormField name="eventWebsite" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Event Website</FormLabel><FormControl><Input type="url" placeholder="https://example.com" {...field} /></FormControl><FormMessage /></FormItem> )} />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <FormField name="conferenceDate" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Conference Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem> )} />
                               <FormField name="presentationDate" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Your Presentation Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem> )} />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField name="conferenceType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Conference Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="International">International</SelectItem><SelectItem value="National">National</SelectItem><SelectItem value="Regional/State">Regional/State</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                                <FormField name="presentationType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Presentation Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Oral">Oral</SelectItem><SelectItem value="Poster">Poster</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                            </div>
                             <FormField
                                control={form.control}
                                name="conferenceVenue"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Conference Venue/Location</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value} disabled={!conferenceType}>
                                            <FormControl>
                                                <SelectTrigger><SelectValue placeholder="Select venue" /></SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {(conferenceVenueOptions[conferenceType as keyof typeof conferenceVenueOptions] || []).map(venue => (
                                                    <SelectItem key={venue} value={venue}>{venue}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField name="conferenceMode" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Presentation Mode</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Online" /></FormControl><FormLabel className="font-normal">Online</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Offline" /></FormControl><FormLabel className="font-normal">Offline</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                             {conferenceMode === 'Online' && (
                                <FormField name="onlinePresentationOrder" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Online Presentation Order</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select order" /></SelectTrigger></FormControl><SelectContent><SelectItem value="First">First</SelectItem><SelectItem value="Second">Second</SelectItem><SelectItem value="Third">Third</SelectItem><SelectItem value="Additional">Additional</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                             )}
                            <FormField name="abstractUpload" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach Full Abstract (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormMessage /></FormItem> )} />
                            <FormField name="participationCertificate" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach Participation/Presentation Certificate (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormMessage /></FormItem> )} />
                        </div>
                    </div>

                     <div>
                        <h3 className="font-semibold text-sm -mb-2">EXPENSE &amp; TRAVEL DETAILS</h3>
                        <Separator className="mt-4"/>
                        <div className="space-y-4 mt-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField name="registrationFee" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Registration Fee (INR)</FormLabel><FormControl><Input type="number" placeholder="e.g., 5000" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                <FormField name="registrationFeeProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Proof of Registration Fee Payment</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormMessage /></FormItem> )} />
                            </div>
                            {conferenceMode === 'Offline' && (
                                <div className="space-y-4">
                                    <FormField name="travelPlaceVisited" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Place Visited</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                    <FormField name="travelMode" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Travel Mode</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select travel mode" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Bus">Bus</SelectItem><SelectItem value="Train">Train</SelectItem><SelectItem value="Air">Air</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                                    <FormField name="travelFare" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Travel Fare Incurred (INR)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                    <FormField name="travelReceipts" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach All Tickets/Travel Receipts</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormMessage /></FormItem> )} />
                                </div>
                            )}
                            {conferenceVenue && conferenceVenue !== 'India' && (
                                <FormField name="govtFundingRequestProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Proof of Govt. Funding Request</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormDescription>Required for conferences outside India.</FormDescription><FormMessage /></FormItem> )} />
                            )}
                        </div>
                     </div>

                    <div>
                        <h3 className="font-semibold text-sm -mb-2">DECLARATIONS</h3>
                        <Separator className="mt-4"/>
                        <div className="space-y-4 mt-4">
                           <FormField name="wasPresentingAuthor" control={form.control} render={({ field }) => ( <FormItem><div className="flex items-center justify-between"><FormLabel>Were you the presenting author?</FormLabel><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></div><FormMessage /></FormItem> )} />
                           <FormField name="isPuNamePresent" control={form.control} render={({ field }) => ( <FormItem><div className="flex items-center justify-between"><FormLabel>Is "Parul University" name present in the paper?</FormLabel><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></div><FormMessage /></FormItem> )} />
                           <FormField name="wonPrize" control={form.control} render={({ field }) => ( <FormItem><div className="flex items-center justify-between"><FormLabel>Did your paper win a prize?</FormLabel><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></div><FormMessage /></FormItem> )} />
                           {wonPrize && (
                             <div className="space-y-4 pl-4 border-l-2">
                                <FormField name="prizeDetails" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Prize Details</FormLabel><FormControl><Input placeholder="e.g., Best Paper Award" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                <FormField name="prizeProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach Prize Certificate (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormMessage /></FormItem> )} />
                             </div>
                           )}
                           <FormField name="attendedOtherConference" control={form.control} render={({ field }) => ( <FormItem><div className="flex items-center justify-between"><FormLabel>Have you attended any other conference this year?</FormLabel><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></div><FormMessage /></FormItem> )} />
                            <FormField
                              control={form.control}
                              name="conferenceSelfDeclaration"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                  <FormControl>
                                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                  </FormControl>
                                  <div className="space-y-1 leading-none">
                                    <FormLabel>Self Declaration</FormLabel>
                                    <FormMessage />
                                    <p className="text-xs text-muted-foreground">
                                        I hereby confirm that I have not applied/claimed for any incentive for the same application/publication earlier & Certified that I have availed only this conference in the calendar year.
                                    </p>
                                  </div>
                                </FormItem>
                              )}
                            />
                        </div>
                    </div>
                </div>
            )}

            {claimType === 'Books' && (
              <div className="rounded-lg border p-4 space-y-6 animate-in fade-in-0">
                  <h3 className="font-semibold text-sm -mb-2">BOOK/BOOK CHAPTER DETAILS</h3>
                  <Separator />

                  <FormField name="orcidId" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Your ORCID ID</FormLabel><FormControl><Input placeholder="e.g., 0000-0002-1825-0097" {...field} /></FormControl><FormMessage /></FormItem> )} />

                  <FormField name="bookApplicationType" control={form.control} render={({ field }) => (
                      <FormItem className="space-y-3">
                          <FormLabel>Type of Application</FormLabel>
                          <FormControl>
                              <RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6">
                                  <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Book Chapter" /></FormControl><FormLabel className="font-normal">Book Chapter Publication</FormLabel></FormItem>
                                  <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Book" /></FormControl><FormLabel className="font-normal">Book Publication</FormLabel></FormItem>
                              </RadioGroup>
                          </FormControl>
                          <FormMessage />
                      </FormItem>
                  )} />

                  <FormField name="publicationTitle" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Title of the {bookApplicationType || 'Publication'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />

                  {bookApplicationType === 'Book Chapter' && (
                    <FormField name="bookTitleForChapter" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Title of the Book (for Book Chapter)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                  )}

                  <FormField name="bookAuthors" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Name of Author(s)</FormLabel><FormControl><Textarea placeholder="Comma-separated list of authors" {...field} /></FormControl><FormMessage /></FormItem> )} />
                  
                  {bookApplicationType === 'Book Chapter' && (
                    <FormField name="bookEditor" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Name of the Editor (for Book Chapter)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField name="totalPuAuthors" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Total Authors from PU</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                      <FormField name="totalPuStudents" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Total Students from PU</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                  </div>
                  
                  <FormField name="puStudentNames" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Name of Students from PU</FormLabel><FormControl><Textarea placeholder="Comma-separated list of student names" {...field} /></FormControl><FormMessage /></FormItem> )} />

                  {bookApplicationType === 'Book Chapter' ? (
                     <FormField name="bookChapterPages" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Total No. of pages of the book chapter</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                  ) : (
                     <FormField name="bookTotalPages" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Total No. of pages of the book</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                  )}

                  <FormField name="publisherName" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Name of the publisher</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />

                  <FormField name="isSelfPublished" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Whether self Published</FormLabel><FormControl><RadioGroup onValueChange={(val) => field.onChange(val === 'true')} value={String(field.value)} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="true" /></FormControl><FormLabel className="font-normal">Yes</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="false" /></FormControl><FormLabel className="font-normal">No</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                  
                  <FormField name="publisherType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Whether National/International Publisher</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="National" /></FormControl><FormLabel className="font-normal">National</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="International" /></FormControl><FormLabel className="font-normal">International</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />

                  <FormField name="isScopusIndexed" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Whether Scopus Indexed</FormLabel><FormControl><RadioGroup onValueChange={(val) => field.onChange(val === 'true')} value={String(field.value)} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="true" /></FormControl><FormLabel className="font-normal">Yes</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="false" /></FormControl><FormLabel className="font-normal">No</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />

                  {bookApplicationType === 'Book' && <FormField name="authorRole" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Whether acting by Editor / Author</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Editor" /></FormControl><FormLabel className="font-normal">Editor</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Author" /></FormControl><FormLabel className="font-normal">Author</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />}
                  
                  <FormField name="isbn" control={form.control} render={({ field }) => ( <FormItem><FormLabel>ISBN Number of the Book</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />

                  {bookApplicationType === 'Book' && <FormField name="bookType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Whether Textbook or Reference Book</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Textbook" /></FormControl><FormLabel className="font-normal">Textbook</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Reference Book" /></FormControl><FormLabel className="font-normal">Reference Book</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />}

                  <FormField name="publisherWebsite" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Publisher Website</FormLabel><FormControl><Input type="url" placeholder="https://example.com" {...field} /></FormControl><FormMessage /></FormItem> )} />
                  
                  <FormField name="publicationOrderInYear" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Is this your First/Second/Third Chapter/Book in the calendar year?</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select publication order" /></SelectTrigger></FormControl><SelectContent><SelectItem value="First">First</SelectItem><SelectItem value="Second">Second</SelectItem><SelectItem value="Third">Third</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />

                  <FormField name="bookProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach copy of Book / Book Chapter (First Page, Publisher Page, Index, Abstract) (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormMessage /></FormItem> )} />

                  {isScopusIndexed && <FormField name="scopusProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach Proof of indexed in Scopus (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormMessage /></FormItem> )} />}

                   <FormField control={form.control} name="bookSelfDeclaration" render={({ field }) => ( <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Self Declaration</FormLabel><FormMessage /><p className="text-xs text-muted-foreground">I hereby confirm that I have not applied/claimed for any incentive for the same application/publication earlier.</p></div></FormItem> )} />
              </div>
            )}


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
