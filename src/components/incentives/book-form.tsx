
'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import type { User, IncentiveClaim, BookCoAuthor, Author } from '@/types';
import { uploadFileToServer } from '@/app/actions';
import { findUserByMisId } from '@/app/userfinding';
import { Loader2, AlertCircle, Plus, Trash2, Search, Edit } from 'lucide-react';
import { submitIncentiveClaim } from '@/app/incentive-approval-actions';
import { calculateBookIncentive } from '@/app/incentive-calculation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';

const bookSchema = z
  .object({
    bookApplicationType: z.enum(['Book Chapter', 'Book'], { required_error: 'Please select an application type.' }),
    publicationTitle: z.string().min(3, 'Title is required.'),
    authors: z.array(z.object({
        name: z.string().min(2, 'Author name is required.'),
        email: z.string().email('Invalid email format.'),
        uid: z.string().optional().nullable(),
        role: z.enum(['First Author', 'Corresponding Author', 'Co-Author', 'First & Corresponding Author']),
        isExternal: z.boolean(),
        status: z.enum(['approved', 'pending', 'Applied']),
    })).min(1, 'At least one author is required.')
    .refine(data => {
        const firstAuthors = data.filter(author => author.role === 'First Author' || author.role === 'First & Corresponding Author');
        return firstAuthors.length <= 1;
    }, { message: 'Only one author can be designated as the First Author.', path: ['authors'] }),
    bookTitleForChapter: z.string().optional(),
    bookEditor: z.string().optional(),
    totalPuStudents: z.coerce.number().optional(),
    puStudentNames: z.string().optional(),
    bookChapterPages: z.coerce.number().optional(),
    bookTotalPages: z.coerce.number().optional(),
    bookTotalChapters: z.coerce.number().optional(),
    chaptersInSameBook: z.coerce.number().optional(),
    publicationYear: z.coerce.number().min(1900, 'Please enter a valid year.').max(new Date().getFullYear(), 'Year cannot be in the future.'),
    publisherName: z.string().min(2, 'Publisher name is required.'),
    publisherCity: z.string().optional(),
    publisherCountry: z.string().optional(),
    publisherType: z.enum(['National', 'International'], { required_error: 'Publisher type is required.' }),
    isScopusIndexed: z.boolean().optional(),
    authorRole: z.enum(['Editor', 'Author']).optional(),
    publicationMode: z.enum(['Print Only', 'Electronic Only', 'Print & Electronic']).optional(),
    isbnPrint: z.string().optional(),
    isbnElectronic: z.string().optional(),
    publisherWebsite: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
    bookProof: z.any().refine((files) => files?.length > 0, 'Proof of publication is required.'),
    scopusProof: z.any().optional(),
    publicationOrderInYear: z.enum(['First', 'Second', 'Third']).optional(),
    bookType: z.enum(['Textbook', 'Reference Book'], { required_error: 'Please select the book type.' }),
    bookSelfDeclaration: z.boolean().refine(val => val === true, { message: 'You must agree to the self-declaration.' }),
  })
  .refine(data => !(data.bookApplicationType === 'Book Chapter') || (!!data.bookTitleForChapter && data.bookTitleForChapter.length > 2), { message: 'Book title is required for a book chapter.', path: ['bookTitleForChapter'] })
  .refine(data => !(data.isScopusIndexed) || (!!data.scopusProof && data.scopusProof.length > 0), { message: 'Proof of Scopus indexing is required if selected.', path: ['scopusProof'] })
  .refine(data => !(data.bookApplicationType === 'Book') || (!!data.publisherCity && data.publisherCity.length > 0), { message: 'Publisher city is required for book publications.', path: ['publisherCity']})
  .refine(data => !(data.bookApplicationType === 'Book') || (!!data.publisherCountry && data.publisherCountry.length > 0), { message: 'Publisher country is required for book publications.', path: ['publisherCountry']})
  .refine(data => !(data.bookApplicationType === 'Book') || !!data.publicationMode, { message: 'Mode of publication is required for book publications.', path: ['publicationMode']})
  .refine(data => !(data.bookApplicationType === 'Book' && (data.publicationMode === 'Print Only' || data.publicationMode === 'Print & Electronic')) || (!!data.isbnPrint && data.isbnPrint.length >= 10), { message: 'A valid Print ISBN is required.', path: ['isbnPrint']})
  .refine(data => !(data.bookApplicationType === 'Book' && (data.publicationMode === 'Electronic Only' || data.publicationMode === 'Print & Electronic')) || (!!data.isbnElectronic && data.isbnElectronic.length >= 10), { message: 'A valid Electronic ISBN is required.', path: ['isbnElectronic']})
  .refine(data => !(data.bookApplicationType === 'Book') || !!data.authorRole, { message: 'Applicant type is required for book publications.', path: ['authorRole'] })
  .refine(data => !(data.bookApplicationType === 'Book') || (data.bookTotalChapters !== undefined && data.bookTotalChapters >= 0), { message: 'Total chapters are required for book publications.', path: ['bookTotalChapters'] });

