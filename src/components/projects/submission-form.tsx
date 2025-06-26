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

const formSchema = z.object({
  // Step 1
  title: z.string().min(5, 'Title must be at least 5 characters.'),
  abstract: z.string().min(20, 'Abstract must be at least 20 characters.'),
  projectType: z.string().min(1, 'Please select a project type.'),
  faculty: z.string().min(1, 'Please select a faculty.'),
  institute: z.string().min(1, 'Please select an institute.'),
  departmentName: z.string().min(2, 'Department name is required.'),
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

const faculties = [
    "Faculty of Engineering & Technology",
    "Faculty of Diploma Studies",
    "Faculty of Applied Sciences",
    "Faculty of Computer Applications",
    "Faculty of Agriculture",
    "Faculty of Architecture & Planning",
    "Faculty of Design",
    "Faculty of Fine Arts",
    "Faculty of Arts",
    "Faculty of Commerce",
    "Faculty of Social Work",
    "Faculty of Management Studies",
    "Faculty of Hotel Management & Catering Technology",
    "Faculty of Law",
    "Faculty of Medicine",
    "Faculty of Homoeopathy",
    "Faculty of Ayurveda",
    "Faculty of Nursing",
    "Faculty of Pharmacy",
    "Faculty of Physiotherapy",
    "Faculty of Public Health",
];

const institutes = [
    "Parul Institute of Engineering & Technology",
    "Parul Institute of Technology",
    "Parul Diploma Studies",
    "Parul Institute of Computer Application",
    "Parul Institute of Applied Sciences",
    "Parul Institute of Agriculture",
    "Parul Institute of Architecture and Research",
    "Faculty of Design",
    "Parul Institute of Fine Arts",
    "Parul Institute of Arts",
    "Parul Institute of Commerce",
    "Parul Institute of Social Work",
    "Faculty of Management Studies",
    "Parul Institute of Hotel Management & Catering Technology",
    "Parul Institute of Law",
    "Parul Medical College & Hospital",
    "Jawaharlal Nehru Homoeopathic Medical College",
    "Ahmedabad Homoeopathic Medical College",
    "Parul Institute of Homoeopathy & Research",
    "Rajkot Homoeopathic Medical College",
    "Parul Institute of Ayurved",
    "Parul Institute of Ayurved & Research",
    "Parul Institute of Nursing",
    "Parul Institute of Pharmacy",
    "Parul Institute of Pharmacy & Research",
    "Parul Institute of Physiotherapy",
    "Faculty of Public Health",
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
      faculty: '',
      institute: '',
      departmentName: '',
      coPiNames: '',
      studentInfo: '',
      expectedOutcomes: '',
    },
  });

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser) as User;
      setUser(parsedUser);
      // Pre-fill form with user profile data
      if (parsedUser.faculty) form.setValue('faculty', parsedUser.faculty);
      if (parsedUser.institute) form.setValue('institute', parsedUser.institute);
      if (parsedUser.department) form.setValue('departmentName', parsedUser.department);
    }
  }, [form]);

  const handleNext = async () => {
    const fieldsToValidate = {
      1: ['title', 'abstract', 'projectType', 'faculty', 'institute', 'departmentName'],
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
      const counterRef = doc(db, 'counters', 'projects');

      await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let newCount = 1;
        if (counterDoc.exists()) {
          newCount = counterDoc.data().count + 1;
        }

        const year = new Date().getFullYear();
        const projectType = data.projectType.replace(/\s+/g, '_');
        const paddedCount = String(newCount).padStart(4, '0');
        const newProjectId = `${year}_${projectType}_${paddedCount}`;
        
        const projectDocRef = doc(db, 'projects', newProjectId);

        const projectData = {
          title: data.title,
          abstract: data.abstract,
          type: data.projectType,
          faculty: data.faculty,
          institute: data.institute,
          departmentName: data.departmentName,
          pi: user.name,
          pi_uid: user.uid,
          teamInfo: `PI: ${user.name}; Co-PIs: ${data.coPiNames || 'N/A'}; Students: ${data.studentInfo || 'N/A'}`,
          timelineAndOutcomes: data.expectedOutcomes,
          status: 'Under Review' as const,
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField name="projectType" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>Project Type</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Research">Research</SelectItem><SelectItem value="Development">Development</SelectItem><SelectItem value="Clinical Trial">Clinical Trial</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                  )} />
                   <FormField name="faculty" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>Faculty</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled><FormControl><SelectTrigger><SelectValue placeholder="Select faculty" /></SelectTrigger></FormControl>
                    <SelectContent>
                        {faculties.map(faculty => <SelectItem key={faculty} value={faculty}>{faculty}</SelectItem>)}
                    </SelectContent>
                    </Select><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField name="institute" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>Institute</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled><FormControl><SelectTrigger><SelectValue placeholder="Select institute" /></SelectTrigger></FormControl>
                    <SelectContent>
                        {institutes.map(institute => <SelectItem key={institute} value={institute}>{institute}</SelectItem>)}
                    </SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
                <FormField name="departmentName" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>Department Name</FormLabel><FormControl><Input {...field} placeholder="e.g., Computer Science & Engineering" disabled /></FormControl><FormMessage /></FormItem>
                )} />
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
