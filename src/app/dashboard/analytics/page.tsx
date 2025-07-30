
'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, BarChart, CartesianGrid, XAxis, Line, LineChart, ResponsiveContainer, YAxis, Tooltip, Pie, PieChart, Cell, Legend, LabelList } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { Project, User } from '@/types';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, onSnapshot, or } from 'firebase/firestore';
import { format, subMonths, startOfMonth, endOfMonth, parseISO, getYear } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, Download } from 'lucide-react';
import { createDebugInfo, logDebugInfo } from '@/lib/debug-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { toPng } from 'html-to-image';


const COLORS = ["#64B5F6", "#81C784", "#FFB74D", "#E57373", "#BA68C8", "#7986CB", "#4DD0E1", "#FFF176", "#FF8A65", "#A1887F", "#90A4AE"];
const GOA_FACULTIES = [
    "Faculty of Engineering, IT & CS",
    "Faculty of Management Studies",
    "Faculty of Pharmacy",
    "Faculty of Applied and Health Sciences",
    "Faculty of Nursing",
    "Faculty of Physiotherapy"
];

export default function AnalyticsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [facultyFilter, setFacultyFilter] = useState('all');
  const [grantGroupFilter, setGrantGroupFilter] = useState<string>('');
  const [timeRange, setTimeRange] = useState<string>('last6months');
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [submissionsByYearType, setSubmissionsByYearType] = useState<'submissions' | 'sanctions'>('submissions');
  const { toast } = useToast();
  
  const statusChartRef = useRef<HTMLDivElement>(null);
  const submissionsTimeChartRef = useRef<HTMLDivElement>(null);
  const submissionsYearChartRef = useRef<HTMLDivElement>(null);
  const projectsByGroupChartRef = useRef<HTMLDivElement>(null);
  const grantAmountChartRef = useRef<HTMLDivElement>(null);

  const handleExport = useCallback(async (ref: React.RefObject<HTMLDivElement>, fileName: string, captionText: string) => {
    if (!ref.current) {
        toast({ variant: 'destructive', title: "Export Error", description: "Chart element not found." });
        return;
    }

    const isDarkMode = document.documentElement.classList.contains('dark');
    const bgColor = isDarkMode ? '#0f172a' : '#ffffff';
    const textColor = isDarkMode ? '#e2e8f0' : '#334155';
    
    // Temporarily append a styled container to the body
    const exportContainer = document.createElement('div');
    exportContainer.style.position = 'absolute';
    exportContainer.style.left = '-9999px'; // Move it off-screen
    exportContainer.style.padding = '20px';
    exportContainer.style.backgroundColor = bgColor;

    const contentToExport = ref.current.cloneNode(true) as HTMLElement;
    
    // Add caption
    const caption = document.createElement('div');
    caption.innerText = captionText;
    caption.style.textAlign = 'center';
    caption.style.marginTop = '10px';
    caption.style.fontSize = '12px';
    caption.style.color = textColor;
    
    exportContainer.appendChild(contentToExport);
    exportContainer.appendChild(caption);
    document.body.appendChild(exportContainer);

    try {
        const dataUrl = await toPng(exportContainer, { 
            pixelRatio: 2,
            backgroundColor: bgColor,
        });

        const link = document.createElement('a');
        link.download = `${fileName}.png`;
        link.href = dataUrl;
        link.click();
    } catch (err: any) {
        console.error('Chart export failed:', err);
        toast({ variant: 'destructive', title: 'Export Failed', description: err.message });
    } finally {
        // Clean up the temporary container from the body
        document.body.removeChild(exportContainer);
    }
  }, [toast]);

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

  const sanctionsConfig = {
    sanctions: { label: 'Sanctions', color: 'hsl(var(--primary))' },
  } satisfies ChartConfig;

  const submissionsByYearData = useMemo(() => {
    if (filteredProjects.length === 0) return [];
    
    const projectsToCount = submissionsByYearType === 'sanctions'
        ? filteredProjects.filter(p => ['Recommended', 'In Progress', 'Completed', 'Sanctioned'].includes(p.status) && p.grant)
        : filteredProjects;

    const yearCounts = projectsToCount.reduce((acc, project) => {
      const year = getYear(parseISO(project.submissionDate));
      acc[year] = (acc[year] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(yearCounts)
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => parseInt(a.year) - parseInt(b.year));
  }, [filteredProjects, submissionsByYearType]);

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

  // --- Grant Chart Data & Config ---
  const { grantAggregationKey, grantAggregationLabel, grantFilterOptions } = useMemo(() => {
    let key: keyof Project = 'faculty';
    let label = 'Faculty';
    let options: string[] = [];
  
    if (user?.role === 'CRO') {
      key = 'institute';
      label = 'Institute';
      options = [...new Set(filteredProjects.map(p => p.institute).filter(Boolean) as string[])].sort();
    } else if (user?.designation === 'Principal' || user?.designation === 'HOD') {
      key = 'departmentName';
      label = 'Department';
      options = [...new Set(filteredProjects.map(p => p.departmentName).filter(Boolean) as string[])].sort();
    } else { // Admin/Super-admin
      options = [...new Set(projects.map(p => {
          const faculty = p.faculty || '';
          if (GOA_FACULTIES.includes(faculty)) {
              return `${faculty} (Goa)`;
          }
          return faculty;
      }).filter(Boolean))].sort();
    }
  
    return { grantAggregationKey: key, grantAggregationLabel: label, grantFilterOptions: options };
  }, [user, filteredProjects, projects]);
  
  useEffect(() => {
    if (!grantGroupFilter && grantFilterOptions.length > 0) {
      setGrantGroupFilter(grantFilterOptions[0]);
    } else if (grantFilterOptions.length > 0 && !grantFilterOptions.includes(grantGroupFilter)) {
      setGrantGroupFilter(grantFilterOptions[0]);
    }
  }, [grantFilterOptions, grantGroupFilter]);

  const grantAmountData = useMemo(() => {
    const projectsWithGrants = projects.filter(p => p.grant?.totalAmount);
    
    let projectsToProcess = projectsWithGrants;

    if (grantGroupFilter) {
      const filterValue = grantGroupFilter.replace(' (Goa)', '');
      projectsToProcess = projectsWithGrants.filter(p => p[grantAggregationKey] === filterValue);
    }
  
    const yearlyData = projectsToProcess.reduce((acc, project) => {
      const year = getYear(parseISO(project.submissionDate));
      if (!acc[year]) {
        acc[year] = { year: String(year), amount: 0 };
      }
      acc[year].amount += project.grant!.totalAmount;
      return acc;
    }, {} as Record<string, { year: string; amount: number }>);
  
    return Object.values(yearlyData).sort((a, b) => parseInt(a.year) - parseInt(b.year));
  }, [projects, grantGroupFilter, grantAggregationKey]);

  const grantAmountConfig = {
    amount: { label: grantGroupFilter, color: 'hsl(var(--primary))' },
  } satisfies ChartConfig;


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
            <Select value={facultyFilter} onValueChange={(value) => { setFacultyFilter(value); setGrantGroupFilter(''); }}>
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
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Project Status Distribution</CardTitle>
              <CardDescription>A summary of all projects by their current status.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleExport(statusChartRef, 'project_status_distribution', 'This chart shows the distribution of all projects based on their current status.')}>
              <Download className="mr-2 h-4 w-4" /> Export PNG
            </Button>
          </CardHeader>
          <CardContent>
            <div ref={statusChartRef} className="p-4 bg-card">
              <ChartContainer config={statusDistributionConfig} className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                          <ChartTooltip content={<ChartTooltipContent nameKey="value" />} />
                          <Pie data={statusDistributionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} isAnimationActive={false}>
                              {statusDistributionData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={statusDistributionConfig[entry.name]?.color || '#8884d8'} />
                              ))}
                          </Pie>
                      </PieChart>
                  </ResponsiveContainer>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="mt-8 grid gap-6 md:grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2">
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
              <div className="flex items-center gap-2">
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
                 <Button variant="outline" size="icon" onClick={() => handleExport(submissionsTimeChartRef, 'submissions_over_time', `This chart shows the trend of monthly project submissions for ${timeRange === 'last6months' ? 'the last 6 months' : `the year ${timeRange}`}.`)}><Download className="h-4 w-4" /></Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div ref={submissionsTimeChartRef} className="p-4 bg-card">
              <ChartContainer config={submissionsConfig} className="h-[300px] w-full">
                <LineChart accessibilityLayer data={submissionsData}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Line dataKey="submissions" type="monotone" stroke="var(--color-submissions)" strokeWidth={2} dot={true} isAnimationActive={false} />
                </LineChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Projects by Year</CardTitle>
              <CardDescription>Total projects submitted or sanctioned each year.</CardDescription>
            </div>
             <div className="flex items-center gap-2">
                <Select value={submissionsByYearType} onValueChange={(v) => setSubmissionsByYearType(v as 'submissions' | 'sanctions')}>
                    <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="submissions">Total Submissions</SelectItem>
                        <SelectItem value="sanctions">Total Sanctions</SelectItem>
                    </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={() => handleExport(submissionsYearChartRef, 'projects_by_year', `This chart displays the total number of projects ${submissionsByYearType} annually.`)}><Download className="h-4 w-4" /></Button>
             </div>
          </CardHeader>
          <CardContent>
            <div ref={submissionsYearChartRef} className="p-4 bg-card">
              <ChartContainer config={submissionsByYearType === 'submissions' ? submissionsConfig : sanctionsConfig} className="h-[300px] w-full">
              <BarChart accessibilityLayer data={submissionsByYearData} isAnimationActive={false}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis allowDecimals={false}/>
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-submissions)" radius={4} />
              </BarChart>
            </ChartContainer>
            </div>
          </CardContent>
        </Card>
      </div>
       <div className="mt-8 grid gap-6 md:grid-cols-1">
        <Card>
          <CardHeader className="flex flex-col sm:flex-row justify-between items-start gap-2">
            <div>
              <CardTitle>Grant Amount Awarded Over Years</CardTitle>
              <CardDescription>Total grant amount disbursed each year for the selected {grantAggregationLabel.toLowerCase()}.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {grantFilterOptions.length > 0 && (
                <Select value={grantGroupFilter} onValueChange={setGrantGroupFilter}>
                  <SelectTrigger className="w-full sm:w-[280px]">
                    <SelectValue placeholder={`Filter by ${grantAggregationLabel.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {grantFilterOptions.map(option => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button variant="outline" size="icon" onClick={() => handleExport(grantAmountChartRef, 'grant_amount_by_year', `This chart illustrates the total grant amount awarded each year for the ${grantAggregationLabel.toLowerCase()}: ${grantGroupFilter}.`)}><Download className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <div ref={grantAmountChartRef} className="p-4 bg-card">
              <ChartContainer config={grantAmountConfig} className="h-[400px] w-full">
                <BarChart data={grantAmountData} isAnimationActive={false}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis tickFormatter={(value) => `₹${Number(value) / 100000}L`} />
                    <Tooltip content={<ChartTooltipContent formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />} />
                    <Bar dataKey="amount" fill="var(--color-amount)" radius={4} />
                </BarChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="mt-8 grid gap-6 md:grid-cols-1">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Projects by {aggregationLabel}</CardTitle>
              <CardDescription>Total projects submitted by each {aggregationLabel.toLowerCase()}.</CardDescription>
            </div>
            <Button variant="outline" size="icon" onClick={() => handleExport(projectsByGroupChartRef, 'projects_by_group', `This chart shows the breakdown of project submissions by ${aggregationLabel.toLowerCase()}.`)}><Download className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent>
            <div ref={projectsByGroupChartRef} className="p-4 bg-card">
              <ChartContainer config={projectsByGroupConfig} className="h-[400px] w-full">
              <BarChart accessibilityLayer data={projectsByGroupData} layout="vertical" margin={{left: 30}} isAnimationActive={false}>
                <CartesianGrid horizontal={false} />
                <YAxis
                  dataKey="group"
                  type="category"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  width={250}
                  tick={{ fontSize: 12, width: 240, whiteSpace: 'normal', textAnchor: 'end' }}
                  interval={0}
                />
                 <XAxis dataKey="projects" type="number" hide allowDecimals={false} />
                 <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltipContent />} />
                <Bar dataKey="projects" layout="vertical" fill="var(--color-projects)" radius={4}>
                   <LabelList dataKey="projects" position="right" offset={8} className="fill-foreground" fontSize={12} />
                </Bar>
              </BarChart>
            </ChartContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
