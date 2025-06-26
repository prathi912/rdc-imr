'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, BarChart, CartesianGrid, XAxis, Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { Project } from '@/types';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

export default function AnalyticsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const projectsCollection = collection(db, 'projects');
        const projectSnapshot = await getDocs(projectsCollection);
        const projectList = projectSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
        setProjects(projectList);
      } catch (error) {
        console.error("Error fetching project data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  // --- Data Processing ---
  // Submissions over the last 6 months
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return { name: format(d, 'MMMM'), start: startOfMonth(d), end: endOfMonth(d) };
  }).reverse();

  const submissionsData = last6Months.map(month => {
    const count = projects.filter(p => {
      const submissionDate = parseISO(p.submissionDate);
      return submissionDate >= month.start && submissionDate <= month.end;
    }).length;
    return { month: month.name, submissions: count };
  });

  const submissionsConfig = {
    submissions: { label: 'Submissions', color: 'hsl(var(--primary))' },
  } satisfies ChartConfig;

  // Projects by faculty
  const facultyData = Object.entries(
    projects.reduce((acc, project) => {
      acc[project.faculty] = (acc[project.faculty] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([faculty, count]) => ({ faculty, projects: count }))
  .sort((a, b) => b.projects - a.projects);

  const facultyConfig = {
    projects: { label: 'Projects', color: 'hsl(var(--accent))' },
  } satisfies ChartConfig;

  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Analytics" description="Visualize project data and submission trends." />
        <div className="mt-8 grid gap-6 md:grid-cols-1 lg:grid-cols-2">
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-3/4" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-[300px] w-full" />
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-3/4" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-[300px] w-full" />
                </CardContent>
            </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Analytics" description="Visualize project data and submission trends." />
      <div className="mt-8 grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Submissions Over Time</CardTitle>
            <CardDescription>Monthly project submissions for the last 6 months.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={submissionsConfig} className="h-[300px] w-full">
              <LineChart
                accessibilityLayer
                data={submissionsData}
                margin={{ left: 12, right: 12 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent />}
                />
                <Line
                  dataKey="submissions"
                  type="monotone"
                  stroke="var(--color-submissions)"
                  strokeWidth={2}
                  dot={true}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Projects by Faculty</CardTitle>
            <CardDescription>Total projects submitted by each faculty.</CardDescription>
          </CardHeader>
          <CardContent>
             <ChartContainer config={facultyConfig} className="h-[300px] w-full">
              <BarChart accessibilityLayer data={facultyData} layout="vertical" margin={{left: 30}}>
                <CartesianGrid horizontal={false} />
                <YAxis
                  dataKey="faculty"
                  type="category"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  width={250}
                  tick={{
                    fontSize: 12
                  }}
                />
                 <XAxis dataKey="projects" type="number" hide allowDecimals={false} />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent />}
                />
                <Bar dataKey="projects" layout="vertical" fill="var(--color-projects)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
