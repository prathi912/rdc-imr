
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/config';
import type { ProjectRecruitment } from '@/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Briefcase, Building, Wallet, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/logo';
import Link from 'next/link';
import { format, isAfter } from 'date-fns';
import { uploadFileToServer } from '@/app/actions';

const applicationSchema = z.object({
  applicantName: z.string().min(2, 'Your name is required.'),
  applicantEmail: z.string().email('Please enter a valid email address.'),
  applicantPhone: z.string().min(10, 'Please enter a valid 10-digit phone number.').max(10, 'Please enter a valid 10-digit phone number.'),
  applicantMisId: z.string().optional(),
  cv: z.any().refine(files => files?.length === 1, 'CV is required.').refine(files => files?.[0]?.size <= 5 * 1024 * 1024, `Max file size is 5MB.`),
  coverLetter: z.string().optional(),
});

type ApplicationFormValues = z.infer<typeof applicationSchema>;

const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};

export default function ApplyPage() {
    const params = useParams();
    const router = useRouter();
    const recruitmentId = params.id as string;
    const { toast } = useToast();
    const [job, setJob] = useState<ProjectRecruitment | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const form = useForm<ApplicationFormValues>({
        resolver: zodResolver(applicationSchema),
        defaultValues: {
            applicantName: '',
            applicantEmail: '',
            applicantPhone: '',
            applicantMisId: '',
            coverLetter: '',
        },
    });

    useEffect(() => {
        if (!recruitmentId) return;
        const fetchJob = async () => {
            try {
                const docRef = doc(db, 'projectRecruitments', recruitmentId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setJob({ id: docSnap.id, ...docSnap.data() } as ProjectRecruitment);
                } else {
                    toast({ variant: 'destructive', title: 'Not Found', description: 'This job opening could not be found.' });
                    router.push('/hiring');
                }
            } catch (error) {
                console.error("Error fetching job:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchJob();
    }, [recruitmentId, router, toast]);

    const onSubmit = async (data: ApplicationFormValues) => {
        if (!job) return;
        setIsSubmitting(true);
        try {
            const cvFile = data.cv[0];
            const cvDataUrl = await fileToDataUrl(cvFile);
            
            const cvUploadResult = await uploadFileToServer(cvDataUrl, `recruitment-cvs/${job.id}/${cvFile.name}`);

            if (!cvUploadResult.success || !cvUploadResult.url) {
                throw new Error(cvUploadResult.error || 'Failed to upload CV.');
            }

            await addDoc(collection(db, 'projectRecruitments', job.id, 'applications'), {
                recruitmentId: job.id,
                applicantName: data.applicantName,
                applicantEmail: data.applicantEmail,
                applicantPhone: data.applicantPhone,
                applicantMisId: data.applicantMisId,
                cvUrl: cvUploadResult.url,
                coverLetter: data.coverLetter,
                appliedAt: new Date().toISOString(),
            });

            toast({ title: 'Application Submitted!', description: 'Your application has been received. You will be contacted if shortlisted.' });
            router.push('/hiring');
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Submission Failed', description: error.message || 'An unknown error occurred.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return <div className="flex h-screen items-center justify-center"><Loader2 className="h-12 w-12 animate-spin" /></div>;
    }
    
    if (!job) {
        return <div className="flex h-screen items-center justify-center"><p>Job not found.</p></div>;
    }
    
    const isDeadlinePassed = isAfter(new Date(), new Date(job.applicationDeadline));

    return (
        <div className="flex flex-col min-h-screen bg-background dark:bg-transparent">
            <header className="container mx-auto px-4 lg:px-6 h-20 flex items-center justify-between sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b">
                <Logo />
                 <nav>
                    <Link href="/hiring">
                        <Button variant="ghost">Back to Listings</Button>
                    </Link>
                </nav>
            </header>
            <main className="flex-1 flex items-center justify-center py-12 md:py-16">
                 <div className="w-full max-w-2xl px-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-2xl">Apply for {job.positionTitle}</CardTitle>
                            <CardDescription>Project: {job.projectName}</CardDescription>
                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-2">
                                <span className="flex items-center"><Briefcase className="mr-1.5 h-4 w-4"/> {job.positionType}</span>
                                <span className="flex items-center"><Building className="mr-1.5 h-4 w-4"/> {job.postedByName}</span>
                                {job.salary && <span className="flex items-center"><Wallet className="mr-1.5 h-4 w-4"/> {job.salary}</span>}
                                <span className="flex items-center"><Calendar className="mr-1.5 h-4 w-4"/> Apply by {format(new Date(job.applicationDeadline), 'PPP')}</span>
                            </div>
                        </CardHeader>
                        <CardContent>
                             {isDeadlinePassed ? (
                                <div className="text-center py-8 text-red-500 font-semibold">
                                    The application deadline for this position has passed.
                                </div>
                            ) : (
                                <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField name="applicantName" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                        <FormField name="applicantMisId" control={form.control} render={({ field }) => ( <FormItem><FormLabel>MIS ID (if applicable)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField name="applicantEmail" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Email Address</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                        <FormField name="applicantPhone" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                    </div>
                                    <FormField name="cv" control={form.control} render={({ field: { onChange, ...rest }}) => ( <FormItem><FormLabel>Upload CV (PDF, max 5MB)</FormLabel><FormControl><Input type="file" accept=".pdf" onChange={e => onChange(e.target.files)} {...rest} /></FormControl><FormMessage /></FormItem> )} />
                                    <FormField name="coverLetter" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Cover Letter (Optional)</FormLabel><FormControl><Textarea rows={5} placeholder="Briefly explain why you are a good fit for this role..." {...field} /></FormControl><FormMessage /></FormItem> )} />
                                    
                                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Submitting...</> : 'Submit Application'}
                                    </Button>
                                </form>
                                </Form>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
}
