
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { format, startOfToday, subMonths, parseISO, isAfter } from 'date-fns';
import { Calendar as CalendarIcon, Loader2, ChevronDown } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/page-header';
import { db } from '@/lib/config';
import type { Project, User, SystemSettings } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { scheduleMeeting, getSystemSettings } from '@/app/actions';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const scheduleSchema = z.object({
  date: z.date({ required_error: 'A meeting date is required.' }),
  time: z.string().min(1, 'Meeting time is required.'),
  evaluatorUids: z.array(z.string()).min(1, 'Please select at least one evaluator.'),
});

function ProjectListTable({ 
    projects, 
    selectedProjects, 
    onSelectAll, 
    onSelectOne,
    usersMap,
    title,
    description,
    dateColumnHeader
} : {
    projects: Project[],
    selectedProjects: string[],
    onSelectAll: (checked: boolean) => void,
    onSelectOne: (id: string, checked: boolean) => void,
    usersMap: Map<string, User>,
    title: string,
    description: string,
    dateColumnHeader: string
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                {projects.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                            <TableHead className="w-[50px]">
                                <Checkbox
                                checked={selectedProjects.length === projects.length && projects.length > 0}
                                onCheckedChange={(checked) => onSelectAll(Boolean(checked))}
                                aria-label="Select all"
                                />
                            </TableHead>
                            <TableHead>Title</TableHead>
                            <TableHead>PI</TableHead>
                            <TableHead>{dateColumnHeader}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {projects.map(project => {
                                const piUser = usersMap.get(project.pi_uid);
                                const profileLink = piUser?.campus === 'Goa' ? `/goa/${piUser.misId}` : `/profile/${piUser?.misId}`;
                                
                                let displayDate;
                                if (project.status === 'Submitted') {
                                    displayDate = project.submissionDate;
                                } else {
                                    const disbursementDates = project.grant?.phases
                                        ?.map(p => p.disbursementDate)
                                        .filter((d): d is string => !!d)
                                        .map(d => parseISO(d));
                                    
                                    if (disbursementDates && disbursementDates.length > 0) {
                                        const latestDate = new Date(Math.max.apply(null, disbursementDates.map(d => d.getTime())));
                                        displayDate = latestDate.toISOString();
                                    } else {
                                        displayDate = project.projectStartDate || project.submissionDate;
                                    }
                                }

                                return (
                                <TableRow key={project.id} data-state={selectedProjects.includes(project.id) ? "selected" : ""}>
                                    <TableCell>
                                    <Checkbox
                                        checked={selectedProjects.includes(project.id)}
                                        onCheckedChange={(checked) => onSelectOne(project.id, !!checked)}
                                        aria-label={`Select project ${project.title}`}
                                    />
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        <Link href={`/dashboard/project/${project.id}`} className="hover:underline text-primary" target="_blank">
                                            {project.title}
                                        </Link>
                                    </TableCell>
                                    <TableCell>
                                        <div>
                                            {piUser?.misId ? (
                                                <Link href={profileLink} target="_blank" className="text-primary hover:underline">
                                                    {project.pi}
                                                </Link>
                                            ) : (
                                                project.pi
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                        {piUser?.department || project.departmentName}, {piUser?.institute || project.institute}
                                        </div>
                                    </TableCell>
                                    <TableCell>{new Date(displayDate).toLocaleDateString()}</TableCell>
                                </TableRow>
                                )})}
                        </TableBody>
                    </Table>
                ) : (
                    <div className="text-center py-10 text-muted-foreground">
                        <p>There are no projects currently in this category.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default function ScheduleMeetingPage() {
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('new-submissions');

  const form = useForm<z.infer<typeof scheduleSchema>>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      time: '',
      evaluatorUids: [],
    },
  });

  const fetchRequiredData = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await getSystemSettings();
      setSystemSettings(settings);

      const projectsQuery = query(
        collection(db, 'projects'),
        where('status', 'in', ['Submitted', 'In Progress']),
        orderBy('submissionDate', 'desc')
      );
      
      const usersQuery = query(collection(db, 'users'));

      const [projectsSnapshot, usersSnapshot] = await Promise.all([
        getDocs(projectsQuery),
        getDocs(usersQuery),
      ]);

      const projectList = projectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      const userList = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
      
      setAllProjects(projectList);
      setAllUsers(userList);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch projects or users.' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRequiredData();
  }, [fetchRequiredData]);
  
  const evaluators = allUsers.filter(u => ['CRO', 'admin', 'Super-admin'].includes(u.role));
  
  const newSubmissions = allProjects.filter(p => p.status === 'Submitted');
  
  const midTermReviewProjects = allProjects.filter(p => {
    if (p.status !== 'In Progress') return false;
    const reviewMonths = systemSettings?.imrMidTermReviewMonths ?? 6;
    const thresholdDate = subMonths(new Date(), reviewMonths);
    const grantStartDate = p.grant?.phases?.[0]?.disbursementDate || p.projectStartDate;
    if (!grantStartDate) return false;
    
    // Check if a mid-term review has already been conducted by checking for a meeting date after the grant start date.
    const hasHadMidTermReview = p.meetingDetails?.date && isAfter(parseISO(p.meetingDetails.date), parseISO(grantStartDate));

    return isAfter(thresholdDate, parseISO(grantStartDate)) && !hasHadMidTermReview;
  });

  const projectsForCurrentTab = activeTab === 'new-submissions' ? newSubmissions : midTermReviewProjects;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedProjects(projectsForCurrentTab.map(p => p.id));
    } else {
      setSelectedProjects([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedProjects([...selectedProjects, id]);
    } else {
      setSelectedProjects(selectedProjects.filter(pId => pId !== id));
    }
  };

  useEffect(() => {
    setSelectedProjects([]);
  }, [activeTab]);

  const onSubmit = async (data: z.infer<typeof scheduleSchema>) => {
    if (selectedProjects.length === 0) {
      toast({ variant: 'destructive', title: 'No Projects Selected', description: 'Please select at least one project to schedule.' });
      return;
    }

    const meetingDetails = {
      date: format(data.date, 'yyyy-MM-dd'),
      time: data.time,
      venue: "RDC Committee Room, PIMSR",
      evaluatorUids: data.evaluatorUids,
    };
    
    const projectsToSchedule = allProjects
      .filter(p => selectedProjects.includes(p.id))
      .map(p => ({ 
          id: p.id, 
          pi_uid: p.pi_uid, 
          title: p.title, 
          pi_email: p.pi_email 
      }));

    const isMidTermReview = activeTab === 'mid-term-review';

    const result = await scheduleMeeting(projectsToSchedule, meetingDetails, isMidTermReview);

    if (result.success) {
      toast({ title: 'Meeting Scheduled!', description: 'The meeting has been scheduled and PIs have been notified.' });
      setSelectedProjects([]);
      form.reset();
      await fetchRequiredData();
    } else {
      toast({ variant: 'destructive', title: 'Scheduling Failed', description: result.error || 'An unknown error occurred.' });
    }
  };
  
  const usersMap = new Map(allUsers.map(u => [u.uid, u]));

  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Schedule IMR Meeting" description="Loading projects..." />
        <Card className="mt-8">
            <CardHeader>
                <Skeleton className="h-6 w-1/2" />
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
            </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
        <PageHeader
            title="Schedule IMR Meeting"
            description="Select projects to schedule an initial submission meeting or a mid-term review."
        />
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="new-submissions">New Submissions ({newSubmissions.length})</TabsTrigger>
                        <TabsTrigger value="mid-term-review">Mid-term Review ({midTermReviewProjects.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="new-submissions" className="mt-4">
                        <ProjectListTable
                            projects={newSubmissions}
                            selectedProjects={selectedProjects}
                            onSelectAll={handleSelectAll}
                            onSelectOne={handleSelectOne}
                            usersMap={usersMap}
                            title="Projects Awaiting Meeting"
                            description="Select new submissions to schedule for their initial evaluation meeting."
                            dateColumnHeader="Submission Date"
                        />
                    </TabsContent>
                    <TabsContent value="mid-term-review" className="mt-4">
                         <ProjectListTable
                            projects={midTermReviewProjects}
                            selectedProjects={selectedProjects}
                            onSelectAll={handleSelectAll}
                            onSelectOne={handleSelectOne}
                            usersMap={usersMap}
                            title="Projects Due for Mid-term Review"
                            description={`These projects were funded at least ${systemSettings?.imrMidTermReviewMonths ?? 6} months ago and are due for a progress review.`}
                            dateColumnHeader="Last Disbursement Date"
                        />
                    </TabsContent>
                </Tabs>
            </div>
            
            <Card>
                <CardHeader>
                <CardTitle>Schedule Details</CardTitle>
                <CardDescription>Set the time and assign evaluators for the selected projects.</CardDescription>
                </CardHeader>
                <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                        control={form.control}
                        name="date"
                        render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Meeting Date</FormLabel>
                            <Popover>
                            <PopoverTrigger asChild>
                                <FormControl>
                                <Button
                                    variant={"outline"}
                                    className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                >
                                    {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                                </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date < startOfToday()} initialFocus />
                            </PopoverContent>
                            </Popover>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="time"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Meeting Time</FormLabel>
                            <FormControl>
                            <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="evaluatorUids"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                            <FormLabel>Assign Evaluators</FormLabel>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="w-full justify-between">
                                    {field.value?.length > 0 ? `${field.value.length} selected` : "Select evaluators"}
                                    <ChevronDown className="h-4 w-4 opacity-50" />
                                </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-[--radix-popover-trigger-width]">
                                <DropdownMenuLabel>Available Staff</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {evaluators.map((evaluator) => (
                                    <DropdownMenuCheckboxItem
                                    key={evaluator.uid}
                                    checked={field.value?.includes(evaluator.uid)}
                                    onCheckedChange={(checked) => {
                                        return checked
                                        ? field.onChange([...(field.value || []), evaluator.uid])
                                        : field.onChange(field.value?.filter((id) => id !== evaluator.uid));
                                    }}
                                    >
                                    {evaluator.name}
                                    </DropdownMenuCheckboxItem>
                                ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                    <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || selectedProjects.length === 0}>
                        {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Schedule for {selectedProjects.length} Project(s)
                    </Button>
                    </form>
                </Form>
                </CardContent>
            </Card>
        </div>
    </div>
  );
}
