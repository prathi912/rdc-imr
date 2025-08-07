
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
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

const membershipSchema = z
  .object({
    professionalBodyName: z.string().min(3, 'Name of the professional body is required.'),
    membershipFee: z.coerce.number().positive('A valid membership fee is required.'),
    membershipProof: z.any().refine((files) => files?.length > 0, 'Proof of membership/payment is required.'),
    membershipSelfDeclaration: z.boolean().refine(val => val === true, { message: 'You must agree to the self-declaration.' }),
  });

type MembershipFormValues = z.infer<typeof membershipSchema>;

const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};

export function MembershipForm() {
  const { toast } = useToast();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false);
  
  const form = useForm<MembershipFormValues>({
    resolver: zodResolver(membershipSchema),
    defaultValues: {
      professionalBodyName: '',
      membershipFee: 0,
      membershipProof: undefined,
      membershipSelfDeclaration: false,
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

  async function onSubmit(data: MembershipFormValues) {
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

      const membershipProofUrl = await uploadFileHelper(data.membershipProof?.[0], 'membership-proof');

      const claimData: Omit<IncentiveClaim, 'id'> = {
        ...data,
        misId: user.misId,
        orcidId: user.orcidId,
        claimType: 'Membership of Professional Bodies',
        benefitMode: 'reimbursement',
        uid: user.uid,
        userName: user.name,
        userEmail: user.email,
        faculty: user.faculty,
        status: 'Pending',
        submissionDate: new Date().toISOString(),
        bankDetails: user.bankDetails,
      };

      if (membershipProofUrl) claimData.membershipProofUrl = membershipProofUrl;

      await addDoc(collection(db, 'incentiveClaims'), claimData);
      toast({ title: 'Success', description: 'Your incentive claim for membership has been submitted.' });
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

            <div className="rounded-lg border p-4 space-y-4 animate-in fade-in-0">
                <h3 className="font-semibold text-sm -mb-2">MEMBERSHIP DETAILS</h3>
                <Separator />
                <FormField name="professionalBodyName" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Name of Professional Body</FormLabel><FormControl><Input placeholder="e.g., Institute of Electrical and Electronics Engineers" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="membershipFee" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Membership Fee (INR)</FormLabel><FormControl><Input type="number" placeholder="e.g., 10000" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="membershipProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach Proof of Membership/Payment (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} /></FormControl><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="membershipSelfDeclaration" render={({ field }) => ( <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Self Declaration</FormLabel><FormMessage /><p className="text-xs text-muted-foreground">I hereby certify that this is the only application for Professional Body Membership incentive in the current calendar year.</p></div></FormItem> )} />
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
