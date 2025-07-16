
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { User, EmrProject } from '@/types';
import { db } from '@/lib/config';
import { doc, setDoc, getDoc, collection } from 'firebase/firestore';
import { uploadFileToServer } from '@/app/actions';

const emrSubmissionSchema = z.object({
  title: z.string().min(5, 'Project title is required.'),
  fundingAgency: z.string().min(2, 'Funding agency is required.'),
  callName: z.string().optional(),
  estimatedBudget: z.coerce.number().positive('Estimated budget must be a positive number.'),
  deadlineToApply: z.string().optional(),
  presentation: z.any().refine((files) => files?.length === 1, 'A presentation file is required.'),
});

type EmrSubmissionFormValues = z.infer<typeof emrSubmissionSchema>;

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
};

export default function NewEmrSubmissionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const callId = searchParams.get('callId');

  const form = useForm<EmrSubmissionFormValues>({
    resolver: zodResolver(emrSubmissionSchema),
    defaultValues: {
      title: '',
      fundingAgency: '',
      callName: '',
      estimatedBudget: 0,
      deadlineToApply: '',
    },
  });

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  useEffect(() => {
    if (callId) {
      const fetchCallData = async () => {
        const callRef = doc(db, 'fundingCalls', callId);
        const callSnap = await getDoc(callRef);
        if (callSnap.exists()) {
          const callData = callSnap.data();
          form.reset({
            fundingAgency: callData.fundingAgency,
            callName: callData.title,
            deadlineToApply: callData.deadline,
          });
        }
      };
      fetchCallData();
    }
  }, [callId, form]);

  async function onSubmit(data: EmrSubmissionFormValues) {
    if (!user) {
      toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to submit.' });
      return;
    }
    setIsSubmitting(true);
    try {
      const emrProjectId = doc(collection(db, 'emrProjects')).id;
      const presentationFile = data.presentation[0];

      const presentationDataUrl = await fileToDataUrl(presentationFile);
      const presentationPath = `emr-presentations/${emrProjectId}/${presentationFile.name}`;
      const uploadResult = await uploadFileToServer(presentationDataUrl, presentationPath);

      if (!uploadResult.success || !uploadResult.url) {
        throw new Error(uploadResult.error || 'Failed to upload presentation.');
      }

      const newEmrProject: Omit<EmrProject, 'id'> = {
        pi_uid: user.uid,
        pi_name: user.name,
        pi_email: user.email,
        title: data.title,
        fundingAgency: data.fundingAgency,
        callName: data.callName,
        estimatedBudget: data.estimatedBudget,
        deadlineToApply: data.deadlineToApply,
        presentationUrl: uploadResult.url,
        status: 'Pending Approval',
        submissionDate: new Date().toISOString(),
      };

      await setDoc(doc(db, 'emrProjects', emrProjectId), newEmrProject);
      toast({ title: 'Success', description: 'Your EMR proposal has been submitted for internal review.' });
      router.push('/dashboard/emr-projects');
    } catch (error: any) {
      console.error('EMR Submission Error:', error);
      toast({ variant: 'destructive', title: 'Submission Failed', description: error.message || 'An unexpected error occurred.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="container mx-auto max-w-2xl py-10">
      <PageHeader
        title="New EMR Proposal Submission"
        description="Submit your proposal for an externally funded project for internal committee review."
        backButtonHref="/dashboard/emr-projects"
      />
      <div className="mt-8">
        <Card>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardHeader>
                <CardTitle>Proposal Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem><FormLabel>Project Title</FormLabel><FormControl><Input placeholder="Title of your research project" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="fundingAgency" render={({ field }) => (
                  <FormItem><FormLabel>Funding Agency</FormLabel><FormControl><Input placeholder="e.g., DST, SERB, DBT" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="callName" render={({ field }) => (
                  <FormItem><FormLabel>Call/Opportunity Name (if any)</FormLabel><FormControl><Input placeholder="e.g., SERB-POWER Grant" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="estimatedBudget" render={({ field }) => (
                  <FormItem><FormLabel>Estimated Budget (INR)</FormLabel><FormControl><Input type="number" placeholder="e.g., 500000" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="presentation" render={({ field }) => (
                  <FormItem><FormLabel>Presentation File</FormLabel><FormControl><Input type="file" accept=".ppt, .pptx, .pdf" onChange={(e) => field.onChange(e.target.files)} /></FormControl><FormMessage /></FormItem>
                )} />
                {form.getValues('deadlineToApply') && (
                  <FormField control={form.control} name="deadlineToApply" render={({ field }) => (
                    <FormItem><FormLabel>Agency Deadline</FormLabel><FormControl><Input value={new Date(field.value!).toLocaleDateString()} disabled /></FormControl><FormMessage /></FormItem>
                  )} />
                )}
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Submitting...' : 'Submit for Approval'}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      </div>
    </div>
  );
}
