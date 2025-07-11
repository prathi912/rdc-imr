
'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, BarChart, CartesianGrid, XAxis, Line, LineChart, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { Project, User } from '@/types';
import { db } from '@/lib/config';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

export default function AnalyticsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
        setUser(JSON.parse(storedUser));
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    
    const fetchProjects = async () => {
      setLoading(true);
      try {
        const projectsCollection = collection(db, 'projects');
        let projectQuery;

        if (user.role === 'CRO' && user.faculty) {
            projectQuery = query(projectsCollection, where('faculty', '==', user.faculty));
        } else if (user.designation === 'Principal' && user.institute) {
            projectQuery = query(projectsCollection, where('institute', '==', user.institute));
        } else if (user.designation === 'HOD' && user.department) {
            projectQuery = query(projectsCollection, where('departmentName', '==', user.department));
        } else {
            // Admins & Super-admins see all
            projectQuery = query(projectsCollection);
        }

        const projectSnapshot = await getDocs(projectQuery);
        const projectList = projectSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
        setProjects(projectList);
      } catch (error) {
        console.error("Error fetching project data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [user]);

  // --- Data Processing ---
  const submissionsData = useMemo(() => {
    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), i);
      return { name: format(d, 'MMM'), start: startOfMonth(d), end: endOfMonth(d) };
    }).reverse();

    return last6Months.map(month => {
      const count = projects.filter(p => {
        const submissionDate = parseISO(p.submissionDate);
        return submissionDate >= month.start && submissionDate <= month.end;
      }).length;
      return { month: month.name, submissions: count };
    });
  }, [projects]);
  
  const submissionsConfig = {
    submissions: { label: 'Submissions', color: 'hsl(var(--primary))' },
  } satisfies ChartConfig;

  // For CRO, show breakdown by department within their faculty. Otherwise, show by faculty.
  const isCroView = user?.role === 'CRO';
  const aggregationKey = isCroView ? 'departmentName' : 'faculty';
  const aggregationLabel = isCroView ? 'Department' : 'Faculty';

  const projectsByGroupData = useMemo(() => 
    Object.entries(
      projects.reduce((acc, project) => {
        const key = project[aggregationKey as keyof Project] as string | undefined;
        if (key) {
          acc[key] = (acc[key] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>)
    ).map(([group, count]) => ({ group, projects: count }))
    .sort((a, b) => b.projects - a.projects)
  , [projects, aggregationKey]);

  const projectsByGroupConfig = {
    projects: { label: 'Projects', color: 'hsl(var(--accent))' },
  } satisfies ChartConfig;

  const getPageTitle = () => {
      if (user?.role === 'CRO' && user.faculty) return `Analytics for ${user.faculty}`;
      if (user?.designation === 'Principal' && user.institute) return `Analytics for ${user.institute}`;
      if (user?.designation === 'HOD' && user.department) return `Analytics for ${user.department}`;
      return 'Analytics';
  }

  const getPageDescription = () => {
    if (user?.role === 'CRO' || user?.designation === 'Principal' || user?.designation === 'HOD') return 'Visualize project data and submission trends for your scope.';
    return 'Visualize project data and submission trends across the university.';
  }

  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Analytics" description="Loading data..." />
        <div className="mt-8 grid gap-6 md:grid-cols-1 lg:grid-cols-2">
            <Card><CardHeader><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-3/4" /></CardHeader><CardContent><Skeleton className="h-[300px] w-full" /></CardContent></Card>
            <Card><CardHeader><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-3/4" /></CardHeader><CardContent><Skeleton className="h-[300px] w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <PageHeader title={getPageTitle()} description={getPageDescription()} />
      <div className="mt-8 grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Submissions Over Time</CardTitle>
            <CardDescription>Monthly project submissions for the last 6 months.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={submissionsConfig} className="h-[300px] w-full">
              <LineChart accessibilityLayer data={submissionsData} margin={{ left: 12, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Line dataKey="submissions" type="monotone" stroke="var(--color-submissions)" strokeWidth={2} dot={true} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Projects by {aggregationLabel}</CardTitle>
            <CardDescription>Total projects submitted by each {aggregationLabel.toLowerCase()}.</CardDescription>
          </CardHeader>
          <CardContent>
             <ChartContainer config={projectsByGroupConfig} className="h-[300px] w-full">
              <BarChart accessibilityLayer data={projectsByGroupData} layout="vertical" margin={{left: 30}}>
                <CartesianGrid horizontal={false} />
                <YAxis
                  dataKey="group"
                  type="category"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  width={250}
                  tick={{ fontSize: 12 }}
                />
                 <XAxis dataKey="projects" type="number" hide allowDecimals={false} />
                 <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltipContent />} />
                <Bar dataKey="projects" layout="vertical" fill="var(--color-projects)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