type BookFormValues = z.infer<typeof bookSchema>;

const coAuthorRoles: Author['role'][] = ['First Author', 'Corresponding Author', 'Co-Author', 'First & Corresponding Author'];

const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};

function ReviewDetails({ data, onEdit }: { data: BookFormValues; onEdit: () => void }) {
    const renderDetail = (label: string, value?: string | number | boolean | string[] | Author[]) => {
        if (!value && value !== 0 && value !== false) return null;
        
        let displayValue: React.ReactNode = String(value);
        if (typeof value === 'boolean') {
            displayValue = value ? 'Yes' : 'No';
        }
        if (Array.isArray(value)) {
            if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null && 'name' in value[0]) {
                 displayValue = (
                    <div className="border rounded-lg overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Author Name</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Email</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(value as Author[]).map((author, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell>{author.name}</TableCell>
                                        <TableCell><Badge variant="secondary">{author.role}</Badge></TableCell>
                                        <TableCell>{author.email}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                );
            } else {
                displayValue = (value as string[]).join(', ');
            }
        }

        return (
            <div className="grid grid-cols-3 gap-2 py-1.5 items-start">
                <dt className="font-semibold text-muted-foreground col-span-1">{label}</dt>
                <dd className="col-span-2">{displayValue}</dd>
            </div>
        );
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Review Your Application</CardTitle>
                        <CardDescription>Please review the details below before final submission.</CardDescription>
                    </div>
                    <Button variant="outline" onClick={onEdit}><Edit className="h-4 w-4 mr-2" /> Edit</Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {renderDetail("Application Type", data.bookApplicationType)}
                {renderDetail("Title", data.publicationTitle)}
                {renderDetail("Book Title (for Chapter)", data.bookTitleForChapter)}
                {renderDetail("Authors", data.authors)}
                {renderDetail("Editor", data.bookEditor)}
                {renderDetail("Total PU Students", data.totalPuStudents)}
                {renderDetail("PU Student Names", data.puStudentNames)}
                {renderDetail("Total Chapters", data.bookTotalChapters)}
                {renderDetail("Chapter Pages", data.bookChapterPages)}
                {renderDetail("Total Pages", data.bookTotalPages)}
                {renderDetail("Year of Publication", data.publicationYear)}
                {renderDetail("Publisher", data.publisherName)}
                {renderDetail("Publisher City", data.publisherCity)}
                {renderDetail("Publisher Country", data.publisherCountry)}
                {renderDetail("Publisher Type", data.publisherType)}
                {renderDetail("Book Type", data.bookType)}
                {renderDetail("Scopus Indexed", data.isScopusIndexed)}
                {renderDetail("Applicant Role", data.authorRole)}
                {renderDetail("Publication Mode", data.publicationMode)}
                {renderDetail("Print ISBN", data.isbnPrint)}
                {renderDetail("Electronic ISBN", data.isbnElectronic)}
                {renderDetail("Publisher Website", data.publisherWebsite)}
                {renderDetail("Publication Order in Year", data.publicationOrderInYear)}
                {renderDetail("Proof of Publication", data.bookProof?.[0]?.name)}
                {renderDetail("Scopus Proof", data.scopusProof?.[0]?.name)}
            </CardContent>
        </Card>
    );
}

