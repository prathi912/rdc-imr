'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import type { User, IncentiveClaim, Author } from '@/types';
import { uploadFileToApi } from '@/lib/upload-client';
import { Loader2, AlertCircle, Trash2, Plus, Calendar as CalendarIcon, Bot, CheckCircle2, FileText, X, Globe } from 'lucide-react';
import { submitIncentiveClaimViaApi } from '@/lib/incentive-claim-client';
import { getIncentiveClaimByIdAction } from '@/app/actions';
import { AuthorSearch } from './author-search';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const workshopEventTypes = ['STTP', 'Workshop', 'Training Program', 'FDP', 'Other'];

const allEventTypes = [
  'Conference',
  'Seminar',
  'Symposium',
  'Invited Talk/Guest Speaker',
  ...workshopEventTypes,
];

const workshopSchema = z
  .object({
    eventType: z.string({ required_error: 'Please select an event type.' }),
    workshopName: z.string().min(3, 'Workshop/FDP name is required.'),
    workshopStartDate: z.string().min(1, 'Start date is required.'),
    workshopEndDate: z.string().min(1, 'End date is required.'),
    attendanceMode: z.enum(['Online', 'Offline'], { required_error: 'Attendance mode is required.' }),
    organizerName: z.string().min(2, 'Organizer name is required.'),
    eventTypeLevel: z.enum(['International', 'National', 'Regional/State', 'Other'], { required_error: 'Event level is required.' }),
    registrationFee: z.coerce.number().nonnegative('Fee cannot be negative.').optional(),
    registrationFeeProof: z.any().optional().refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
    workshopCertificate: z
      .any()
      .refine((files) => files?.length > 0, 'Participation certificate is required.')
      .refine((files) => files?.[0]?.type === 'application/pdf', 'File must be a PDF.')
      .refine((files) => files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
    travelPlaceVisited: z.string().optional(),
    travelMode: z.enum(['Bus', 'Train', 'Air', 'Other']).optional(),
    travelDetails: z.string().optional(),
    travelFare: z.coerce.number().nonnegative('Fare cannot be negative.').optional(),
    travelReceipts: z.any().optional().refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
    workshopSelfDeclaration: z.boolean().refine((val) => val === true, { message: 'You must agree to the self-declaration.' }),
    authors: z
      .array(
        z
          .object({
            name: z.string().min(2, 'Author name is required.'),
            email: z.string().email('Invalid email format.').or(z.literal('')),
            uid: z.string().optional().nullable(),
            role: z.enum(['First Author', 'Corresponding Author', 'Co-Author', 'First & Corresponding Author', "Presenting Author", "First & Presenting Author"]),
            isExternal: z.boolean(),
            status: z.enum(['approved', 'pending', 'Applied'])
          })
          .refine((data) => data.isExternal || !!data.email, {
            message: 'Email is required for internal authors.',
            path: ['email'],
          })
      )
      .min(1, 'At least one author is required.')
      .refine(data => {
        const firstAuthors = data.filter(author => author.role === 'First Author' || author.role === 'First & Corresponding Author');
        return firstAuthors.length <= 1;
      }, { message: 'Only one author can be designated as the First Author.', path: ['authors'] }),
  })
  .refine((data) => data.attendanceMode === 'Online' || (!!data.travelPlaceVisited && data.travelPlaceVisited.length > 1), {
    message: 'Place visited is required for offline attendance.',
    path: ['travelPlaceVisited'],
  })
  .refine((data) => data.attendanceMode === 'Online' || !!data.travelMode, {
    message: 'Travel mode is required for offline attendance.',
    path: ['travelMode'],
  })
  .refine((data) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return new Date(data.workshopStartDate) <= today;
  }, {
    message: "Start date cannot be in the future.",
    path: ["workshopStartDate"],
  })
  .refine((data) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return new Date(data.workshopEndDate) <= today;
  }, {
    message: "End date cannot be in the future.",
    path: ["workshopEndDate"],
  })
  .refine((data) => {
    return new Date(data.workshopEndDate) >= new Date(data.workshopStartDate);
  }, {
    message: "End date must be on or after the start date.",
    path: ["workshopEndDate"],
  });

