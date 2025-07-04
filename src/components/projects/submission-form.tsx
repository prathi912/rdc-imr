
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { GanttChartSquare, Microscope, Users, FileText, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { User, Project } from '@/types';
import { Checkbox } from '@/components/ui/checkbox';
import { db } from '@/lib/config';
import { collection, doc, setDoc } from 'firebase/firestore';
import { uploadFileToServer, notifyAdminsOnProjectSubmission } from '@/app/actions';

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
  proposalUpload: z.any().refine((files) => files?.length > 0, 'Project proposal is required.'),
  ethicsUpload: z.any().optional(),
  // Step 4
  expectedOutcomes: z.string().min(10, 'Please describe the expected outcomes.'),
  guidelinesAgreement: z.boolean().refine(val => val === true, {
    message: "You must agree to the guidelines to submit.",
  }),
});

type FormData = z.infer<typeof formSchema>;

interface SubmissionFormProps {
  project?: Project;
}

const steps = [
  { id: 1, title: 'Project Details', icon: Microscope },
  { id: 2, title: 'Team Info', icon: Users },
  { id: 3, title: 'File Uploads', icon: FileText },
  { id: 4, title: 'Timeline & Outcomes', icon: GanttChartSquare },
];

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
};

export function SubmissionForm({ project }: SubmissionFormProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [user, setUser] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();
  const router = useRouter();
  
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

  useEffect(() => {
    if (project) {
        const teamInfo = project.teamInfo || '';
        const coPiRegex = /Co-PIs: (.*?)(; Students:|$)/;
        const studentRegex = /Students: (.*)/;
        const coPiMatch = teamInfo.match(coPiRegex);
        const studentMatch = teamInfo.match(studentRegex);

        form.reset({
            title: project.title,
            abstract: project.abstract,
            projectType: project.type,
            coPiNames: coPiMatch ? coPiMatch[1].trim() : '',
            studentInfo: studentMatch ? studentMatch[1].trim() : '',
            expectedOutcomes: project.timelineAndOutcomes,
            guidelinesAgreement: project.status !== 'Draft',
        });
    }
  }, [project, form]);

  const handleNext = async () => {
    const fieldsToValidate = {
      1: ['title', 'abstract', 'projectType'],
      2: [], // No required fields in step 2
      3: project ? [] : ['proposalUpload'], // Proposal only required for new submissions, not for drafts being updated
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

  const handleSave = async (status: 'Draft' | 'Submitted') => {
    if (!user || !user.faculty || !user.institute || !user.department) {
      toast({
        variant: 'destructive',
        title: 'Profile Incomplete',
        description: 'Please complete your profile in Settings before submitting.',
      });
      return;
    }

    setIsSaving(true);
    setProgress(5);
    const data = form.getValues();

    try {
      const projectId = project?.id || doc(collection(db, 'projects')).id;

      const uploadFile = async (file: File, folder: string): Promise<string> => {
        const dataUrl = await fileToDataUrl(file);
        const path = `projects/${projectId}/${folder}/${file.name}`;
        const result = await uploadFileToServer(dataUrl, path);
        console.log('Upload result for', file.name, ':', result);
        if (result.success && result.url) return result.url;
        throw new Error(result.error || `Failed to upload ${file.name}`);
      };

      let cvUrl = project?.cvUrl;
      if (data.cvUpload && data.cvUpload.length > 0) {
        cvUrl = await uploadFile(data.cvUpload[0], 'cv');
        setProgress(30);
      }

      let proposalUrl = project?.proposalUrl;
      if (data.proposalUpload && data.proposalUpload.length > 0) {
        proposalUrl = await uploadFile(data.proposalUpload[0], 'proposal');
        setProgress(60);
      }

      let ethicsUrl = project?.ethicsUrl;
      if (data.ethicsUpload && data.ethicsUpload.length > 0) {
        ethicsUrl = await uploadFile(data.ethicsUpload[0], 'ethics');
        setProgress(90);
      }
      
      const teamInfoParts = [];
      if (data.coPiNames && data.coPiNames.trim() !== '') teamInfoParts.push(`Co-PIs: ${data.coPiNames}`);
      if (data.studentInfo && data.studentInfo.trim() !== '') teamInfoParts.push(`Students: ${data.studentInfo}`);
      const teamInfo = teamInfoParts.join('; ');

      const projectData: Omit<Project, 'id'> = {
        title: data.title,
        abstract: data.abstract,
        type: data.projectType,
        faculty: user.faculty,
        institute: user.institute,
        departmentName: user.department,
        pi: user.name,
        pi_uid: user.uid,
        pi_email: user.email,
        pi_phoneNumber: user.phoneNumber,
        teamInfo,
        timelineAndOutcomes: data.expectedOutcomes,
        status: status,
        submissionDate: project?.submissionDate || new Date().toISOString(),
      };

      // Conditionally add URLs to avoid 'undefined' values
      if (proposalUrl) projectData.proposalUrl = proposalUrl;
      if (cvUrl) projectData.cvUrl = cvUrl;
      if (ethicsUrl) projectData.ethicsUrl = ethicsUrl;

      await setDoc(doc(db, 'projects', projectId), projectData, { merge: true });
      setProgress(100);
      
      if (status === 'Draft') {
        toast({ title: 'Draft Saved!', description: "You can continue editing from 'My Projects'." });
        if (!project?.id) router.push(`/dashboard/edit-submission/${projectId}`);
      } else {
        await notifyAdminsOnProjectSubmission(projectId, data.title, user.name);
        toast({ title: 'Project Submitted!', description: 'Your project is now under review.' });
        router.push('/dashboard/my-projects');
      }
    } catch (error: any) {
      console.error('Error saving project: ', error);
      toast({ variant: 'destructive', title: 'Save Failed', description: error.message || 'An error occurred.' });
    } finally {
      setIsSaving(false);
      setProgress(0);
    }
  };

  const onFinalSubmit = () => handleSave('Submitted');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{project ? 'Edit Submission' : 'New Submission'} - Step {currentStep}: {steps[currentStep - 1].title}</CardTitle>
            <CardDescription>Follow the steps to complete your submission.</CardDescription>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-muted-foreground">Progress</p>
            <Progress value={(currentStep / 4) * 100} className="w-32 mt-1" />
          </div>
        </div>
      </CardHeader>
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onFinalSubmit)}>
          <CardContent className="space-y-8">
            {currentStep === 1 && (
              <div className="space-y-4 animate-in fade-in-0">
                <FormField name="title" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Project Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="abstract" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Abstract</FormLabel><FormControl><Textarea rows={5} {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="projectType" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>Project Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Research">Research</SelectItem><SelectItem value="Development">Development</SelectItem><SelectItem value="Clinical Trial">Clinical Trial</SelectItem></SelectContent></Select><FormMessage /></FormItem>
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
              <div className="space-y-4 animate-in fade-in-0">
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
                <FormField
                  name="cvUpload"
                  control={form.control}
                  render={({ field: { value, onChange, ...fieldProps } }) => (
                    <FormItem>
                      <FormLabel>Upload CVs (single ZIP file)</FormLabel>
                      {project?.cvUrl && <p className="text-xs text-muted-foreground">Existing file: <a href={project.cvUrl} target="_blank" className="underline" rel="noreferrer">View Uploaded CVs</a>. Uploading a new file will replace it.</p>}
                      <FormControl>
                        <Input {...fieldProps} type="file" accept=".zip" onChange={(e) => onChange(e.target.files)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
            {currentStep === 3 && (
              <div className="space-y-6 animate-in fade-in-0">
                <FormField
                  name="proposalUpload"
                  control={form.control}
                  render={({ field: { value, onChange, ...fieldProps } }) => (
                    <FormItem>
                      <FormLabel>Project Proposal (PDF)</FormLabel>
                       {project?.proposalUrl && <p className="text-xs text-muted-foreground">Existing file: <a href={project.proposalUrl} target="_blank" className="underline" rel="noreferrer">View Uploaded Proposal</a>. Uploading a new file will replace it.</p>}
                      <FormControl>
                        <Input {...fieldProps} type="file" accept=".pdf" onChange={(e) => onChange(e.target.files)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="ethicsUpload"
                  control={form.control}
                  render={({ field: { value, onChange, ...fieldProps } }) => (
                    <FormItem>
                      <FormLabel>Ethics Approval (PDF, if applicable)</FormLabel>
                       {project?.ethicsUrl && <p className="text-xs text-muted-foreground">Existing file: <a href={project.ethicsUrl} target="_blank" className="underline" rel="noreferrer">View Uploaded Ethics Approval</a>. Uploading a new file will replace it.</p>}
                      <FormControl>
                        <Input {...fieldProps} type="file" accept=".pdf" onChange={(e) => onChange(e.target.files)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
            {currentStep === 4 && (
              <div className="space-y-6 animate-in fade-in-0">
                <FormField name="expectedOutcomes" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Expected Outcomes & Impact</FormLabel><FormControl><Textarea rows={5} {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField
                  control={form.control}
                  name="guidelinesAgreement"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Declaration</FormLabel>
                        <FormMessage />
                          <p className="text-sm text-muted-foreground">
                          I declare that I have gone through all the guidelines of the{" "}
                          <a
                            href="https://c9lfgwsokvjlngjd.public.blob.vercel-storage.com/Notification%201446_Revision%20in%20the%20Research%20%26%20Development%20Policy%20of%20the%20University%20%281%29.pdf"
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
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-4 border-t pt-6">
            {isSaving && (
              <div className="w-full flex items-center gap-4 text-sm text-muted-foreground">
                <Progress value={progress} className="w-full" />
                <span>{`${Math.round(progress)}%`}</span>
              </div>
            )}
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={handlePrevious} disabled={currentStep === 1 || isSaving}>Previous</Button>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => handleSave('Draft')} disabled={isSaving}>
                  {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Saving...</> : 'Save as Draft'}
                </Button>
                {currentStep < 4 && <Button type="button" onClick={handleNext} disabled={isSaving}>Next</Button>}
                {currentStep === 4 && <Button type="submit" disabled={isSaving || !form.watch('guidelinesAgreement')}>{isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Submitting...</> : "Submit Project"}</Button>}
              </div>
            </div>
          </CardFooter>
        </form>
      </FormProvider>
    </Card>
  );
}