export function BookForm() {
  const { toast } = useToast();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false);
  
  const [coPiSearchTerm, setCoPiSearchTerm] = useState('');
  const [foundCoPi, setFoundCoPi] = useState<{ uid?: string; name: string; email: string; } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [externalAuthorName, setExternalAuthorName] = useState('');
  const [externalAuthorEmail, setExternalAuthorEmail] = useState('');
  const [externalAuthorRole, setExternalAuthorRole] = useState<Author['role']>('Co-Author');

  const form = useForm<BookFormValues>({
    resolver: zodResolver(bookSchema),
    defaultValues: {
      bookApplicationType: undefined,
      publicationTitle: '',
      authors: [],
      bookTitleForChapter: '',
      bookEditor: '',
      totalPuStudents: 0,
      puStudentNames: '',
      bookChapterPages: 0,
      bookTotalPages: 0,
      bookTotalChapters: 0,
      chaptersInSameBook: 1,
      publicationYear: new Date().getFullYear(),
      publisherName: '',
      publisherCity: '',
      publisherCountry: '',
      publisherType: undefined,
      isScopusIndexed: false,
      authorRole: undefined,
      publicationMode: undefined,
      isbnPrint: '',
      isbnElectronic: '',
      publisherWebsite: '',
      bookProof: undefined,
      scopusProof: undefined,
      publicationOrderInYear: undefined,
      bookType: undefined,
      bookSelfDeclaration: false,
    },
  });

  const { fields, append, remove, update } = useFieldArray({
      control: form.control,
      name: "authors",
  });

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      if (!parsedUser.bankDetails) {
        setBankDetailsMissing(true);
      }
      
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bookApplicationType = form.watch('bookApplicationType');
  const publicationMode = form.watch('publicationMode');
  const isScopusIndexed = form.watch('isScopusIndexed');
  
  const handleProceedToReview = async () => {
    const isValid = await form.trigger();
    if (isValid) {
      setCurrentStep(2);
    } else {
        toast({
            variant: 'destructive',
            title: 'Validation Error',
            description: 'Please correct the errors before proceeding.',
        });
    }
  };


  async function handleSave(status: 'Draft' | 'Pending') {
    if (!user || !user.faculty) return;
    if (status === 'Pending' && bankDetailsMissing) {
        toast({
            variant: 'destructive',
            title: 'Bank Details Missing',
            description: 'You must add your bank details in Settings to submit a claim.',
        });
        return;
    }
    setIsSubmitting(true);
    try {
        const data = form.getValues();
        const calculationResult = await calculateBookIncentive(data);

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
        
        const bookProofFile = data.bookProof?.[0];
        const scopusProofFile = data.scopusProof?.[0];
        
        const bookProofUrl = await uploadFileHelper(bookProofFile, 'book-proof');
        const scopusProofUrl = await uploadFileHelper(scopusProofFile, 'book-scopus-proof');
        
        // Create a clean data object without the file objects
        const { bookProof, scopusProof, ...restOfData } = data;

        const claimData: Partial<IncentiveClaim> = {
            ...restOfData,
            calculatedIncentive: calculationResult.success ? calculationResult.amount : 0,
            misId: user.misId || null,
            orcidId: user.orcidId || null,
            claimType: 'Books',
            benefitMode: 'incentives',
            uid: user.uid,
            userName: user.name,
            userEmail: user.email,
            faculty: user.faculty,
            status,
            submissionDate: new Date().toISOString(),
            bankDetails: user.bankDetails || null,
        };
        
        if (bookProofUrl) claimData.bookProofUrl = bookProofUrl;
        if (scopusProofUrl) claimData.scopusProofUrl = scopusProofUrl;
        
        Object.keys(claimData).forEach(key => {
            if ((claimData as any)[key] === undefined) {
                delete (claimData as any)[key];
            }
        });
        
        const result = await submitIncentiveClaim(claimData as Omit<IncentiveClaim, 'id' | 'claimId'>);
        if (!result.success || !result.claimId) {
            throw new Error(result.error);
        }
        
        if (status === 'Draft') {
            toast({ title: 'Draft Saved!', description: "You can continue editing from the 'Incentive Claim' page." });
            router.push(`/dashboard/incentive-claim/book?claimId=${result.claimId}`);
        } else {
            toast({ title: 'Success', description: 'Your incentive claim for books/chapters has been submitted.' });
            router.push('/dashboard/incentive-claim');
        }
    } catch (error: any) {
        console.error('Error submitting claim: ', error);
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to submit claim. Please try again.' });
    } finally {
        setIsSubmitting(false);
    }
  }

  const onFinalSubmit = () => handleSave('Pending');
  
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
  
  const watchAuthors = form.watch('authors');
  const firstAuthorExists = watchAuthors.some(author => author.role === 'First Author' || author.role === 'First & Corresponding Author');

  const getAvailableRoles = (currentAuthor?: Author) => {
    const isCurrentAuthorFirst = currentAuthor && (currentAuthor.role === 'First Author' || currentAuthor.role === 'First & Corresponding Author');
    if (firstAuthorExists && !isCurrentAuthorFirst) {
      return coAuthorRoles.filter(role => role !== 'First Author' && role !== 'First & Corresponding Author');
    }
    return coAuthorRoles;
  };

  const handleAddCoPi = () => {
    if (foundCoPi && !fields.some(field => field.email.toLowerCase() === foundCoPi.email.toLowerCase())) {
        if (user && foundCoPi.email.toLowerCase() === user.email.toLowerCase()) {
            toast({ variant: 'destructive', title: 'Cannot Add Self', description: 'You cannot add yourself as a Co-PI.' });
            return;
        }
        append({ 
            name: foundCoPi.name, 
            email: foundCoPi.email,
            uid: foundCoPi.uid,
            role: 'Co-Author',
            isExternal: !foundCoPi.uid,
            status: 'approved',
        });
    }
    setFoundCoPi(null);
    setCoPiSearchTerm('');
  };

  if (currentStep === 2) {
    return (
        <Card>
            <form onSubmit={form.handleSubmit(onFinalSubmit)}>
                <CardContent className="pt-6">
                    <ReviewDetails data={form.getValues()} onEdit={() => setCurrentStep(1)} />
                </CardContent>
                <CardFooter>
                    <Button type="submit" disabled={isSubmitting || bankDetailsMissing}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isSubmitting ? 'Submitting...' : 'Submit Claim'}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
  }

  return (
    <Card>
      <Form {...form}>
        <form>
          <CardContent className="space-y-6 pt-6">
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

            <div className="rounded-lg border p-4 space-y-6 animate-in fade-in-0">
                <h3 className="font-semibold text-sm -mb-2">BOOK/BOOK CHAPTER DETAILS</h3>
                <Separator />
                <FormField name="bookApplicationType" control={form.control} render={({ field }) => ( <FormItem className="space-y-3"><FormLabel>Type of Application</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Book Chapter" /></FormControl><FormLabel className="font-normal">Book Chapter Publication</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Book" /></FormControl><FormLabel className="font-normal">Book Publication</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                <FormField name="publicationTitle" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Title of the {bookApplicationType || 'Publication'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                {bookApplicationType === 'Book Chapter' && (<FormField name="bookTitleForChapter" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Title of the Book (for Book Chapter)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />)}
                 
                 {/* Author Management Section */}
                <div className="space-y-4">
                    <FormLabel>Author(s) & Roles</FormLabel>
                    <div className="space-y-4">
                        {fields.map((field, index) => (
                            <div key={field.id} className="grid grid-cols-1 md:grid-cols-3 gap-4 border p-4 rounded-md items-end">
                                <FormItem className="md:col-span-2">
                                    <FormLabel>Name</FormLabel>
                                    <FormControl><Input value={field.name} readOnly /></FormControl>
                                </FormItem>
                                <FormField
                                    control={form.control}
                                    name={`authors.${index}.role`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Role</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <FormControl><SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger></FormControl>
                                                <SelectContent>{getAvailableRoles(form.getValues(`authors.${index}`)).map(role => (<SelectItem key={role} value={role}>{role}</SelectItem>))}</SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                {index > 0 && (
                                    <Button type="button" variant="destructive" className="md:col-start-4" onClick={() => remove(index)}>
                                        <Trash2 className="h-4 w-4 mr-2" /> Remove
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                    
                    <Separator className="my-4" />

                    <div className="space-y-2 p-4 border rounded-md">
                        <FormLabel>Add Internal Co-Author</FormLabel>
                        <div className="flex items-center gap-2">
                            <Input placeholder="Search by Co-PI's MIS ID" value={coPiSearchTerm} onChange={(e) => setCoPiSearchTerm(e.target.value)} />
                            <Button type="button" onClick={handleSearchCoPi} disabled={isSearching}>
                                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
                            </Button>
                        </div>
                        {foundCoPi && (
                            <div className="flex items-center justify-between p-2 border rounded-md bg-muted/50">
                                <div>
                                    <p>{foundCoPi.name}</p>
                                    {!foundCoPi.uid && <p className="text-xs text-muted-foreground">Not registered, but found in staff data.</p>}
                                </div>
                                <Button type="button" size="sm" onClick={handleAddCoPi}>Add</Button>
                            </div>
                        )}
                    </div>
                    <div className="space-y-2 p-4 border rounded-md">
                        <FormLabel>Add External Co-Author</FormLabel>
                        <div className="flex flex-col md:flex-row gap-2 mt-1">
                            <Input value={externalAuthorName} onChange={(e) => setExternalAuthorName(e.target.value)} placeholder="External author's name"/>
                            <Input value={externalAuthorEmail} onChange={(e) => setExternalAuthorEmail(e.target.value)} placeholder="External author's email"/>
                            <Select value={externalAuthorRole} onValueChange={(value) => setExternalAuthorRole(value as Author['role'])}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>{getAvailableRoles(undefined).map(role => (<SelectItem key={role} value={role}>{role}</SelectItem>))}</SelectContent>
                            </Select>
                            <Button type="button" onClick={addExternalAuthor} variant="outline" size="icon" disabled={!externalAuthorName.trim() || !externalAuthorEmail.trim()}><Plus className="h-4 w-4"/></Button>
                        </div>
                    </div>
                     <FormMessage>{form.formState.errors.authors?.message || form.formState.errors.authors?.root?.message}</FormMessage>
                </div>

                {bookApplicationType === 'Book Chapter' && (<FormField name="bookEditor" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Name of the Editor (for Book Chapter)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />)}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField name="totalPuStudents" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Total Students from PU</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                  <FormField name="puStudentNames" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Name of Students from PU</FormLabel><FormControl><Textarea placeholder="Comma-separated list of student names" {...field} /></FormControl><FormMessage /></FormItem> )} />
                </div>
                {bookApplicationType === 'Book Chapter' ? (<><FormField name="bookChapterPages" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Total No. of pages of the book chapter</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} /><FormField name="chaptersInSameBook" control={form.control} render={({ field }) => ( <FormItem><FormLabel>No. of chapters in the same book by applicant</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} /></>) : (
                    <>
                        <FormField name="bookTotalChapters" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Total No. of chapters of the book</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField name="bookTotalPages" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Total No. of pages of the book</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                    </>
                )}
                <FormField name="publicationYear" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Year of Publication</FormLabel><FormControl><Input type="number" placeholder={String(new Date().getFullYear())} {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="publisherName" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Name of the publisher</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                {bookApplicationType === 'Book' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField name="publisherCity" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Publisher City</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField name="publisherCountry" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Publisher Country</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                    </div>
                )}
                <FormField name="publisherType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Whether National/International Publisher</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="National" /></FormControl><FormLabel className="font-normal">National</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="International" /></FormControl><FormLabel className="font-normal">International</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                <FormField name="bookType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Whether Textbook or Reference Book</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Textbook" /></FormControl><FormLabel className="font-normal">Textbook</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Reference Book" /></FormControl><FormLabel className="font-normal">Reference Book</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                <FormField name="isScopusIndexed" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Whether Scopus Indexed</FormLabel><FormControl><RadioGroup onValueChange={(val) => field.onChange(val === 'true')} value={String(field.value)} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="true" /></FormControl><FormLabel className="font-normal">Yes</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="false" /></FormControl><FormLabel className="font-normal">No</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                {bookApplicationType === 'Book' && <FormField name="authorRole" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Applicant Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select your role" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Author">Author</SelectItem><SelectItem value="Editor">Editor</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />}
                {bookApplicationType === 'Book' && (
                  <FormField name="publicationMode" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Mode of Publication</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Print Only" /></FormControl><FormLabel className="font-normal">Print Only</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Electronic Only" /></FormControl><FormLabel className="font-normal">Electronic Only</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Print & Electronic" /></FormControl><FormLabel className="font-normal">Print & Electronic</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                )}
                {(publicationMode === 'Print Only' || publicationMode === 'Print & Electronic') && <FormField name="isbnPrint" control={form.control} render={({ field }) => ( <FormItem><FormLabel>ISBN Number (Print)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />}
                {(publicationMode === 'Electronic Only' || publicationMode === 'Print & Electronic') && <FormField name="isbnElectronic" control={form.control} render={({ field }) => ( <FormItem><FormLabel>ISBN Number (Electronic)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />}
                
                <FormField name="publisherWebsite" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Publisher Website</FormLabel><FormControl><Input type="url" placeholder="https://example.com" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="publicationOrderInYear" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Is this your First/Second/Third Chapter/Book in the calendar year?</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select publication order" /></SelectTrigger></FormControl><SelectContent><SelectItem value="First">First</SelectItem><SelectItem value="Second">Second</SelectItem><SelectItem value="Third">Third</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                <FormField name="bookProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach copy of Book / Book Chapter (First Page, Publisher Page, Index, Abstract) (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormMessage /></FormItem> )} />
                {isScopusIndexed && <FormField name="scopusProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach Proof of indexed in Scopus (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormMessage /></FormItem> )} />}
                <FormField control={form.control} name="bookSelfDeclaration" render={({ field }) => ( <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Self Declaration</FormLabel><FormMessage /><p className="text-xs text-muted-foreground">I hereby confirm that I have not applied/claimed for any incentive for the same application/publication earlier.</p></div></FormItem> )} />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSave('Draft')}
              disabled={isSubmitting || bankDetailsMissing}
            >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save as Draft
            </Button>
            <Button type="button" onClick={handleProceedToReview} disabled={isSubmitting || bankDetailsMissing}>
                Proceed to Review
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
