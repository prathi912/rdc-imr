
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
import { collection, addDoc, doc, setDoc, query, where, getDocs, orderBy } from 'firebase/firestore';
import type { User, IncentiveClaim } from '@/types';
import { uploadFileToServer } from '@/app/actions';
import { Loader2, AlertCircle, Info } from 'lucide-react';
import { submitIncentiveClaim } from '@/app/incentive-approval-actions';
import { differenceInDays, parseISO, addYears, format } from 'date-fns';

const conferenceSchema = z
  .object({
    conferencePaperTitle: z.string().min(5, 'Paper title is required.'),
    conferenceName: z.string().min(3, 'Conference name is required.'),
    conferenceMode: z.enum(['Online', 'Offline'], { required_error: 'Presentation mode is required.' }),
    onlinePresentationOrder: z.enum(['First', 'Second', 'Third', 'Additional']).optional(),
    conferenceType: z.enum(['International', 'National', 'Regional/State'], { required_error: 'Conference type is required.' }),
    conferenceVenue: z.enum(['India', 'Indian Subcontinent', 'South Korea, Japan, Australia and Middle East', 'Europe', 'African/South American/North American', 'Other'], { required_error: 'Conference venue is required.' }),
    presentationType: z.enum(['Oral', 'Poster', 'Other']).optional(),
    govtFundingRequestProof: z.any().optional(),
    registrationFee: z.coerce.number().optional(),
    travelFare: z.coerce.number().optional(),
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
  .refine(data => data.conferenceSelfDeclaration === true, { message: 'You must agree to the self-declaration.', path: ['conferenceSelfDeclaration']})
  .refine(data => !(data.conferenceVenue && data.conferenceVenue !== 'India') || (!!data.govtFundingRequestProof && data.govtFundingRequestProof.length > 0), { message: 'Proof of government funding request is required for conferences outside India.', path: ['govtFundingRequestProof']})
  .refine(data => !(data.wonPrize) || (!!data.prizeDetails && data.prizeDetails.length > 2), { message: 'Prize details are required if you won a prize.', path: ['prizeDetails']})
  .refine(data => !(data.wonPrize) || (!!data.prizeProof && data.prizeProof.length > 0), { message: 'Proof of prize is required if you won a prize.', path: ['prizeProof']})
  .refine(data => data.conferenceMode === 'Online' || !!data.presentationType, { message: 'Presentation type is required for offline conferences.', path: ['presentationType'] })
  .refine(data => !data.conferenceDate || !data.presentationDate || new Date(data.presentationDate) >= new Date(data.conferenceDate), {
    message: 'Presentation date must be on or after the conference start date.',
    path: ['presentationDate'],
  });

type ConferenceFormValues = z.infer<typeof conferenceSchema>;

const conferenceVenueOptions = {
    'International': ['India', 'Indian Subcontinent', 'South Korea, Japan, Australia and Middle East', 'Europe', 'African/South American/North American', 'Other'],
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
  const [orcidOrMisIdMissing, setOrcidOrMisIdMissing] = useState(false);
  const [calculatedIncentive, setCalculatedIncentive] = useState<number | null>(null);
  const [eligibility, setEligibility] = useState<{ eligible: boolean; nextAvailableDate?: string }>({ eligible: true });
  
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
  
  const formValues = form.watch();

  useEffect(() => {
    const {
      conferenceType,
      conferenceVenue,
      presentationType,
      conferenceMode,
      registrationFee,
      travelFare,
      onlinePresentationOrder,
      organizerName,
    } = formValues;

    const totalExpenses = (registrationFee || 0) + (travelFare || 0);
    let maxReimbursement = 0;

    if (organizerName?.toLowerCase().includes('parul university')) {
      maxReimbursement = (registrationFee || 0) * 0.75;
    } else if (conferenceMode === 'Online') {
      const regFee = registrationFee || 0;
      switch (onlinePresentationOrder) {
        case 'First': maxReimbursement = Math.min(regFee * 0.75, 15000); break;
        case 'Second': maxReimbursement = Math.min(regFee * 0.60, 10000); break;
        case 'Third': maxReimbursement = Math.min(regFee * 0.50, 7000); break;
        case 'Additional': maxReimbursement = Math.min(regFee * 0.30, 2000); break;
      }
    } else if (conferenceMode === 'Offline') {
      if (conferenceType === 'International') {
        switch (conferenceVenue) {
          case 'Indian Subcontinent': maxReimbursement = 30000; break;
          case 'South Korea, Japan, Australia and Middle East': maxReimbursement = 45000; break;
          case 'Europe': maxReimbursement = 60000; break;
          case 'African/South American/North American': maxReimbursement = 75000; break;
          case 'India':
            maxReimbursement = presentationType === 'Oral' ? 20000 : 15000;
            break;
          case 'Other':
            maxReimbursement = 75000; // Defaulting to max for "Other" international
            break;
        }
      } else if (conferenceType === 'National') {
        maxReimbursement = presentationType === 'Oral' ? 12000 : 10000;
      } else if (conferenceType === 'Regional/State') {
        maxReimbursement = 7500;
      }
    }
    
    setCalculatedIncentive(Math.min(totalExpenses, maxReimbursement));

  }, [formValues]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      setBankDetailsMissing(!parsedUser.bankDetails);
      setOrcidOrMisIdMissing(!parsedUser.orcidId || !parsedUser.misId);

      // Check claim history for eligibility
      const checkEligibility = async () => {
          const claimsRef = collection(db, 'incentiveClaims');
          const q = query(
              claimsRef, 
              where('uid', '==', parsedUser.uid), 
              where('claimType', '==', 'Conference Presentations'),
              where('conferenceMode', '==', 'Offline'),
              where('status', 'in', ['Accepted', 'Submitted to Accounts', 'Payment Completed']),
              orderBy('submissionDate', 'desc')
          );
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
              const lastClaim = snapshot.docs[0].data() as IncentiveClaim;
              const lastClaimDate = parseISO(lastClaim.submissionDate);
              const twoYearsAgo = addYears(new Date(), -2);

              if (lastClaimDate > twoYearsAgo) {
                  const nextDate = addYears(lastClaimDate, 2);
                  setEligibility({
                      eligible: false,
                      nextAvailableDate: format(nextDate, 'PPP'),
                  });
              }
          }
      };
      checkEligibility();
    }
  }, []);

  const conferenceType = form.watch('conferenceType');
  const conferenceVenue = form.watch('conferenceVenue');
  const conferenceMode = form.watch('conferenceMode');
  const travelMode = form.watch('travelMode');
  const wonPrize = form.watch('wonPrize');

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

        const uploadFileHelper = async (file: File | undefined, folderName: string): Promise<string | undefined> => {
            if (!file || !user) return undefined;
            const dataUrl = await fileToDataUrl(file);
            const path = `incentive-proofs/${user.uid}/${folderName}/${new Date().toISOString()}-${file.name}`;
            const result = await uploadFileToServer(dataUrl, path);
            if (!result.success || !result.url) { throw new Error(result.error || `File upload failed for ${folderName}`); }
            return result.url;
        };

        const claimData: Omit<IncentiveClaim, 'id' | 'claimId'> = {
            ...data,
            calculatedIncentive,
            misId: user.misId || null,
            orcidId: user.orcidId || null,
            claimType: 'Conference Presentations',
            benefitMode: 'reimbursement',
            uid: user.uid,
            userName: user.name,
            userEmail: user.email,
            faculty: user.faculty,
            status,
            submissionDate: new Date().toISOString(),
            bankDetails: user.bankDetails || null,
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

        const result = await submitIncentiveClaim(claimData);

        if (!result.success) {
            throw new Error(result.error);
        }

        if (status === 'Draft') {
          toast({ title: 'Draft Saved!', description: "You can continue editing from the 'Incentive Claim' page." });
          router.push(`/dashboard/incentive-claim/conference?claimId=${result.claimId}`);
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

  const isFormDisabled = (!eligibility.eligible && form.watch('conferenceMode') === 'Offline') || isSubmitting;


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

            {!eligibility.eligible && (
                 <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Not Eligible for Offline Conference</AlertTitle>
                    <AlertDescription>
                        As per policy, a faculty member is eligible for <strong>offline</strong> conference assistance once every two years. You will be eligible to apply again on <strong>{eligibility.nextAvailableDate}</strong>. You may still apply for online conferences.
                    </AlertDescription>
                </Alert>
            )}

             <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Conference Reimbursement Policy</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1 mt-2 text-xs">
                    <li>Only the presenting author is entitled for reimbursement.</li>
                    <li>For <strong>offline conferences outside India</strong>, proof of application for government travel grants is mandatory.</li>
                    <li>A faculty member is eligible for assistance for <strong>offline</strong> conferences ONCE in TWO years. There is no limit for online presentations.</li>
                    <li>Airfare for International travel and II-AC train fare (or actual, whichever is lesser) for travel within India shall be reimbursed within policy limits.</li>
                     <li>Please refer to the full SOP for detailed limits and conditions.</li>
                </ul>
              </AlertDescription>
            </Alert>


            <div className="rounded-lg border p-4 space-y-6 animate-in fade-in-0">
                <div>
                    <h3 className="font-semibold text-sm -mb-2">EVENT &amp; PRESENTATION DETAILS</h3>
                    <Separator className="mt-4"/>
                    <div className="space-y-4 mt-4">
                        <FormField name="conferencePaperTitle" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Paper Title</FormLabel><FormControl><Input placeholder="Title of the paper presented" {...field} disabled={isFormDisabled} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField name="conferenceName" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Conference/Event Name</FormLabel><FormControl><Input placeholder="Full name of the conference" {...field} disabled={isFormDisabled} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField name="conferenceMode" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Presentation Mode</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Online" disabled={isSubmitting} /></FormControl><FormLabel className="font-normal">Online</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Offline" disabled={isFormDisabled} /></FormControl><FormLabel className="font-normal">Offline</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                        {conferenceMode === 'Online' && (<FormField name="onlinePresentationOrder" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Online Presentation Order</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isFormDisabled}><FormControl><SelectTrigger><SelectValue placeholder="Select order" /></SelectTrigger></FormControl><SelectContent><SelectItem value="First">First</SelectItem><SelectItem value="Second">Second</SelectItem><SelectItem value="Third">Third</SelectItem><SelectItem value="Additional">Additional</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />)}
                        <FormField name="organizerName" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Organizer Name</FormLabel><FormControl><Input placeholder="Name of Institution/Organisation" {...field} disabled={isFormDisabled} /></FormControl><FormMessage /></FormItem> )} />
                         <FormField name="eventWebsite" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Event Website</FormLabel><FormControl><Input type="url" placeholder="https://example.com" {...field} disabled={isFormDisabled} /></FormControl><FormMessage /></FormItem> )} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <FormField name="conferenceDate" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Conference Start Date</FormLabel><FormControl><Input type="date" {...field} disabled={isFormDisabled} /></FormControl><FormMessage /></FormItem> )} />
                           <FormField name="presentationDate" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Your Presentation Date</FormLabel><FormControl><Input type="date" {...field} disabled={isFormDisabled} /></FormControl><FormMessage /></FormItem> )} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField name="conferenceType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Conference Type</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isFormDisabled}><FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="International">International</SelectItem><SelectItem value="National">National</SelectItem><SelectItem value="Regional/State">Regional/State</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                            {conferenceMode === 'Offline' && <FormField name="presentationType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Presentation Type</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isFormDisabled}><FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Oral">Oral</SelectItem><SelectItem value="Poster">Poster</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />}
                        </div>
                         <FormField control={form.control} name="conferenceVenue" render={({ field }) => ( <FormItem><FormLabel>Conference Venue/Location</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!conferenceType || isFormDisabled}><FormControl><SelectTrigger><SelectValue placeholder="Select venue" /></SelectTrigger></FormControl><SelectContent>{(conferenceVenueOptions[conferenceType as keyof typeof conferenceVenueOptions] || []).map(venue => (<SelectItem key={venue} value={venue}>{venue}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem> )} />
                        <FormField name="abstractUpload" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach Full Abstract (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} disabled={isFormDisabled} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField name="participationCertificate" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach Participation/Presentation Certificate (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} disabled={isFormDisabled} /></FormControl><FormMessage /></FormItem> )} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField control={form.control} name="totalAuthors" render={({ field }) => ( <FormItem><FormLabel>Total No. of Authors</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}><FormControl><SelectTrigger><SelectValue placeholder="-- Please Select --" /></SelectTrigger></FormControl><SelectContent>{authorCountOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )}/>
                          <FormField control={form.control} name="authorType" render={({ field }) => ( <FormItem><FormLabel>Author Type</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}><FormControl><SelectTrigger><SelectValue placeholder="-- Please Select --" /></SelectTrigger></FormControl><SelectContent>{authorTypeOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )}/>
                        </div>
                    </div>
                </div>
                 <div>
                    <h3 className="font-semibold text-sm -mb-2">EXPENSE &amp; TRAVEL DETAILS</h3>
                    <Separator className="mt-4"/><div className="space-y-4 mt-4"><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><FormField name="registrationFee" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Registration Fee (INR)</FormLabel><FormControl><Input type="number" placeholder="e.g., 5000" {...field} disabled={isFormDisabled} /></FormControl><FormMessage /></FormItem> )} /><FormField name="registrationFeeProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Proof of Registration Fee Payment</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} disabled={isFormDisabled} /></FormControl><FormMessage /></FormItem> )} /></div>{conferenceMode === 'Offline' && (<div className="space-y-4"><FormField name="travelPlaceVisited" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Place Visited</FormLabel><FormControl><Input {...field} disabled={isFormDisabled} /></FormControl><FormMessage /></FormItem> )} /><FormField name="travelMode" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Travel Mode</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isFormDisabled}><FormControl><SelectTrigger><SelectValue placeholder="Select travel mode" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Bus">Bus</SelectItem><SelectItem value="Train">Train</SelectItem><SelectItem value="Air">Air</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} /><FormField name="travelFare" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Travel Fare Incurred (INR)</FormLabel><FormControl><Input type="number" {...field} disabled={isFormDisabled} /></FormControl><FormMessage /></FormItem> )} /><FormField name="travelReceipts" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach All Tickets/Travel Receipts</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} disabled={isFormDisabled} /></FormControl><FormMessage /></FormItem> )} /></div>)}{conferenceVenue && conferenceVenue !== 'India' && (<FormField name="govtFundingRequestProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Proof of Govt. Funding Request</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} disabled={isFormDisabled} /></FormControl><FormDescription>Required for conferences outside India.</FormDescription><FormMessage /></FormItem> )} />)}</div>
                     {calculatedIncentive !== null && calculatedIncentive > 0 && (
                        <div className="p-4 bg-secondary rounded-md">
                            <p className="text-sm font-medium">Eligible Reimbursement Amount: <span className="font-bold text-lg text-primary">₹{calculatedIncentive.toLocaleString('en-IN')}</span></p>
                            <p className="text-xs text-muted-foreground">This is the maximum reimbursable amount based on policy. Actual amount is subject to verification.</p>
                        </div>
                    )}
                 </div>
                <div>
                    <h3 className="font-semibold text-sm -mb-2">DECLARATIONS</h3>
                    <Separator className="mt-4"/><div className="space-y-4 mt-4"><FormField name="wasPresentingAuthor" control={form.control} render={({ field }) => ( <FormItem><div className="flex items-center justify-between"><FormLabel>Were you the presenting author?</FormLabel><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isFormDisabled} /></FormControl></div><FormMessage /></FormItem> )} /><FormField name="isPuNamePresent" control={form.control} render={({ field }) => ( <FormItem><div className="flex items-center justify-between"><FormLabel>Is "Parul University" name present in the paper?</FormLabel><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isFormDisabled} /></FormControl></div><FormMessage /></FormItem> )} /><FormField name="wonPrize" control={form.control} render={({ field }) => ( <FormItem><div className="flex items-center justify-between"><FormLabel>Did your paper win a prize?</FormLabel><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isFormDisabled} /></FormControl></div><FormMessage /></FormItem> )} />{wonPrize && (<div className="space-y-4 pl-4 border-l-2"><FormField name="prizeDetails" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Prize Details</FormLabel><FormControl><Input placeholder="e.g., Best Paper Award" {...field} disabled={isFormDisabled} /></FormControl><FormMessage /></FormItem> )} /><FormField name="prizeProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach Prize Certificate (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} disabled={isFormDisabled} /></FormControl><FormMessage /></FormItem> )} /></div>)}<FormField name="attendedOtherConference" control={form.control} render={({ field }) => ( <FormItem><div className="flex items-center justify-between"><FormLabel>Have you attended any other conference this year?</FormLabel><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isFormDisabled} /></FormControl></div><FormMessage /></FormItem> )} /><FormField control={form.control} name="conferenceSelfDeclaration" render={({ field }) => ( <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isFormDisabled} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Self Declaration</FormLabel><FormMessage /><p className="text-xs text-muted-foreground">I hereby confirm that I have not applied/claimed for any incentive for the same application/publication earlier & Certified that I have availed only this conference in the calendar year.</p></div></FormItem> )} /></div>
                </div>
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
            <Button type="submit" disabled={isFormDisabled}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Submitting...' : 'Submit Claim'}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
