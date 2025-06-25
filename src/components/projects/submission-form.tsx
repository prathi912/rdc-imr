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
import { addDoc, collection } from 'firebase/firestore';
import type { User } from '@/types';

const formSchema = z.object({
  // Step 1
  title: z.string().min(5, 'Title must be at least 5 characters.'),
  abstract: z.string().min(20, 'Abstract must be at least 20 characters.'),
  projectType: z.string().min(1, 'Please select a project type.'),
  department: z.string().min(1, 'Please select a department.'),
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
      department: '',
      coPiNames: '',
      studentInfo: '',
      expectedOutcomes: '',
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
      1: ['title', 'abstract', 'projectType', 'department'],
      2: [],
      3: [],
      4: ['expectedOutcomes'],
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
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be logged in to submit a project.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'projects'), {
        title: data.title,
        abstract: data.abstract,
        type: data.projectType,
        department: data.department,
        pi: user.name,
        pi_uid: user.uid,
        teamInfo: `PI: ${user.name}; Co-PIs: ${data.coPiNames || 'N/A'}; Students: ${data.studentInfo || 'N/A'}`,
        timelineAndOutcomes: data.expectedOutcomes,
        status: 'Under Review',
        submissionDate: new Date().toISOString(),
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField name="projectType" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>Project Type</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="research">Research</SelectItem><SelectItem value="development">Development</SelectItem><SelectItem value="clinical_trial">Clinical Trial</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                  )} />
                  <FormField name="department" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>Department</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger></FormControl><SelectContent><SelectItem value="cs">Computer Science</SelectItem><SelectItem value="physics">Physics</SelectItem><SelectItem value="medical">Medical Research</SelectItem><SelectItem value="engineering">Engineering</SelectItem><SelectItem value="arts_humanities">Arts & Humanities</SelectItem><SelectItem value="civil_engineering">Civil Engineering</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                  )} />
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
              <div className="space-y-4">
                 <FormField name="ganttChart" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Timeline / Gantt Chart (PDF, PNG)</FormLabel><FormControl><Input type="file" accept=".pdf, .png" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="expectedOutcomes" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Expected Outcomes & Impact</FormLabel><FormControl><Textarea rows={5} {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            )}
            <div className="flex justify-between pt-4">
              <Button type="button" variant="outline" onClick={handlePrevious} disabled={currentStep === 1 || isSubmitting}>Previous</Button>
              {currentStep < 4 && <Button type="button" onClick={handleNext} disabled={isSubmitting}>Next</Button>}
              {currentStep === 4 && <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Submitting..." : "Submit Project"}</Button>}
            </div>
          </form>
        </FormProvider>
      </CardContent>
    </Card>
  );
}
