
'use client';

import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, BarChart, CartesianGrid, XAxis, Line, LineChart, ResponsiveContainer, YAxis, Tooltip, Pie, PieChart, Cell } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { Project, User } from '@/types';
import { db } from '@/lib/config';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign } from 'lucide-react';
import { createDebugInfo, logDebugInfo } from '@/lib/debug-utils';

const COLORS = ["#64B5F6", "#81C784", "#FFB74D", "#E57373", "#BA68C8", "#7986CB"];


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

        const isPrincipal = user.designation === 'Principal';
        const isCro = user.role === 'CRO';
        const isHod = user.designation === 'HOD';

        let projectList: Project[] = [];
        let initialQuery;

        if (isCro && user.faculty) {
            initialQuery = query(projectsCollection, where('faculty', '==', user.faculty));
        } else if (isPrincipal && user.institute) {
            initialQuery = query(projectsCollection, where('institute', '==', user.institute));
        } else if (isHod && user.department) {
            initialQuery = query(projectsCollection, where('departmentName', '==', user.department));
        } else {
            // Admins & Super-admins see all
            initialQuery = query(projectsCollection);
        }

        const projectSnapshot = await getDocs(initialQuery);
        projectList = projectSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));

        // Fallback logic for institutional roles
        if ((isPrincipal || isHod) && projectList.length === 0 && (user.institute || user.department)) {
            console.warn(`Initial query for ${user.institute || user.department} returned 0 projects. Fetching all and filtering client-side as a fallback.`);
            const allProjectsSnapshot = await getDocs(query(projectsCollection));
            const allProjectsList = allProjectsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project));
            
            if (isPrincipal && user.institute) {
                projectList = allProjectsList.filter(p => p.institute?.toLowerCase() === user.institute?.toLowerCase());
            } else if (isHod && user.department) {
                projectList = allProjectsList.filter(p => p.departmentName?.toLowerCase() === user.department?.toLowerCase());
            }

            if (isPrincipal) {
              const debugInfo = createDebugInfo(user, allProjectsList);
              logDebugInfo(debugInfo, 'AnalyticsPage (Fallback)');
            }
        } else if (isPrincipal) {
          const debugInfo = createDebugInfo(user, projectList);
          logDebugInfo(debugInfo, 'AnalyticsPage (Standard)');
        }

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

  const { aggregationKey, aggregationLabel } = useMemo(() => {
    if (user?.role === 'CRO') {
        return { aggregationKey: 'institute', aggregationLabel: 'Institute' };
    }
    if (user?.designation === 'Principal' || user?.designation === 'HOD') {
        return { aggregationKey: 'departmentName', aggregationLabel: 'Department' };
    }
    // Default for Admin/Super-admin
    return { aggregationKey: 'faculty', aggregationLabel: 'Faculty' };
  }, [user]);


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

  const statusDistributionData = useMemo(() => {
    const statusCounts = projects.reduce((acc, project) => {
        const status = project.status || 'Unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  }, [projects]);

  const statusDistributionConfig = useMemo(() => {
    const config: ChartConfig = {};
    statusDistributionData.forEach((item, index) => {
        config[item.name] = {
            label: item.name,
            color: COLORS[index % COLORS.length],
        };
    });
    return config;
  }, [statusDistributionData]);

  const totalGrantAmount = useMemo(() => {
    return projects.reduce((acc, project) => {
        return acc + (project.grant?.totalAmount || 0);
    }, 0);
  }, [projects]);


  const getPageTitle = () => {
      if (user?.role === 'CRO' && user.faculty) return `Analytics for ${user.faculty}`;
      if (user?.designation === 'Principal' && user.institute) return `Analytics for ${user.institute}`;
      if (user?.designation === 'Principal' && !user.institute) return 'Analytics (Principal - No Institute Set)';
      if (user?.designation === 'HOD' && user.department) return `Analytics for ${user.department}`;
      return 'Analytics';
  }

  const getPageDescription = () => {
    if (user?.designation === 'Principal' && !user.institute) return 'Your institute information is not configured. Please update your profile to see institute-specific analytics.';
    if (user?.role === 'CRO' || user?.designation === 'Principal' || user?.designation === 'HOD') return 'Visualize project data and submission trends for your scope.';
    return 'Visualize project data and submission trends across the university.';
  }

  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Analytics" description="Loading data..." />
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
             <Card className="lg:col-span-1"><CardHeader><Skeleton className="h-6 w-32" /></CardHeader><CardContent><Skeleton className="h-20 w-full" /></CardContent></Card>
             <Card className="lg:col-span-2"><CardHeader><Skeleton className="h-6 w-48" /></CardHeader><CardContent><Skeleton className="h-[250px] w-full" /></CardContent></Card>
        </div>
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
      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Grant Funding</CardTitle>
            <CardDescription>Total amount awarded to projects.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
             <div className="p-3 rounded-full bg-primary/10 text-primary">
                <DollarSign className="h-8 w-8" />
             </div>
             <div>
                <p className="text-3xl font-bold">₹{totalGrantAmount.toLocaleString('en-IN')}</p>
             </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Project Status Distribution</CardTitle>
            <CardDescription>A summary of all projects by their current status.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={statusDistributionConfig} className="h-[250px] w-full">
                <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="value" />} />
                    <Pie data={statusDistributionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                        {statusDistributionData.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={statusDistributionConfig[entry.name]?.color || '#8884d8'} />
                        ))}
                    </Pie>
                </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
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
