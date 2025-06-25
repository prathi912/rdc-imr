'use client';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, BarChart, CartesianGrid, XAxis, Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { projects } from '@/lib/data';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';

// --- Data Processing ---
// Submissions over the last 6 months
const last6Months = Array.from({ length: 6 }, (_, i) => {
  const d = subMonths(new Date(), i);
  return { name: format(d, 'MMMM'), start: startOfMonth(d), end: endOfMonth(d) };
}).reverse();

const submissionsData = last6Months.map(month => {
  const count = projects.filter(p => {
    const submissionDate = new Date(p.submissionDate);
    return submissionDate >= month.start && submissionDate <= month.end;
  }).length;
  return { month: month.name, submissions: count };
});

const submissionsConfig = {
  submissions: { label: 'Submissions', color: 'hsl(var(--primary))' },
} satisfies ChartConfig;

// Projects by department
const departmentData = Object.entries(
  projects.reduce((acc, project) => {
    acc[project.department] = (acc[project.department] || 0) + 1;
    return acc;
  }, {} as Record<string, number>)
).map(([department, count]) => ({ department, projects: count }))
 .sort((a, b) => b.projects - a.projects);


const departmentConfig = {
  projects: { label: 'Projects', color: 'hsl(var(--accent))' },
} satisfies ChartConfig;


export default function AnalyticsPage() {
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
                <YAxis tickLine={false} axisLine={false} tickMargin={8} />
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
            <CardTitle>Projects by Department</CardTitle>
            <CardDescription>Total projects submitted by each department.</CardDescription>
          </CardHeader>
          <CardContent>
             <ChartContainer config={departmentConfig} className="h-[300px] w-full">
              <BarChart accessibilityLayer data={departmentData} layout="vertical" margin={{left: 30}}>
                <CartesianGrid horizontal={false} />
                <YAxis
                  dataKey="department"
                  type="category"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  width={120}
                />
                 <XAxis dataKey="projects" type="number" hide />
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
