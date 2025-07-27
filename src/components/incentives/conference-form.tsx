
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

const conferenceSchema = z
  .object({
    conferencePaperTitle: z.string().min(5, 'Paper title is required.'),
    conferenceName: z.string().min(3, 'Conference name is required.'),
    conferenceType: z.enum(['International', 'National', 'Regional/State'], { required_error: 'Conference type is required.' }),
    conferenceVenue: z.enum(['India', 'Indian Subcontinent', 'South Korea, Japan, Australia and Middle East', 'Europe', 'African/South American/North American'], { required_error: 'Conference venue is required.' }),
    presentationType: z.enum(['Oral', 'Poster', 'Other'], { required_error: 'Presentation type is required.' }),
    govtFundingRequestProof: z.any().optional(),
    registrationFee: z.coerce.number().optional(),
    travelFare: z.coerce.number().optional(),
    conferenceMode: z.enum(['Online', 'Offline'], { required_error: 'Presentation mode is required.' }),
    onlinePresentationOrder: z.enum(['First', 'Second', 'Third', 'Additional']).optional(),
    wasPresentingAuthor: z.boolean().optional(),
    isPuNamePresent: z.boolean().optional(),
    abstractUpload: z.any().optional(),
    organizerName: z.string().min(2, 'Organizer name is required.'),
    eventWebsite: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
    conferenceDate: z.string().min(1, 'Conference date is required.'),
    presentationDate: z.string().min(1, 'Presentation date is required.'),
    registrationFeeProof: z.any().optional(),
    participationCertificate: z.any().refine((files) => files?.length > 0, 'Participation certificate is required.'),
    wonPrize: z.boolean().optional(),
    prizeDetails: z.string().optional(),
    prizeProof: z.any().optional(),
    attendedOtherConference: z.boolean().optional(),
    travelPlaceVisited: z.string().optional(),
    travelMode: z.enum(['Bus', 'Train', 'Air', 'Other']).optional(),
    travelReceipts: z.any().optional(),
    flightTickets: z.any().optional(),
    conferenceSelfDeclaration: z.boolean().refine(val => val === true, { message: 'You must agree to the self-declaration.' }),
    authorType: z.string().optional(),
    totalAuthors: z.string().optional(),
  })
  .refine(data => data.claimType !== 'Conference Presentations' || data.conferenceSelfDeclaration === true, { message: 'You must agree to the self-declaration.', path: ['conferenceSelfDeclaration']})
  .refine(data => !(data.conferenceVenue && data.conferenceVenue !== 'India') || (!!data.govtFundingRequestProof && data.govtFundingRequestProof.length > 0), { message: 'Proof of government funding request is required for conferences outside India.', path: ['govtFundingRequestProof']})
  .refine(data => !(data.wonPrize) || (!!data.prizeDetails && data.prizeDetails.length > 2), { message: 'Prize details are required if you won a prize.', path: ['prizeDetails']})
  .refine(data => !(data.wonPrize) || (!!data.prizeProof && data.prizeProof.length > 0), { message: 'Proof of prize is required if you won a prize.', path: ['prizeProof']});

type ConferenceFormValues = z.infer<typeof conferenceSchema>;

const conferenceVenueOptions = {
    'International': ['India', 'Indian Subcontinent', 'South Korea, Japan, Australia and Middle East', 'Europe', 'African/South American/North American'],
    'National': ['India'],
    'Regional/State': ['India'],
}

