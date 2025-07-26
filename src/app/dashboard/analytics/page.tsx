
'use client';

import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, BarChart, CartesianGrid, XAxis, Line, LineChart, ResponsiveContainer, YAxis, Tooltip, Pie, PieChart, Cell } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { Project, User } from '@/types';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, onSnapshot, or } from 'firebase/firestore';
import { format, subMonths, startOfMonth, endOfMonth, parseISO, getYear } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign } from 'lucide-react';
import { createDebugInfo, logDebugInfo } from '@/lib/debug-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


const COLORS = ["#64B5F6", "#81C784", "#FFB74D", "#E57373", "#BA68C8", "#7986CB"];


export default function AnalyticsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [facultyFilter, setFacultyFilter] = useState('all');
  const [timeRange, setTimeRange] = useState<string>('last6months');
  const [availableYears, setAvailableYears] = useState<string[]>([]);


  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        if (parsedUser.role === 'CRO' && parsedUser.faculties && parsedUser.faculties.length > 0) {
            setFacultyFilter(parsedUser.faculties[0]);
        }
    } else {
        setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    
    setLoading(true);
    
    const projectsCollection = collection(db, 'projects');
    let projectsQuery;

    const isPrincipal = user?.designation === 'Principal';
    const isCro = user?.role === 'CRO';
    const isHod = user?.designation === 'HOD';
    const isSpecialPitUser = user?.email === 'pit@paruluniversity.ac.in';


    if (isCro && user.faculties && user.faculties.length > 0) {
        projectsQuery = query(projectsCollection, where('faculty', 'in', user.faculties));
    } else if (isHod && user.department && user.institute) {
        projectsQuery = query(
            projectsCollection, 
            where('departmentName', '==', user.department), 
            where('institute', '==', user.institute)
        );
    } else if (isSpecialPitUser) {
        projectsQuery = query(projectsCollection, where('institute', 'in', ['Parul Institute of Technology', 'Parul Institute of Technology-Diploma studies']));
    }
    else if (isPrincipal && user.institute) {
        projectsQuery = query(projectsCollection, where('institute', '==', user.institute));
    } else {
        projectsQuery = query(projectsCollection);
    }
    
    const unsubscribe = onSnapshot(projectsQuery, (snapshot) => {
        let projectList: Project[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
        
        // This is a special fallback for principals if their direct institute match returns no results.
        // It's less efficient but handles potential mismatches in institute names.
        if (isPrincipal && user.institute && snapshot.empty) {
            const allProjectsQuery = query(collection(db, 'projects'));
            onSnapshot(allProjectsQuery, (allSnapshot) => {
                 const allProjects = allSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project));
                 const filteredList = allProjects.filter(p => p.institute && p.institute.toLowerCase() === user!.institute!.toLowerCase());
                 
                 const debugInfo = createDebugInfo(user, filteredList);
                 logDebugInfo(debugInfo, 'Analytics Fallback');
                 
                 setProjects(filteredList);
                 setLoading(false);
            });
        } else {
            setProjects(projectList);
            setLoading(false);
        }
    }, (error) => {
        console.error("Error fetching project data:", error);
        setLoading(false);
    });

    return () => unsubscribe();

  }, [user]);

  // --- Filtered Projects based on CRO selection ---
  const filteredProjects = useMemo(() => {
    if (user?.role === 'CRO' && facultyFilter !== 'all') {
      return projects.filter(p => p.faculty === facultyFilter);
    }
    return projects;
  }, [projects, user, facultyFilter]);

  // --- Data Processing ---
  
  useEffect(() => {
    if (filteredProjects.length > 0) {
      const years = new Set(
        filteredProjects.map(p => getYear(parseISO(p.submissionDate)))
      );
      setAvailableYears(Array.from(years).sort((a,b) => b-a).map(String));
    }
  }, [filteredProjects]);

  const submissionsData = useMemo(() => {
    if (timeRange === 'last6months') {
        const last6Months = Array.from({ length: 6 }, (_, i) => {
        const d = subMonths(new Date(), i);
        return { name: format(d, 'MMM'), start: startOfMonth(d), end: endOfMonth(d) };
        }).reverse();

        return last6Months.map(month => {
        const count = filteredProjects.filter(p => {
            const submissionDate = parseISO(p.submissionDate);
            return submissionDate >= month.start && submissionDate <= month.end;
        }).length;
        return { month: month.name, submissions: count };
        });
    }

    // Handle year selection
    const year = parseInt(timeRange, 10);
    const months = Array.from({ length: 12 }, (_, i) => format(new Date(year, i, 1), 'MMM'));
    return months.map((monthName, monthIndex) => {
        const count = filteredProjects.filter(p => {
            const submissionDate = parseISO(p.submissionDate);
            return getYear(submissionDate) === year && submissionDate.getMonth() === monthIndex;
        }).length;
        return { month: monthName, submissions: count };
    });
    
  }, [filteredProjects, timeRange]);
  
  const submissionsConfig = {
    submissions: { label: 'Submissions', color: 'hsl(var(--primary))' },
  } satisfies ChartConfig;

  const { aggregationKey, aggregationLabel } = useMemo(() => {
    if (user?.role === 'CRO') {
        return { aggregationKey: 'institute', aggregationLabel: 'Institute' };
    }
    if (user?.designation === 'Principal' || user?.designation === 'HOD' || user?.email === 'pit@paruluniversity.ac.in') {
        return { aggregationKey: 'departmentName', aggregationLabel: 'Department' };
    }
    // Default for Admin/Super-admin
    return { aggregationKey: 'faculty', aggregationLabel: 'Faculty' };
  }, [user]);


  const projectsByGroupData = useMemo(() => 
    Object.entries(
      filteredProjects.reduce((acc, project) => {
        const key = project[aggregationKey as keyof Project] as string | undefined;
        if (key) {
          acc[key] = (acc[key] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>)
    ).map(([group, count]) => ({ group, projects: count }))
    .sort((a, b) => b.projects - a.projects)
  , [filteredProjects, aggregationKey]);

  const projectsByGroupConfig = {
    projects: { label: 'Projects', color: 'hsl(var(--accent))' },
  } satisfies ChartConfig;

  const statusDistributionData = useMemo(() => {
    const statusCounts = filteredProjects.reduce((acc, project) => {
        const status = project.status || 'Unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  }, [filteredProjects]);

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
    return filteredProjects.reduce((acc, project) => {
        return acc + (project.grant?.totalAmount || 0);
    }, 0);
  }, [filteredProjects]);

  const isCro = user?.role === 'CRO';

  const getPageTitle = () => {
      if (isCro) {
          if (facultyFilter === 'all') return `Analytics for All Your Faculties`;
          return `Analytics for ${facultyFilter}`;
      }
      if (user?.designation === 'Principal' && user.institute) return `Analytics for ${user.institute}`;
      if (user?.designation === 'Principal' && !user.institute) return 'Analytics (Principal - No Institute Set)';
      if (user?.designation === 'HOD' && user.department && user.institute) return `Analytics for ${user.department}, ${user.institute}`;
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
        <div className="mt-8 grid gap-6 md:grid-cols-1 lg:grid-cols-3">
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
      <PageHeader title={getPageTitle()} description={getPageDescription()}>
          {isCro && user.faculties && user.faculties.length > 1 && (
            <Select value={facultyFilter} onValueChange={setFacultyFilter}>
                <SelectTrigger className="w-full sm:w-[280px]">
                    <SelectValue placeholder="Filter by faculty" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Assigned Faculties</SelectItem>
                    {user.faculties.map(faculty => (
                        <SelectItem key={faculty} value={faculty}>{faculty}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        )}
      </PageHeader>
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
            <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
              <div>
                <CardTitle>Submissions Over Time</CardTitle>
                <CardDescription>
                  {timeRange === 'last6months'
                    ? 'Monthly project submissions for the last 6 months.'
                    : `Monthly project submissions for ${timeRange}.`}
                </CardDescription>
              </div>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last6months">Last 6 Months</SelectItem>
                  {availableYears.map(year => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