type WorkshopFormValues = z.infer<typeof workshopSchema>;

const eventLevelOptions = ['International', 'National', 'Regional/State', 'Other'];

type WorkshopFormProps = {
  initialEventType?: string | null;
  onEventTypeChange?: (eventType: string | null) => void;
};

export function WorkshopForm({ initialEventType, onEventTypeChange }: WorkshopFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false);
  const [orcidOrMisIdMissing, setOrcidOrMisIdMissing] = useState(false);
  const [showDraftWarning, setShowDraftWarning] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(true);

  const form = useForm<WorkshopFormValues>({
    resolver: zodResolver(workshopSchema),
    defaultValues: {
      eventType: initialEventType || '',
      workshopName: '',
      workshopStartDate: '',
      workshopEndDate: '',
      authors: [],
      attendanceMode: undefined,
      organizerName: '',
      eventTypeLevel: undefined,
      registrationFee: 0,
      registrationFeeProof: undefined,
      workshopCertificate: undefined,
      travelPlaceVisited: '',
      travelMode: undefined,
      travelDetails: '',
      travelFare: 0,
      travelReceipts: undefined,
      workshopSelfDeclaration: false,
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "authors",
  });

  const coAuthorRoles: Author['role'][] = ['First Author', 'Corresponding Author', 'Co-Author', 'Presenting Author', 'First & Presenting Author'];

  const selectedEventType = form.watch('eventType');
  const attendanceMode = form.watch('attendanceMode');

  useEffect(() => {
    if (initialEventType) {
      form.setValue('eventType', initialEventType);
    }
  }, [initialEventType, form]);

  // Notify parent when event type changes to a non-workshop type
  useEffect(() => {
    if (selectedEventType && !workshopEventTypes.includes(selectedEventType)) {
      onEventTypeChange?.(selectedEventType);
    }
  }, [selectedEventType, onEventTypeChange]);

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
          role: "First Author",
          isExternal: false,
          status: 'approved'
        })
      }
    }
    const claimId = searchParams.get('claimId');
    if (!claimId) {
      setIsLoadingDraft(false);
    }
  }, [searchParams]);

  useEffect(() => {
    const claimId = searchParams.get('claimId');
    if (claimId && user) {
      const fetchDraft = async () => {
        setIsLoadingDraft(true);
        try {
          const result = await getIncentiveClaimByIdAction(claimId);
          if (result.success && result.data) {
            const draftData = result.data as any;
            form.reset({
              ...draftData,
              authors: draftData.authors || [],
              registrationFeeProof: undefined,
              workshopCertificate: undefined,
              travelReceipts: undefined,
            });
          } else {
            toast({ variant: 'destructive', title: result.error || 'Draft Not Found' });
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
        const path = `incentive-proofs/${user.uid}/${folderName}/${new Date().toISOString()}-${file.name}`;
        const result = await uploadFileToApi(file, { path });
        if (!result.success || !result.url) {
          throw new Error(result.error || `File upload failed for ${folderName}`);
        }
        return result.url;
      };

      const { registrationFeeProof, workshopCertificate, travelReceipts, ...restOfData } = data;

      const [registrationFeeProofUrl, workshopCertificateUrl, travelReceiptsUrl] = await Promise.all([
        uploadFileHelper(registrationFeeProof?.[0], 'workshop-registration-proof'),
        uploadFileHelper(workshopCertificate?.[0], 'workshop-certificate'),
        uploadFileHelper(travelReceipts?.[0], 'workshop-travel-receipts'),
      ]);

      const claimData: Omit<IncentiveClaim, 'id' | 'claimId'> = {
        ...restOfData,
        workshopStartDate: data.workshopStartDate,
        workshopEndDate: data.workshopEndDate,
        registrationFeeProofUrl: registrationFeeProofUrl ?? undefined,
        workshopCertificateUrl: workshopCertificateUrl ?? undefined,
        travelReceiptsUrl: travelReceiptsUrl ?? undefined,
        calculatedIncentive: undefined,
        misId: user.misId ?? undefined,
        orcidId: user.orcidId ?? undefined,
        bankDetails: user.bankDetails ?? undefined,
        claimType: 'Workshop/FDP/Training',
        benefitMode: 'reimbursement',
        uid: user.uid,
        userName: user.name,
        userEmail: user.email,
        faculty: user.faculty,
        status,
        submissionDate: new Date().toISOString(),
      };

      const result = await submitIncentiveClaimViaApi(claimData);

      if (!result.success) {
        throw new Error(result.error);
      }

      const claimId = searchParams.get('claimId') || result.claimId;

      if (status === 'Draft') {
        toast({ title: 'Draft Saved!', description: "You can continue editing from the 'Incentive Claim' page." });
        if (!searchParams.get('claimId')) {
          router.push(`/dashboard/incentive-claim/conference?claimId=${claimId}`);
        }
      } else {
        toast({ title: 'Success', description: 'Your incentive claim has been submitted.' });
        router.push('/dashboard/incentive-claim');
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to submit claim. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  const onFinalSubmit = () => handleSave('Pending');

  const firstAuthorExists = fields.some(author => author.role === 'First Author' || author.role === 'First & Corresponding Author');

  const getAvailableRoles = (currentAuthor?: Author) => {
    const isCurrentAuthorFirst = currentAuthor && (currentAuthor.role === 'First Author' || currentAuthor.role === 'First & Corresponding Author');
    if (firstAuthorExists && !isCurrentAuthorFirst) {
      return coAuthorRoles.filter(role => role !== 'First Author' && role !== 'First & Corresponding Author');
    }
    return coAuthorRoles;
  };

  const removeAuthor = (index: number) => {
    const authorToRemove = fields[index];
    if (authorToRemove.email.toLowerCase() === user?.email.toLowerCase()) {
      toast({ variant: 'destructive', title: 'Action not allowed', description: 'You cannot remove yourself as the primary author.' });
      return;
    }
    remove(index);
  };

  const updateAuthorRole = (index: number, role: Author['role']) => {
    const currentAuthors = form.getValues('authors');
    const author = currentAuthors[index];
    const isTryingToBeFirst = role === 'First Author' || role === 'First & Corresponding Author';
    const isAnotherFirst = currentAuthors.some((a, i) => i !== index && (a.role === 'First Author' || a.role === 'First & Corresponding Author'));

    if (isTryingToBeFirst && isAnotherFirst) {
      toast({ title: 'Conflict', description: 'Another author is already the First Author.', variant: 'destructive' });
      return;
    }

    update(index, { ...author, role });
  };

  if (isLoadingDraft) {
    return (
      <Card className="p-8 flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </Card>
    );
  }

  return (
    <Card>
      <Form {...form}>
        <form>
          <CardContent className="space-y-6 pt-6">
            {(bankDetailsMissing || orcidOrMisIdMissing) && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Profile Incomplete</AlertTitle>
                <AlertDescription>
                  An ORCID iD, MIS ID, and bank details are mandatory for submitting incentive claims. Please add them to your profile.
                  <Button asChild variant="link" className="p-1 h-auto">
                    <Link href="/dashboard/settings">Go to Settings</Link>
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-lg border p-4 space-y-6">
              <div>
                <h3 className="font-semibold text-sm -mb-2">DETAILS OF WORKSHOP/FDP/TRAINING</h3>
                <Separator className="mt-4" />
                <div className="space-y-4 mt-4">
                  <FormField
                    name="eventType"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type of Event</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select event type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {allEventTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="workshopName"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Workshop/FDP Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Name of the program" {...field} disabled={isSubmitting} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="attendanceMode"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Attendance Mode</FormLabel>
                        <FormControl>
                          <RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6">
                            <FormItem className="flex items-center space-x-2 space-y-0">
                              <FormControl>
                                <RadioGroupItem value="Online" disabled={isSubmitting} />
                              </FormControl>
                              <FormLabel className="font-normal">Online</FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-2 space-y-0">
                              <FormControl>
                                <RadioGroupItem value="Offline" disabled={isSubmitting} />
                              </FormControl>
                              <FormLabel className="font-normal">Offline</FormLabel>
                            </FormItem>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="organizerName"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organizer Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Name of institution/organisation" {...field} disabled={isSubmitting} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="eventTypeLevel"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event Level</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select event level" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {eventLevelOptions.map((level) => (
                              <SelectItem key={level} value={level}>
                                {level}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {/* Author selection hidden for Workshop/STTP/FDP/Training as it is individual participation */}
                  <FormField
                    name="authors"
                    control={form.control}
                    render={() => (
                      <div className="hidden">
                        <FormMessage />
                      </div>
                    )}
                  />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      name="registrationFee"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Registration Fee (INR)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" {...field} disabled={isSubmitting} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="registrationFeeProof"
                      control={form.control}
                      render={({ field: { value, onChange, ...fieldProps } }) => (
                        <FormItem>
                          <FormLabel>Registration Fee Proof (PDF, Below 10MB)</FormLabel>
                          <FormControl>
                            <Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} disabled={isSubmitting} accept="application/pdf" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    name="workshopCertificate"
                    control={form.control}
                    render={({ field: { value, onChange, ...fieldProps } }) => (
                      <FormItem>
                        <FormLabel>Participation/Completion Certificate (PDF, Below 10MB)</FormLabel>
                        <FormControl>
                          <Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} disabled={isSubmitting} accept="application/pdf" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {attendanceMode === 'Offline' && (
                <div>
                  <h3 className="font-semibold text-sm -mb-2">TRAVEL DETAILS</h3>
                  <Separator className="mt-4" />
                  <div className="space-y-4 mt-4">
                    <FormField
                      name="travelPlaceVisited"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Place Visited</FormLabel>
                          <FormControl>
                            <Input placeholder="City/Location" {...field} disabled={isSubmitting} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="travelMode"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Travel Mode</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select travel mode" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Bus">Bus</SelectItem>
                              <SelectItem value="Train">Train</SelectItem>
                              <SelectItem value="Air">Air</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="travelDetails"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Travel Details</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Ticket/route/class details" {...field} disabled={isSubmitting} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="travelFare"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Travel Fare Incurred (INR)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" {...field} disabled={isSubmitting} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="travelReceipts"
                      control={form.control}
                      render={({ field: { value, onChange, ...fieldProps } }) => (
                        <FormItem>
                          <FormLabel>Attach Tickets/Receipts (PDF, Below 10MB)</FormLabel>
                          <FormControl>
                            <Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} disabled={isSubmitting} accept="application/pdf" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-semibold text-sm -mb-2">DECLARATION</h3>
                <Separator className="mt-4" />
                <div className="space-y-4 mt-4">
                  <FormField
                    name="workshopSelfDeclaration"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isSubmitting} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Self Declaration</FormLabel>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground">
                            I hereby confirm that I have not applied/claimed for any incentive for the same event earlier.
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <AlertDialog open={showDraftWarning} onOpenChange={setShowDraftWarning}>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="outline" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save as Draft
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-3xl border-primary/20 shadow-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-xl font-black flex items-center gap-2">
                    <Bot className="h-5 w-5 text-primary" /> Save as Draft?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-sm font-medium leading-relaxed pt-2">
                    Your progress will be saved, but please note that <span className="font-bold text-foreground underline decoration-primary decoration-2">any uploaded files will not be saved</span> in this draft.
                    <br /><br />
                    You will need to upload your documents again when you are ready for final review and submission.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="pt-4">
                  <AlertDialogCancel className="rounded-xl font-bold">Review Files</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => handleSave("Draft")}
                    className="rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Save Anyway
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button type="button" onClick={onFinalSubmit} disabled={isSubmitting || bankDetailsMissing || orcidOrMisIdMissing}>
              Submit Claim
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
