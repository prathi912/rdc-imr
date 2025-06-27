
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import { Separator } from '@/components/ui/separator';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import type { User, IncentiveClaim } from '@/types';
import { Loader2 } from 'lucide-react';

const incentiveSchema = z
  .object({
    claimType: z.string().min(1, 'Please select a claim type.'),
    prefilledMonthlyStatusId: z.string().optional(),
    partialEnteredId: z.string().optional(),
    publicationType: z.string().min(1, 'Please select a publication type.'),
    indexType: z.enum(['wos', 'scopus', 'both', 'esci', 'ft50'], {
      required_error: 'You need to select an index type.',
    }),
    wosType: z.enum(['sci', 'scie', 'ahi']).optional(),
    impactFactor: z.coerce.number().optional(),
    totalAuthors: z.string().min(1, 'Please select the total number of authors.'),
    totalInternalAuthors: z.string().min(1, 'Please select the number of internal authors.'),
    totalInternalCoAuthors: z.string().min(1, 'Please select the number of internal co-authors.'),
    authorType: z.string().min(1, 'Please select the author type.'),
    benefitMode: z.string().default('incentives'),
    journalName: z.string().min(5, 'Journal name is required.'),
    paperTitle: z.string().min(5, 'Paper title is required.'),
    publicationPhase: z.string().min(1, 'Please select the publication phase.'),
  })
  .refine(
    (data) => {
      if (data.indexType === 'wos' || data.indexType === 'both') {
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
  
  const form = useForm<IncentiveFormValues>({
    resolver: zodResolver(incentiveSchema),
    defaultValues: {
      claimType: 'Research Papers',
      publicationType: 'Referred paper in journal listed by WOS/Scopus',
      benefitMode: 'incentives',
      prefilledMonthlyStatusId: '',
      partialEnteredId: '',
      impactFactor: '' as any, // Initialize to empty string to make it a controlled component
      totalAuthors: '',
      totalInternalAuthors: '',
      totalInternalCoAuthors: '',
      authorType: '',
      journalName: '',
      paperTitle: '',
      publicationPhase: '',
    },
  });
  
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const indexType = form.watch('indexType');

  async function onSubmit(data: IncentiveFormValues) {
    if (!user || !user.faculty) {
        toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in and have a faculty set in your profile to submit a claim.' });
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
        <CardTitle>Research Paper Incentive Claim Form</CardTitle>
        <CardDescription>
          Fill out the details below to apply for the incentive.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <FormField
                control={form.control}
                name="claimType"
                render={({ field }) => (
                  <FormItem className="flex-grow">
                    <FormLabel>Please Select</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a claim type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Research Papers">Research Papers</SelectItem>
                        <SelectItem value="Books">Books</SelectItem>
                        <SelectItem value="Patents">Patents</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button variant="link" type="button" className="self-end pb-2 h-auto">Important Information</Button>
            </div>

            <div className="rounded-lg border p-4 space-y-4">
                <h3 className="font-semibold text-sm -mb-2">RESEARCH PAPER</h3>
                <Separator />
                
                <FormField
                    control={form.control}
                    name="prefilledMonthlyStatusId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Please Select the Prefilled Monthly Status id</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                                <FormControl><SelectTrigger><SelectValue placeholder="-- Please Select --" /></SelectTrigger></FormControl>
                                <SelectContent></SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                
                <div className="text-center font-bold text-sm">Or</div>
                
                <FormField
                    control={form.control}
                    name="partialEnteredId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Please Select the Partial Entered id</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                                <FormControl><SelectTrigger><SelectValue placeholder="-- Please Select --" /></SelectTrigger></FormControl>
                                <SelectContent></SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                
                <div className="text-center font-bold text-sm">Or</div>

                <FormField
                  control={form.control}
                  name="publicationType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Please Select</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
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
                            disabled={isSubmitting}
                            >
                            <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="wos" /></FormControl><FormLabel className="font-normal">WoS</FormLabel></FormItem>
                            <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="scopus" /></FormControl><FormLabel className="font-normal">Scopus</FormLabel></FormItem>
                            <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="both" /></FormControl><FormLabel className="font-normal">Both</FormLabel></FormItem>
                            <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="esci" /></FormControl><FormLabel className="font-normal">ESCI</FormLabel></FormItem>
                            <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="ft50" /></FormControl><FormLabel className="font-normal">FT-50</FormLabel></FormItem>
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
                                disabled={isSubmitting}
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
                 <FormField
                    control={form.control}
                    name="impactFactor"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Impact factor</FormLabel>
                        <FormControl>
                            <Input type="number" step="0.01" placeholder="e.g., 3.5" {...field} disabled={isSubmitting} />
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
                      <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
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
                      <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
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
                      <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
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
                      <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
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
                            disabled={isSubmitting}
                            >
                            <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="incentives" /></FormControl><FormLabel className="font-normal">Incentives</FormLabel></FormItem>
                            </RadioGroup>
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                
                <Separator />

                <FormField
                    control={form.control}
                    name="journalName"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Name of Journal/Proceedings</FormLabel>
                        <FormControl>
                            <Textarea placeholder="Enter the full name of the journal or proceedings" {...field} disabled={isSubmitting} />
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
                            <Textarea placeholder="Enter the full title of your paper" {...field} disabled={isSubmitting} />
                        </FormControl>
                        <FormDescription className="text-destructive text-xs">* Note:-Please ensure that there should not be any special character (", ', !, @, #, $, &) in the Title of the Paper published.</FormDescription>
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
                            <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
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
          </CardContent>
          <CardFooter>
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
