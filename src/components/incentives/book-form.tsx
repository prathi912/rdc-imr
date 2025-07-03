
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
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { collection, addDoc } from 'firebase/firestore';
import type { User, IncentiveClaim } from '@/types';
import { uploadFileToServer } from '@/app/actions';
import { Loader2, AlertCircle } from 'lucide-react';

const bookSchema = z
  .object({
    bookApplicationType: z.enum(['Book Chapter', 'Book'], { required_error: 'Please select an application type.' }),
    publicationTitle: z.string().min(3, 'Title is required.'),
    bookAuthors: z.string().min(3, 'Author names are required.'),
    bookTitleForChapter: z.string().optional(),
    bookEditor: z.string().optional(),
    totalPuAuthors: z.coerce.number().optional(),
    totalPuStudents: z.coerce.number().optional(),
    puStudentNames: z.string().optional(),
    bookChapterPages: z.coerce.number().optional(),
    bookTotalPages: z.coerce.number().optional(),
    publisherName: z.string().min(2, 'Publisher name is required.'),
    isSelfPublished: z.boolean().optional(),
    publisherType: z.enum(['National', 'International'], { required_error: 'Publisher type is required.' }),
    isScopusIndexed: z.boolean().optional(),
    authorRole: z.enum(['Editor', 'Author']).optional(),
    isbn: z.string().min(10, 'A valid ISBN is required.'),
    bookType: z.enum(['Textbook', 'Reference Book']).optional(),
    publisherWebsite: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
    bookProof: z.any().refine((files) => files?.length > 0, 'Proof of publication is required.'),
    scopusProof: z.any().optional(),
    publicationOrderInYear: z.enum(['First', 'Second', 'Third']).optional(),
    bookSelfDeclaration: z.boolean().refine(val => val === true, { message: 'You must agree to the self-declaration.' }),
    authorType: z.string().optional(),
    totalAuthors: z.string().optional(),
  })
  .refine(data => !(data.bookApplicationType === 'Book Chapter') || (!!data.bookTitleForChapter && data.bookTitleForChapter.length > 2), { message: 'Book title is required for a book chapter.', path: ['bookTitleForChapter'] })
  .refine(data => !(data.isScopusIndexed) || (!!data.scopusProof && data.scopusProof.length > 0), { message: 'Proof of Scopus indexing is required if selected.', path: ['scopusProof'] });

type BookFormValues = z.infer<typeof bookSchema>;

const authorCountOptions = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10+'];
const authorTypeOptions = [
  'First Author',
  'Corresponding Author',
  'First & Corresponding Author',
  'Co-Author',
];

const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};

export function BookForm() {
  const { toast } = useToast();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false);
  
  const form = useForm<BookFormValues>({
    resolver: zodResolver(bookSchema),
    defaultValues: {
      bookApplicationType: undefined,
      publicationTitle: '',
      bookAuthors: '',
      bookTitleForChapter: '',
      bookEditor: '',
      totalPuAuthors: 0,
      totalPuStudents: 0,
      puStudentNames: '',
      bookChapterPages: 0,
      bookTotalPages: 0,
      publisherName: '',
      isSelfPublished: false,
      publisherType: undefined,
      isScopusIndexed: false,
      authorRole: undefined,
      isbn: '',
      bookType: undefined,
      publisherWebsite: '',
      bookProof: undefined,
      scopusProof: undefined,
      publicationOrderInYear: undefined,
      bookSelfDeclaration: false,
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

  const bookApplicationType = form.watch('bookApplicationType');
  const isScopusIndexed = form.watch('isScopusIndexed');

  async function onSubmit(data: BookFormValues) {
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

      const bookProofUrl = await uploadFileHelper(data.bookProof?.[0], 'book-proof');
      const scopusProofUrl = await uploadFileHelper(data.scopusProof?.[0], 'book-scopus-proof');

      const claimData: Omit<IncentiveClaim, 'id'> = {
        ...data,
        orcidId: user.orcidId,
        claimType: 'Books',
        benefitMode: 'incentives',
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
      toast({ title: 'Success', description: 'Your incentive claim for books/chapters has been submitted.' });
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
                <FormField name="bookAuthors" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Name of Author(s)</FormLabel><FormControl><Textarea placeholder="Comma-separated list of authors" {...field} /></FormControl><FormMessage /></FormItem> )} />
                {bookApplicationType === 'Book Chapter' && (<FormField name="bookEditor" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Name of the Editor (for Book Chapter)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />)}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><FormField name="totalPuAuthors" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Total Authors from PU</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} /><FormField name="totalPuStudents" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Total Students from PU</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} /></div>
                <FormField name="puStudentNames" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Name of Students from PU</FormLabel><FormControl><Textarea placeholder="Comma-separated list of student names" {...field} /></FormControl><FormMessage /></FormItem> )} />
                {bookApplicationType === 'Book Chapter' ? (<FormField name="bookChapterPages" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Total No. of pages of the book chapter</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />) : (<FormField name="bookTotalPages" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Total No. of pages of the book</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />)}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="totalAuthors" render={({ field }) => ( <FormItem><FormLabel>Total No. of Authors</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting || bankDetailsMissing}><FormControl><SelectTrigger><SelectValue placeholder="-- Please Select --" /></SelectTrigger></FormControl><SelectContent>{authorCountOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )}/>
                  <FormField control={form.control} name="authorType" render={({ field }) => ( <FormItem><FormLabel>Author Type</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting || bankDetailsMissing}><FormControl><SelectTrigger><SelectValue placeholder="-- Please Select --" /></SelectTrigger></FormControl><SelectContent>{authorTypeOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )}/>
                </div>
                <FormField control={form.control} name="bookSelfDeclaration" render={({ field }) => ( <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Self Declaration</FormLabel><FormMessage /><p className="text-xs text-muted-foreground">I hereby confirm that I have not applied/claimed for any incentive for the same application/publication earlier.</p></div></FormItem> )} />
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
