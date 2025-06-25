'use client';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, BarChart, CartesianGrid, XAxis, Line, LineChart, Legend, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

const submissionsData = [
  { month: 'January', submissions: 18 },
  { month: 'February', submissions: 30 },
  { month: 'March', submissions: 23 },
  { month: 'April', submissions: 27 },
  { month: 'May', submissions: 20 },
  { month: 'June', submissions: 25 },
];

const submissionsConfig = {
  submissions: { label: 'Submissions', color: 'hsl(var(--primary))' },
} satisfies ChartConfig;

const departmentData = [
  { department: 'Computer Science', projects: 120, },
  { department: 'Physics', projects: 90, },
  { department: 'Medical Research', projects: 50, },
  { department: 'Engineering', projects: 80, },
  { department: 'Arts & Humanities', projects: 30, },
];

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
