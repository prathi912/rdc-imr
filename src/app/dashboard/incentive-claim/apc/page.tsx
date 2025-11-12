

'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { collection, addDoc, doc, setDoc, getDoc } from 'firebase/firestore';
import type { User, IncentiveClaim, Author } from '@/types';
import { uploadFileToServer } from '@/app/actions';
import { findUserByMisId } from '@/app/userfinding';
import { Loader2, AlertCircle, Info, Plus, Trash2, Search, Bot } from 'lucide-react';
import { submitIncentiveClaim } from '@/app/incentive-approval-actions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateApcIncentive } from '@/app/incentive-calculation';
import { fetchAdvancedScopusData } from '@/app/scopus-actions';
import { fetchScienceDirectData } from '@/app/sciencedirect-actions';
import { fetchWosDataByUrl } from '@/app/wos-actions';

const authorSchema = z.object({
    name: z.string().min(2, 'Author name is required.'),
    email: z.string().email('Invalid email format.'),
    uid: z.string().optional().nullable(),
    role: z.enum(['First Author', 'Corresponding Author', 'Co-Author', 'First & Corresponding Author', "Presenting Author", "First & Presenting Author"]),
    isExternal: z.boolean(),
    status: z.enum(['approved', 'pending', 'Applied'])
});

const apcSchema = z.object({
  apcTypeOfArticle: z.string({ required_error: 'Please select an article type.' }),
  apcOtherArticleType: z.string().optional(),
  apcIndexingStatus: z.array(z.string()).refine(value => value.some(item => item), { message: "You have to select at least one indexing status." }),
  apcQRating: z.enum(['Q1', 'Q2', 'Q3', 'Q4']).optional(),
  doi: z.string().optional(),
  apcPaperTitle: z.string().min(5, 'Paper title is required.'),
  authors: z.array(authorSchema).min(1, 'At least one author is required.')
  .refine(data => {
      const firstAuthors = data.filter(author => author.role === 'First Author' || author.role === 'First & Corresponding Author');
      return firstAuthors.length <= 1;
  }, { message: 'Only one author can be designated as the First Author.', path: ['authors'] }),
  apcTotalStudentAuthors: z.coerce.number().nonnegative("Number of students cannot be negative.").optional(),
  apcStudentNames: z.string().optional(),
  apcJournalDetails: z.string().min(5, 'Journal details are required.'),
  apcApcWaiverRequested: z.boolean().optional(),
  apcApcWaiverProof: z.any().optional(),
  apcJournalWebsite: z.string().url('Please enter a valid URL.'),
  apcIssnNo: z.string().min(5, 'ISSN is required.'),
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
}).refine(data => !data.apcApcWaiverRequested || (!!data.apcApcWaiverProof && data.apcApcWaiverProof.length > 0), {
  message: 'Proof of waiver request is required.',
  path: ['apcApcWaiverProof'],
});

type ApcFormValues = z.infer<typeof apcSchema>;

const articleTypes = ['Research Paper Publication', 'Review Article', 'Letter to Editor', 'Other'];
const coAuthorRoles: Author['role'][] = ['First Author', 'Corresponding Author', 'Co-Author', 'First & Corresponding Author'];

const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};

const SPECIAL_POLICY_FACULTIES = [
    "Faculty of Applied Sciences",
    "Faculty of Medicine",
    "Faculty of Homoeopathy",
    "Faculty of Ayurved",
    "Faculty of Nursing",
    "Faculty of Pharmacy",
    "Faculty of Physiotherapy",
    "Faculty of Public Health",
    "Faculty of Engineering & Technology"
];


