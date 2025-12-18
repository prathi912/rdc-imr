
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { collection, addDoc, doc } from 'firebase/firestore';
import type { User, ProjectRecruitment } from '@/types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const recruitmentSchema = z.object({
  projectName: z.string().min(5, 'Project name is required.'),
  positionTitle: z.string().min(3, 'Position title is required.'),
  positionType: z.enum(['Intern', 'Project Associate', 'JRF', 'SRF', 'Other'], { required_error: 'Please select a position type.' }),
  jobDescription: z.string().min(20, 'A brief job description is required.'),
  responsibilities: z.string().optional(),
  qualifications: z.string().min(10, 'Please list required qualifications.'),
  targetBranches: z.array(z.string()).optional(),
  targetDepartments: z.array(z.string()).optional(),
  salary: z.string().optional(),
  applicationDeadline: z.date({ required_error: 'An application deadline is required.' }),
});

type RecruitmentFormValues = z.infer<typeof recruitmentSchema>;

const branches = ["CSE", "IT", "Mechanical", "Electrical", "Civil", "Biotechnology", "Chemical"];
const departments = ["Department of Computer Science", "Department of Biotechnology", "Department of Mechanical Engineering"];

export function RecruitmentForm() {
    const { toast } = useToast();
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        } else {
            router.push('/login');
        }
    }, [router]);

    const form = useForm<RecruitmentFormValues>({
        resolver: zodResolver(recruitmentSchema),
        defaultValues: {
            targetBranches: [],
            targetDepartments: [],
        },
    });

    const onSubmit = async (data: RecruitmentFormValues) => {
        if (!user) return;
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'projectRecruitments'), {
                ...data,
                applicationDeadline: data.applicationDeadline.toISOString(),
                postedByUid: user.uid,
                postedByName: user.name,
                status: 'Pending Approval',
                createdAt: new Date().toISOString(),
            });
            toast({ title: 'Submitted for Approval', description: 'Your job posting has been sent to an administrator for review.' });
            router.push('/dashboard/post-a-job');
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Submission Failed', description: error.message || 'An unknown error occurred.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <CardContent className="space-y-6 pt-6">
                        <FormField name="projectName" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Project Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField name="positionTitle" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Position Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                            <FormField name="positionType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Position Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger></FormControl><SelectContent><SelectItem value="Intern">Intern</SelectItem><SelectItem value="Project Associate">Project Associate</SelectItem><SelectItem value="JRF">JRF</SelectItem><SelectItem value="SRF">SRF</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                        </div>
                        <FormField name="jobDescription" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Job Description</FormLabel><FormControl><Textarea rows={4} {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField name="qualifications" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Qualifications</FormLabel><FormControl><Textarea placeholder="List required skills, degrees, or experience..." {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField name="targetBranches" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Target Branches</FormLabel><Select onValueChange={value => field.onChange([...(field.value || []), value])}><FormControl><SelectTrigger><SelectValue placeholder="Add branches..." /></SelectTrigger></FormControl><SelectContent>{branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select><div className="flex flex-wrap gap-1 mt-2">{field.value?.map(b => <Badge key={b} variant="secondary">{b} <Button variant="ghost" size="icon" className="h-4 w-4 ml-1" onClick={() => field.onChange(field.value?.filter(i => i !== b))}><X className="h-3 w-3"/></Button></Badge>)}</div><FormMessage /></FormItem> )} />
                            <FormField name="targetDepartments" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Target Departments</FormLabel><Select onValueChange={value => field.onChange([...(field.value || []), value])}><FormControl><SelectTrigger><SelectValue placeholder="Add departments..." /></SelectTrigger></FormControl><SelectContent>{departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select><div className="flex flex-wrap gap-1 mt-2">{field.value?.map(d => <Badge key={d} variant="secondary">{d} <Button variant="ghost" size="icon" className="h-4 w-4 ml-1" onClick={() => field.onChange(field.value?.filter(i => i !== d))}><X className="h-3 w-3"/></Button></Badge>)}</div><FormMessage /></FormItem> )} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField name="salary" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Salary / Stipend (Optional)</FormLabel><FormControl><Input placeholder="e.g., As per university norms" {...field} /></FormControl><FormMessage /></FormItem> )} />
                            <FormField name="applicationDeadline" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Application Deadline</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP") : (<span>Pick a date</span>)}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )} />
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Submitting for Approval...</> : 'Submit for Approval'}
                        </Button>
                    </CardFooter>
                </form>
            </Form>
        </Card>
    );
}
