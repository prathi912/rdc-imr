
'use client';

import { useState, useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { GanttChartSquare, Microscope, Users, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { runTransaction, doc } from 'firebase/firestore';
import type { User } from '@/types';
import { Checkbox } from '@/components/ui/checkbox';

const formSchema = z.object({
  // Step 1
  title: z.string().min(5, 'Title must be at least 5 characters.'),
  abstract: z.string().min(20, 'Abstract must be at least 20 characters.'),
  projectType: z.string().min(1, 'Please select a project type.'),
  // Step 2
  coPiNames: z.string().optional(),
  studentInfo: z.string().optional(),
  cvUpload: z.any().optional(),
  // Step 3
  proposalUpload: z.any().optional(),
  budgetUpload: z.any().optional(),
  ethicsUpload: z.any().optional(),
  // Step 4
  ganttChart: z.any().optional(),
  expectedOutcomes: z.string().min(10, 'Please describe the expected outcomes.'),
  guidelinesAgreement: z.boolean().refine(val => val === true, {
    message: "You must agree to the guidelines to submit.",
  }),
});

type FormData = z.infer<typeof formSchema>;

const steps = [
  { id: 1, title: 'Project Details', icon: Microscope },
  { id: 2, title: 'Team Info', icon: Users },
  { id: 3, title: 'File Uploads', icon: FileText },
  { id: 4, title: 'Timeline & Outcomes', icon: GanttChartSquare },
];

export function SubmissionForm() {
  const [currentStep, setCurrentStep] = useState(1);
  const [user, setUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      abstract: '',
      projectType: '',
      coPiNames: '',
      studentInfo: '',
      expectedOutcomes: '',
      guidelinesAgreement: false,
    },
  });

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const handleNext = async () => {
    const fieldsToValidate = {
      1: ['title', 'abstract', 'projectType'],
      2: [],
      3: [],
      4: ['expectedOutcomes', 'guidelinesAgreement'],
    }[currentStep] as (keyof FormData)[];

    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) {
      if (currentStep < 4) {
        setCurrentStep(currentStep + 1);
      }
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = async (data: FormData) => {
    if (!user || !user.faculty || !user.institute || !user.department) {
      toast({
        variant: 'destructive',
        title: 'Profile Incomplete',
        description: 'Please complete your profile in Settings before submitting a project.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const counterRef = doc(db, 'counters', 'projects');

      await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let newCount;
        
        if (counterDoc.exists()) {
          const currentCount = counterDoc.data()?.count;
          if (typeof currentCount === 'number') {
            newCount = currentCount + 1;
          } else {
            // Document exists but has malformed data, reset count.
            newCount = 1;
          }
        } else {
          // Document does not exist, start from 1.
          newCount = 1;
        }

        const year = new Date().getFullYear();
        const projectType = data.projectType.replace(/\s+/g, '_');
        const paddedCount = String(newCount).padStart(4, '0');
        const newProjectId = `${year}_${projectType}_${paddedCount}`;
        
        const projectDocRef = doc(db, 'projects', newProjectId);

        const teamInfoParts = [];
        if (data.coPiNames && data.coPiNames.trim() !== '') {
          teamInfoParts.push(`Co-PIs: ${data.coPiNames}`);
        }
        if (data.studentInfo && data.studentInfo.trim() !== '') {
          teamInfoParts.push(`Students: ${data.studentInfo}`);
        }
        const teamInfo = teamInfoParts.join('; ');

        const projectData = {
          title: data.title,
          abstract: data.abstract,
          type: data.projectType,
          faculty: user.faculty,
          institute: user.institute,
          departmentName: user.department,
          pi: user.name,
          pi_uid: user.uid,
          teamInfo: teamInfo,
          timelineAndOutcomes: data.expectedOutcomes,
          status: 'Submitted' as const,
          submissionDate: new Date().toISOString(),
        };

        transaction.set(projectDocRef, projectData);
        transaction.set(counterRef, { count: newCount }, { merge: true });
      });
      
      toast({
        title: 'Project Submitted!',
        description: 'Your research project has been successfully submitted for review.',
      });
      form.reset();
      setCurrentStep(1);
    } catch (error) {
      console.error('Error adding document: ', error);
      toast({
        variant: 'destructive',
        title: 'Submission Failed',
        description: 'There was an error submitting your project. Please try again.',
      });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Step {currentStep}: {steps[currentStep - 1].title}</CardTitle>
            <CardDescription>Follow the steps to complete your submission.</CardDescription>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-muted-foreground">Progress</p>
            <Progress value={(currentStep / 4) * 100} className="w-32 mt-1" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {currentStep === 1 && (
              <div className="space-y-4">
                <FormField name="title" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Project Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="abstract" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Abstract</FormLabel><FormControl><Textarea rows={5} {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="projectType" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>Project Type</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Research">Research</SelectItem><SelectItem value="Development">Development</SelectItem><SelectItem value="Clinical Trial">Clinical Trial</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                )} />
                 <div className="p-4 border rounded-lg bg-muted/50 text-sm text-muted-foreground">
                    <p><span className="font-semibold text-foreground">Faculty:</span> {user?.faculty || 'Not set'}</p>
                    <p><span className="font-semibold text-foreground">Institute:</span> {user?.institute || 'Not set'}</p>
                    <p><span className="font-semibold text-foreground">Department:</span> {user?.department || 'Not set'}</p>
                    <p className="mt-2 text-xs">This information is from your profile. You can change it in <a href="/dashboard/settings" className="underline">Settings</a>.</p>
                </div>
              </div>
            )}
            {currentStep === 2 && (
              <div className="space-y-4">
                <FormItem>
                  <FormLabel>Principal Investigator (PI)</FormLabel>
                  <Input disabled value={user?.name || 'Loading...'} />
                </FormItem>
                <FormField name="coPiNames" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Co-PIs (comma-separated)</FormLabel><FormControl><Input {...field} placeholder="Dr. Jane Smith, Dr. John Doe" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="studentInfo" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Student Members</FormLabel><FormControl><Textarea {...field} placeholder="List student names and roles..." /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="cvUpload" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Upload CVs (ZIP file)</FormLabel><FormControl><Input type="file" accept=".zip" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            )}
            {currentStep === 3 && (
              <div className="space-y-6">
                <FormField name="proposalUpload" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Project Proposal (PDF)</FormLabel><FormControl><Input type="file" accept=".pdf" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="budgetUpload" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Budget Plan (XLSX, PDF)</FormLabel><FormControl><Input type="file" accept=".xlsx, .pdf" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="ethicsUpload" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Ethics Approval (if applicable)</FormLabel><FormControl><Input type="file" accept=".pdf" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            )}
            {currentStep === 4 && (
              <div className="space-y-6">
                 <FormField name="ganttChart" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Timeline / Gantt Chart (PDF, PNG)</FormLabel><FormControl><Input type="file" accept=".pdf, .png" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="expectedOutcomes" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Expected Outcomes & Impact</FormLabel><FormControl><Textarea rows={5} {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField
                  control={form.control}
                  name="guidelinesAgreement"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>
                          Declaration
                        </FormLabel>
                        <FormMessage />
                          <p className="text-sm text-muted-foreground">
                          I declare that I have gone through all the guidelines of the{" "}
                          <a
                            href="https://firebasestorage.googleapis.com/v0/b/pierc-portal.firebasestorage.app/o/Notification%201446_Revision%20in%20the%20Research%20%26%20Development%20Policy%20of%20the%20University.pdf?alt=media&token=3578f9f4-4e38-419b-aa29-3ecc5a8c32bf"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-primary underline-offset-4 hover:underline"
                          >
                            Research Policy of Parul University
                          </a>
                          .
                        </p>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            )}
            <div className="flex justify-between pt-4">
              <Button type="button" variant="outline" onClick={handlePrevious} disabled={currentStep === 1 || isSubmitting}>Previous</Button>
              {currentStep < 4 && <Button type="button" onClick={handleNext} disabled={isSubmitting}>Next</Button>}
              {currentStep === 4 && <Button type="submit" disabled={isSubmitting || !form.watch('guidelinesAgreement')}>{isSubmitting ? "Submitting..." : "Submit Project"}</Button>}
            </div>
          </form>
        </FormProvider>
      </CardContent>
    </Card>
  );
}