export function ApcForm() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false);
  const [orcidOrMisIdMissing, setOrcidOrMisIdMissing] = useState(false);
  const [calculatedIncentive, setCalculatedIncentive] = useState<number | null>(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState(true);
  
  const [coPiSearchTerm, setCoPiSearchTerm] = useState('');
  const [foundCoPi, setFoundCoPi] = useState<{ uid?: string; name: string; email: string; } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [externalAuthorName, setExternalAuthorName] = useState('');
  const [externalAuthorEmail, setExternalAuthorEmail] = useState('');
  const [externalAuthorRole, setExternalAuthorRole] = useState<Author['role']>('Co-Author');

  const form = useForm<ApcFormValues>({
    resolver: zodResolver(apcSchema),
    defaultValues: {
      apcTypeOfArticle: '',
      apcOtherArticleType: '',
      apcIndexingStatus: [],
      apcQRating: undefined,
      doi: '',
      apcPaperTitle: '',
      authors: [],
      apcTotalStudentAuthors: 0,
      apcStudentNames: '',
      apcJournalDetails: '',
      apcApcWaiverRequested: false,
      apcJournalWebsite: '',
      apcIssnNo: '',
      apcSciImpactFactor: 0,
      apcPuNameInPublication: false,
      apcAmountClaimed: 0,
      apcTotalAmount: 0,
      apcSelfDeclaration: false,
    },
  });

  const { fields, append, remove, update } = useFieldArray({
      control: form.control,
      name: "authors",
  });

  const isSpecialFaculty = useMemo(() =>
    user?.faculty ? SPECIAL_POLICY_FACULTIES.includes(user.faculty) : false,
    [user?.faculty]
  );

  const availableIndexingStatuses = useMemo(() => {
    let statuses = ['Scopus', 'Web of science'];
    if (!isSpecialFaculty) {
        statuses.push('Web of Science indexed journals (ESCI)', 'UGC-CARE Group-I');
    }
    return statuses;
  }, [isSpecialFaculty]);

  const formValues = form.watch();
  
  const calculate = useCallback(async () => {
    if (user && user.faculty) {
      const result = await calculateApcIncentive(formValues, isSpecialFaculty);
      if (result.success) {
        setCalculatedIncentive(result.amount ?? null);
      } else {
        console.error("Incentive calculation failed:", result.error);
        setCalculatedIncentive(null);
      }
    }
  }, [formValues, user, isSpecialFaculty]);

  useEffect(() => {
    const subscription = form.watch((value, { name, type }) => {
        const fieldsForRecalculation = [
            'apcTotalAmount', 'apcIndexingStatus', 'apcQRating', 'authors'
        ];
        if (type === 'change' && fieldsForRecalculation.includes(name as string)) {
            calculate();
        }
    });
    return () => subscription.unsubscribe();
  }, [form, calculate]);


  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      setBankDetailsMissing(!parsedUser.bankDetails);
      setOrcidOrMisIdMissing(!parsedUser.orcidId || !parsedUser.misId);

      const isUserAlreadyAdded = form.getValues('authors').some(field => field.email.toLowerCase() === parsedUser.email.toLowerCase());
      if (!isUserAlreadyAdded) {
        append({ 
            name: parsedUser.name, 
            email: parsedUser.email,
            uid: parsedUser.uid,
            role: 'First Author',
            isExternal: false,
            status: 'approved',
        });
      }
    }
    const claimId = searchParams.get('claimId');
    if (!claimId) {
        setIsLoadingDraft(false);
    }
  }, [append, form, searchParams]);
  
  useEffect(() => {
    const claimId = searchParams.get('claimId');
    if (claimId && user) {
        const fetchDraft = async () => {
            setIsLoadingDraft(true);
            try {
                const claimRef = doc(db, 'incentiveClaims', claimId);
                const claimSnap = await getDoc(claimRef);
                if (claimSnap.exists()) {
                    const draftData = claimSnap.data() as IncentiveClaim;
                    form.reset({
                        ...draftData,
                        apcApcWaiverProof: undefined,
                        apcPublicationProof: undefined,
                        apcInvoiceProof: undefined,
                    });
                } else {
                    toast({ variant: 'destructive', title: 'Draft Not Found' });
                }
            } catch (error) {
                toast({ variant: 'destructive', title: 'Error Loading Draft' });
            } finally {
                setIsLoadingDraft(false);
            }
        };
        fetchDraft();
    }
  }, [searchParams, user, form, toast]);
  
  const watchAuthors = form.watch('authors');
  const firstAuthorExists = useMemo(() => 
    watchAuthors.some(author => author.role === 'First Author' || author.role === 'First & Corresponding Author'),
    [watchAuthors]
  );
  
  const getAvailableRoles = (currentAuthor?: Author) => {
    const isCurrentAuthorFirst = currentAuthor && (currentAuthor.role === 'First Author' || currentAuthor.role === 'First & Corresponding Author');
    if (firstAuthorExists && !isCurrentAuthorFirst) {
      return coAuthorRoles.filter(role => role !== 'First Author' && role !== 'First & Corresponding Author');
    }
    return coAuthorRoles;
  };

  const watchArticleType = form.watch('apcTypeOfArticle');
  const watchWaiverRequested = form.watch('apcApcWaiverRequested');
  const indexType = form.watch("apcIndexingStatus");

  const handleFetchData = async (source: 'scopus' | 'wos' | 'sciencedirect') => {
    const doi = form.getValues('doi');
    if (!doi) {
      toast({ variant: 'destructive', title: 'No DOI Provided', description: 'Please enter a DOI to fetch data.' });
      return;
    }
    if (!user) {
      toast({ variant: 'destructive', title: 'Not Logged In', description: 'Could not identify the claimant.' });
      return;
    }

    setIsFetching(true);
    toast({ title: `Fetching ${source.toUpperCase()} Data`, description: 'Please wait, this may take a moment...' });
    
    try {
        let result;
        if (source === 'scopus') {
            result = await fetchAdvancedScopusData(doi, user.name);
        } else if (source === 'wos') {
            result = await fetchWosDataByUrl(doi, user.name);
        } else {
            result = await fetchScienceDirectData(doi, user.name);
        }

        if (result.success && result.data) {
            form.setValue('apcPaperTitle', result.data.paperTitle || '');
            form.setValue('apcJournalDetails', result.data.journalName || '');
            form.setValue('apcJournalWebsite', result.data.journalWebsite || '');
            form.setValue('apcIssnNo', result.data.printIssn || result.data.electronicIssn || '');
            
            toast({ title: 'Success', description: `Form fields have been pre-filled from ${source.toUpperCase()}.` });
            
            if ('warning' in result && result.warning) {
                toast({
                    variant: 'default',
                    title: 'Heads Up',
                    description: result.warning,
                    duration: 7000,
                });
            }

        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || `Failed to fetch data from ${source.toUpperCase()}.` });
        }
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'An unexpected error occurred.' });
    } finally {
        setIsFetching(false);
    }
  };

  const handleSearchCoPi = async () => {
    if (!coPiSearchTerm) return;
    setIsSearching(true);
    setFoundCoPi(null);
    try {
        const result = await findUserByMisId(coPiSearchTerm);
        if (result.success && result.users && result.users.length > 0) {
            const user = result.users[0];
            setFoundCoPi({ ...user, uid: user.uid || undefined });
        } else {
            toast({ variant: 'destructive', title: 'User Not Found', description: result.error });
        }
    } catch (error) {
        toast({ variant: 'destructive', title: 'Search Failed', description: 'An error occurred while searching.' });
    } finally {
        setIsSearching(false);
    }
  };

  const handleAddCoPi = () => {
    if (foundCoPi && !fields.some(field => field.email.toLowerCase() === foundCoPi.email.toLowerCase())) {
        if (user && foundCoPi.email.toLowerCase() === user.email.toLowerCase()) {
            toast({ variant: 'destructive', title: 'Cannot Add Self', description: 'You are already listed as an author.' });
            return;
        }
        append({ 
            name: foundCoPi.name, 
            email: foundCoPi.email,
            uid: foundCoPi.uid,
            role: 'Co-Author',
            isExternal: !foundCoPi.uid,
            status: 'pending',
        });
    }
    setFoundCoPi(null);
    setCoPiSearchTerm('');
  };
  
   const addExternalAuthor = () => {
        const name = externalAuthorName.trim();
        const email = externalAuthorEmail.trim().toLowerCase();
        if (!name || !email) {
            toast({ title: 'Name and email are required for external authors', variant: 'destructive' });
            return;
        }
         if (fields.some(a => a.email.toLowerCase() === email)) {
            toast({ title: 'Author already added', variant: 'destructive' });
            return;
        }
        append({ name, email, role: externalAuthorRole, isExternal: true, uid: null, status: 'pending' });
        setExternalAuthorName('');
        setExternalAuthorEmail('');
        setExternalAuthorRole('Co-Author'); // Reset role selector
    };

  const removeAuthor = (index: number) => {
    const authorToRemove = fields[index];
    if (authorToRemove.email === user?.email) {
      toast({ variant: 'destructive', title: 'Action not allowed', description: 'You cannot remove yourself as the primary author.' });
      return;
    }
    remove(index);
  };

  const updateAuthorRole = (index: number, role: Author['role']) => {
    const author = fields[index];
    // Check for conflict before updating
    if ((role === 'First Author' || role === 'First & Corresponding Author') && firstAuthorExists && author.role !== 'First Author' && author.role !== 'First & Corresponding Author') {
        toast({ title: 'Conflict', description: 'Another author is already the First Author.', variant: 'destructive'});
        return;
    }
    update(index, { ...author, role });
  };


  async function handleSave(status: 'Draft' | 'Pending') {
    if (!user || !user.faculty) {
      toast({ variant: 'destructive', title: 'Error', description: 'User information not found. Please log in again.' });
      return;
    }
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

        const { apcPublicationProof, apcInvoiceProof, apcApcWaiverProof, ...restOfData } = data;

        const claimData: Omit<IncentiveClaim, 'id' | 'claimId'> = {
            ...restOfData,
            calculatedIncentive,
            misId: user.misId || null,
            orcidId: user.orcidId || null,
            claimType: 'Seed Money for APC',
            benefitMode: 'reimbursement',
            uid: user.uid,
            userName: user.name,
            userEmail: user.email,
            faculty: user.faculty,
            status,
            submissionDate: new Date().toISOString(),
            bankDetails: user.bankDetails || null,
        };

        if (apcApcWaiverProofUrl) claimData.apcApcWaiverProofUrl = apcApcWaiverProofUrl;
        if (apcPublicationProofUrl) claimData.apcPublicationProofUrl = apcPublicationProofUrl;
        if (apcInvoiceProofUrl) claimData.apcInvoiceProofUrl = apcInvoiceProofUrl;
        
        const result = await submitIncentiveClaim(claimData);

        if (!result.success) {
            throw new Error(result.error);
        }
        
        const claimId = searchParams.get('claimId') || result.claimId;

        if (status === 'Draft') {
          toast({ title: 'Draft Saved!', description: "You can continue editing from the 'Incentive Claim' page." });
          router.push(`/dashboard/incentive-claim/apc?claimId=${claimId}`);
        } else {
          toast({ title: 'Success', description: 'Your incentive claim for APC has been submitted.' });
          router.push('/dashboard/incentive-claim');
        }
    } catch (error: any) {
      console.error('Error submitting claim: ', error);
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to submit claim. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingDraft) {
    return <Card className="p-8 flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></Card>;
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

            <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>APC Reimbursement Policy</AlertTitle>
                <AlertDescription>
                    Admissible APC = (Maximum APC as per policy ÷ total number of PU authors).
                    The author must request the Editor for an APC waiver and submit the proof along with this application.
                </AlertDescription>
            </Alert>


            <div className="rounded-lg border p-4 space-y-4 animate-in fade-in-0">
                <h3 className="font-semibold text-sm -mb-2">ARTICLE & JOURNAL DETAILS</h3>
                <Separator />
                <FormField control={form.control} name="apcTypeOfArticle" render={({ field }) => ( <FormItem><FormLabel>Type of Article</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-6">{articleTypes.map(type => (<FormItem key={type} className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value={type} /></FormControl><FormLabel className="font-normal">{type}</FormLabel></FormItem>))}</RadioGroup></FormControl><FormMessage /></FormItem> )} />
                {watchArticleType === 'Other' && <FormField name="apcOtherArticleType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Please specify other article type</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />}
                <FormField name="apcIndexingStatus" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Indexing/Listing status of the Journal</FormLabel>{availableIndexingStatuses.map(item => (<FormField key={item} control={form.control} name="apcIndexingStatus" render={({ field }) => ( <FormItem key={item} className="flex flex-row items-start space-x-3 space-y-0"><FormControl><Checkbox checked={field.value?.includes(item)} onCheckedChange={(checked) => { return checked ? field.onChange([...(field.value || []), item]) : field.onChange(field.value?.filter(value => value !== item)); }} /></FormControl><FormLabel className="font-normal">{item}</FormLabel></FormItem> )} />))}<FormMessage /></FormItem> )} />
                <FormField name="apcQRating" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Q Rating of the Journal</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Q Rating" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Q1">Q1</SelectItem><SelectItem value="Q2">Q2</SelectItem><SelectItem value="Q3">Q3</SelectItem><SelectItem value="Q4">Q4</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />

                <Separator />

                <FormField
                  control={form.control}
                  name="doi"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>DOI (Digital Object Identifier)</FormLabel>
                      <div className="flex items-center gap-2">
                          <FormControl>
                              <Input placeholder="Enter DOI to auto-fill details" {...field} disabled={isSubmitting} />
                          </FormControl>
                          <Button type="button" variant="outline" onClick={() => handleFetchData('scopus')} disabled={isSubmitting || isFetching || !form.getValues('doi')} title="Fetch from Scopus"><Bot className="h-4 w-4" /> Scopus</Button>
                          <Button type="button" variant="outline" onClick={() => handleFetchData('wos')} disabled={isSubmitting || isFetching || !form.getValues('doi')} title="Fetch from WoS"><Bot className="h-4 w-4" /> WoS</Button>
                          <Button type="button" variant="outline" onClick={() => handleFetchData('sciencedirect')} disabled={isSubmitting || isFetching || !form.getValues('doi')} title="Fetch from ScienceDirect"><Bot className="h-4 w-4" /> SCI</Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField name="apcPaperTitle" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Title of the Paper</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem> )} />
                
                <div className="space-y-4">
                    <FormLabel>Author(s) & Roles</FormLabel>
                     {fields.map((field, index) => (
                        <div key={field.id} className="grid grid-cols-1 md:grid-cols-3 gap-4 border p-3 rounded-md items-center">
                            <div className="md:col-span-2">
                                <p className="font-medium text-sm">{field.name} {field.isExternal && <span className="text-xs text-muted-foreground">(External)</span>}</p>
                                <p className="text-xs text-muted-foreground">{field.email}</p>
                            </div>
                            <Select onValueChange={(value) => updateAuthorRole(index, value as Author['role'])} value={field.role}>
                                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                                <SelectContent>{getAvailableRoles(form.getValues(`authors.${index}`)).map(role => (<SelectItem key={role} value={role}>{role}</SelectItem>))}</SelectContent>
                            </Select>
                            {index > 0 && (
                              <Button type="button" variant="destructive" className="md:col-start-4 justify-self-end mt-2" onClick={() => remove(index)}><Trash2 className="h-4 w-4 mr-2" /> Remove</Button> 
                            )}
                        </div>
                    ))}
                     <div className="space-y-2 p-3 border rounded-md">
                        <FormLabel className="text-sm">Add PU Co-Author</FormLabel>
                        <div className="flex items-center gap-2">
                            <Input placeholder="Search by Co-PI's MIS ID" value={coPiSearchTerm} onChange={(e) => setCoPiSearchTerm(e.target.value)} />
                            <Button type="button" onClick={handleSearchCoPi} disabled={isSearching}>{isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}</Button>
                        </div>
                        {foundCoPi && (
                            <div className="flex items-center justify-between p-2 border rounded-md mt-2 bg-muted/50">
                                <div>
                                    <p className="text-sm">{foundCoPi.name}</p>
                                    {!foundCoPi.uid && <p className="text-xs text-muted-foreground">Not registered, but found in staff data.</p>}
                                </div>
                                <Button type="button" size="sm" onClick={handleAddCoPi}>Add</Button>
                            </div>
                        )}
                    </div>
                     <div className="space-y-2 p-3 border rounded-md">
                        <FormLabel className="text-sm">Add External Co-Author</FormLabel>
                        <div className="flex flex-col md:flex-row gap-2 mt-1">
                            <Input value={externalAuthorName} onChange={(e) => setExternalAuthorName(e.target.value)} placeholder="External author's name"/>
                            <Input value={externalAuthorEmail} onChange={(e) => setExternalAuthorEmail(e.target.value)} placeholder="External author's email"/>
                            <Select value={externalAuthorRole} onValueChange={(value) => setExternalAuthorRole(value as Author['role'])}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>{getAvailableRoles(undefined).map(role => (<SelectItem key={role} value={role}>{role}</SelectItem>))}</SelectContent>
                            </Select>
                            <Button type="button" onClick={addExternalAuthor} variant="outline" size="icon" disabled={!externalAuthorName.trim() || !externalAuthorEmail.trim()}><Plus className="h-4 w-4"/></Button>
                        </div>
                        <FormDescription className="!mt-2 text-destructive text-xs">
                           Important: If an external co-author is found at the approval stage that was not declared here, the claim will be rejected.
                        </FormDescription>
                    </div>
                     <FormMessage>{form.formState.errors.authors?.message || form.formState.errors.authors?.root?.message}</FormMessage>
                </div>

                <FormField name="apcTotalStudentAuthors" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Total Number of Student authors</FormLabel><FormControl><Input type="number" {...field} min="0" /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="apcStudentNames" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Names of Student Authors</FormLabel><FormControl><Textarea placeholder="Comma-separated list of student names" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="apcJournalDetails" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Details of the Journal</FormLabel><FormControl><Textarea placeholder="Name, Vol, Page No., Year, DOI" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="apcJournalWebsite" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Journal Website</FormLabel><FormControl><Input type="url" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="apcIssnNo" control={form.control} render={({ field }) => ( <FormItem><FormLabel>ISSN No.</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="apcSciImpactFactor" control={form.control} render={({ field }) => ( <FormItem><FormLabel>SCI Impact Factor</FormLabel><FormControl><Input type="number" step="any" {...field} min="0" /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="apcPuNameInPublication" control={form.control} render={({ field }) => ( <FormItem><div className="flex items-center justify-between"><FormLabel>Is "PU" name present in the publication?</FormLabel><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></div><FormMessage /></FormItem> )} />
                <FormField name="apcPublicationProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attachment Proof of publication (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} accept="application/pdf" /></FormControl><FormMessage /></FormItem> )} />
            </div>

            <div className="rounded-lg border p-4 space-y-4 animate-in fade-in-0">
                <h3 className="font-semibold text-sm -mb-2">FINANCIAL & DECLARATION DETAILS</h3>
                <Separator />
                <FormField name="apcApcWaiverRequested" control={form.control} render={({ field }) => ( <FormItem><div className="flex items-center justify-between"><FormLabel>Whether APC waiver was requested</FormLabel><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></div><FormMessage /></FormItem> )} />
                {watchWaiverRequested && <FormField name="apcApcWaiverProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>If yes, give proof</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} accept="application/pdf" /></FormControl><FormMessage /></FormItem> )} />}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField name="apcTotalAmount" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Total amount of APC (INR)</FormLabel><FormControl><Input type="number" {...field} min="0" /></FormControl><FormMessage /></FormItem> )} />
                  <FormField name="apcAmountClaimed" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Amount claimed (INR)</FormLabel><FormControl><Input type="number" {...field} min="0" /></FormControl><FormMessage /></FormItem> )} />
                </div>
                 {calculatedIncentive !== null && (
                    <div className="p-4 bg-secondary rounded-md">
                        <p className="text-sm font-medium">Tentative Eligible Incentive Amount: <span className="font-bold text-lg text-primary">₹{calculatedIncentive.toLocaleString('en-IN')}</span></p>
                        <p className="text-xs text-muted-foreground">This is your individual share of the reimbursement based on the policy and number of PU authors.</p>
                    </div>
                )}
                <FormField name="apcInvoiceProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attachment Proof (Invoice, Receipt, Payment Proof & Abstract)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} accept="application/pdf" /></FormControl><FormMessage /></FormItem> )} />
                 <FormField control={form.control} name="apcSelfDeclaration" render={({ field }) => ( <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Self Declaration</FormLabel><FormMessage /><p className="text-xs text-muted-foreground">I hereby confirm that I have not applied/claimed for any incentive for the same application/publication earlier.</p></div></FormItem> )} />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSave('Draft')}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save as Draft
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Submitting...' : 'Submit Claim'}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