const authorCountOptions = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10+'];
const authorTypeOptions = [
  'First Author',
  'Corresponding Author',
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

export function ConferenceForm() {
  const { toast } = useToast();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false);
  
  const form = useForm<ConferenceFormValues>({
    resolver: zodResolver(conferenceSchema),
    defaultValues: {
      conferenceName: '',
      conferencePaperTitle: '',
      conferenceType: undefined,
      conferenceVenue: undefined,
      presentationType: undefined,
      govtFundingRequestProof: undefined,
      registrationFee: 0,
      travelFare: 0,
      conferenceMode: undefined,
      onlinePresentationOrder: undefined,
      wasPresentingAuthor: false,
      isPuNamePresent: false,
      abstractUpload: undefined,
      organizerName: '',
      eventWebsite: '',
      conferenceDate: '',
      presentationDate: '',
      registrationFeeProof: undefined,
      participationCertificate: undefined,
      wonPrize: false,
      prizeDetails: '',
      prizeProof: undefined,
      attendedOtherConference: false,
      travelPlaceVisited: '',
      travelMode: undefined,
      travelReceipts: undefined,
      conferenceSelfDeclaration: false,
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

  const conferenceType = form.watch('conferenceType');
  const conferenceVenue = form.watch('conferenceVenue');
  const conferenceMode = form.watch('conferenceMode');
  const travelMode = form.watch('travelMode');
  const wonPrize = form.watch('wonPrize');

  async function onSubmit(data: ConferenceFormValues) {
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
        if (!result.success || !result.url) { throw new Error(result.error || `File upload failed for ${folderName}`); }
        return result.url;
      };

      const claimData: Omit<IncentiveClaim, 'id'> = {
        ...data,
        orcidId: user.orcidId,
        claimType: 'Conference Presentations',
        benefitMode: 'reimbursement',
        uid: user.uid,
        userName: user.name,
        userEmail: user.email,
        faculty: user.faculty,
        status: 'Pending',
        submissionDate: new Date().toISOString(),
        bankDetails: user.bankDetails,
      };

      const govtFundingRequestProofUrl = await uploadFileHelper(data.govtFundingRequestProof?.[0], 'conference-funding-proof');
      const abstractUrl = await uploadFileHelper(data.abstractUpload?.[0], 'conference-abstract');
      const registrationFeeProofUrl = await uploadFileHelper(data.registrationFeeProof?.[0], 'conference-reg-proof');
      const participationCertificateUrl = await uploadFileHelper(data.participationCertificate?.[0], 'conference-cert');
      const prizeProofUrl = await uploadFileHelper(data.prizeProof?.[0], 'conference-prize-proof');
      const travelReceiptsUrl = await uploadFileHelper(data.travelReceipts?.[0], 'conference-travel-receipts');

      if (govtFundingRequestProofUrl) claimData.govtFundingRequestProofUrl = govtFundingRequestProofUrl;
      if (abstractUrl) claimData.abstractUrl = abstractUrl;
      if (registrationFeeProofUrl) claimData.registrationFeeProofUrl = registrationFeeProofUrl;
      if (participationCertificateUrl) claimData.participationCertificateUrl = participationCertificateUrl;
      if (prizeProofUrl) claimData.prizeProofUrl = prizeProofUrl;
      if (travelReceiptsUrl) claimData.travelReceiptsUrl = travelReceiptsUrl;

      await addDoc(collection(db, 'incentiveClaims'), claimData);
      toast({ title: 'Success', description: 'Your incentive claim has been submitted.' });
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

            <div className="rounded-lg border p-4 space-y-6 animate-in fade-in-0">
                <div>
                    <h3 className="font-semibold text-sm -mb-2">EVENT &amp; PRESENTATION DETAILS</h3>
                    <Separator className="mt-4"/>
                    <div className="space-y-4 mt-4">
                        <FormField name="conferencePaperTitle" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Paper Title</FormLabel><FormControl><Input placeholder="Title of the paper presented" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField name="conferenceName" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Conference/Event Name</FormLabel><FormControl><Input placeholder="Full name of the conference" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField name="organizerName" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Organizer Name</FormLabel><FormControl><Input placeholder="Name of Institution/Organisation" {...field} /></FormControl><FormMessage /></FormItem> )} />
                         <FormField name="eventWebsite" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Event Website</FormLabel><FormControl><Input type="url" placeholder="https://example.com" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <FormField name="conferenceDate" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Conference Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem> )} />
                           <FormField name="presentationDate" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Your Presentation Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField name="conferenceType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Conference Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="International">International</SelectItem><SelectItem value="National">National</SelectItem><SelectItem value="Regional/State">Regional/State</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                            <FormField name="presentationType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Presentation Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Oral">Oral</SelectItem><SelectItem value="Poster">Poster</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                        </div>
                         <FormField control={form.control} name="conferenceVenue" render={({ field }) => ( <FormItem><FormLabel>Conference Venue/Location</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!conferenceType}><FormControl><SelectTrigger><SelectValue placeholder="Select venue" /></SelectTrigger></FormControl><SelectContent>{(conferenceVenueOptions[conferenceType as keyof typeof conferenceVenueOptions] || []).map(venue => (<SelectItem key={venue} value={venue}>{venue}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem> )} />
                         <FormField name="conferenceMode" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Presentation Mode</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Online" /></FormControl><FormLabel className="font-normal">Online</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Offline" /></FormControl><FormLabel className="font-normal">Offline</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                         {conferenceMode === 'Online' && (<FormField name="onlinePresentationOrder" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Online Presentation Order</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select order" /></SelectTrigger></FormControl><SelectContent><SelectItem value="First">First</SelectItem><SelectItem value="Second">Second</SelectItem><SelectItem value="Third">Third</SelectItem><SelectItem value="Additional">Additional</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />)}
                        <FormField name="abstractUpload" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach Full Abstract (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField name="participationCertificate" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach Participation/Presentation Certificate (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormMessage /></FormItem> )} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField control={form.control} name="totalAuthors" render={({ field }) => ( <FormItem><FormLabel>Total No. of Authors</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting || bankDetailsMissing}><FormControl><SelectTrigger><SelectValue placeholder="-- Please Select --" /></SelectTrigger></FormControl><SelectContent>{authorCountOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )}/>
                          <FormField control={form.control} name="authorType" render={({ field }) => ( <FormItem><FormLabel>Author Type</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting || bankDetailsMissing}><FormControl><SelectTrigger><SelectValue placeholder="-- Please Select --" /></SelectTrigger></FormControl><SelectContent>{authorTypeOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )}/>
                        </div>
                    </div>
                </div>
                 <div>
                    <h3 className="font-semibold text-sm -mb-2">EXPENSE &amp; TRAVEL DETAILS</h3>
                    <Separator className="mt-4"/><div className="space-y-4 mt-4"><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><FormField name="registrationFee" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Registration Fee (INR)</FormLabel><FormControl><Input type="number" placeholder="e.g., 5000" {...field} /></FormControl><FormMessage /></FormItem> )} /><FormField name="registrationFeeProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Proof of Registration Fee Payment</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormMessage /></FormItem> )} /></div>{conferenceMode === 'Offline' && (<div className="space-y-4"><FormField name="travelPlaceVisited" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Place Visited</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} /><FormField name="travelMode" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Travel Mode</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select travel mode" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Bus">Bus</SelectItem><SelectItem value="Train">Train</SelectItem><SelectItem value="Air">Air</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} /><FormField name="travelFare" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Travel Fare Incurred (INR)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} /><FormField name="travelReceipts" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach All Tickets/Travel Receipts</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormMessage /></FormItem> )} /></div>)}{conferenceVenue && conferenceVenue !== 'India' && (<FormField name="govtFundingRequestProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Proof of Govt. Funding Request</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormDescription>Required for conferences outside India.</FormDescription><FormMessage /></FormItem> )} />)}</div>
                 </div>
                <div>
                    <h3 className="font-semibold text-sm -mb-2">DECLARATIONS</h3>
                    <Separator className="mt-4"/><div className="space-y-4 mt-4"><FormField name="wasPresentingAuthor" control={form.control} render={({ field }) => ( <FormItem><div className="flex items-center justify-between"><FormLabel>Were you the presenting author?</FormLabel><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></div><FormMessage /></FormItem> )} /><FormField name="isPuNamePresent" control={form.control} render={({ field }) => ( <FormItem><div className="flex items-center justify-between"><FormLabel>Is "Parul University" name present in the paper?</FormLabel><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></div><FormMessage /></FormItem> )} /><FormField name="wonPrize" control={form.control} render={({ field }) => ( <FormItem><div className="flex items-center justify-between"><FormLabel>Did your paper win a prize?</FormLabel><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></div><FormMessage /></FormItem> )} />{wonPrize && (<div className="space-y-4 pl-4 border-l-2"><FormField name="prizeDetails" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Prize Details</FormLabel><FormControl><Input placeholder="e.g., Best Paper Award" {...field} /></FormControl><FormMessage /></FormItem> )} /><FormField name="prizeProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach Prize Certificate (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormMessage /></FormItem> )} /></div>)}<FormField name="attendedOtherConference" control={form.control} render={({ field }) => ( <FormItem><div className="flex items-center justify-between"><FormLabel>Have you attended any other conference this year?</FormLabel><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></div><FormMessage /></FormItem> )} /><FormField control={form.control} name="conferenceSelfDeclaration" render={({ field }) => ( <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Self Declaration</FormLabel><FormMessage /><p className="text-xs text-muted-foreground">I hereby confirm that I have not applied/claimed for any incentive for the same application/publication earlier & Certified that I have availed only this conference in the calendar year.</p></div></FormItem> )} /></div>
                </div>
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
