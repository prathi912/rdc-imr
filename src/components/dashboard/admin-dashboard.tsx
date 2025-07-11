
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Book, CheckCircle, Clock, Users, XCircle, FileCheck2 } from 'lucide-react';
import { ProjectList } from '@/components/projects/project-list';
import Link from 'next/link';
import { Button } from '../ui/button';
import { ArrowRight } from 'lucide-react';
import { db } from '@/lib/config';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { Project, User } from '@/types';
import { Skeleton } from '../ui/skeleton';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { PRINCIPAL_EMAILS } from '@/lib/constants';

interface DashboardStats {
  totalProjects: number;
  pendingReviews: number;
  approvedProjects: number;
  rejectedProjects: number;
  completedProjects: number;
  totalUsers: number;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalProjects: 0,
    pendingReviews: 0,
    approvedProjects: 0,
    totalUsers: 0,
    rejectedProjects: 0,
    completedProjects: 0,
  });
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [chartData, setChartData] = useState<{ group: string, projects: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
        setUser(JSON.parse(storedUser));
    }
  }, []);

  const chartConfig = {
    projects: { label: 'Projects', color: 'hsl(var(--accent))' },
  } satisfies ChartConfig;

  const { aggregationKey, aggregationLabel, chartTitle } = useMemo(() => {
    if (user?.role === 'CRO') {
        return { aggregationKey: 'institute', aggregationLabel: 'Institute', chartTitle: 'Top Institute Submissions' };
    }
    if (user?.designation === 'Principal' || user?.designation === 'HOD') {
        return { aggregationKey: 'departmentName', aggregationLabel: 'Department', chartTitle: 'Top Department Submissions' };
    }
    return { aggregationKey: 'faculty', aggregationLabel: 'Faculty', chartTitle: 'Top Faculty Submissions' };
  }, [user]);


  useEffect(() => {
    async function getDashboardData() {
        if (!user) return;
        setLoading(true);

        try {
            const projectsRef = collection(db, "projects");
            const usersRef = collection(db, "users");

            const isPrincipal = user.designation === 'Principal';
            const isHod = user.designation === 'HOD';
            const isCro = user.role === 'CRO';
            
            let projectQuery;

            if (isPrincipal && user.institute) {
                projectQuery = query(projectsRef, where('institute', '==', user.institute));
            } else if (isHod && user.department) {
                projectQuery = query(projectsRef, where('departmentName', '==', user.department));
            } else if (isCro && user.faculty) {
                projectQuery = query(projectsRef, where('faculty', '==', user.faculty));
            }
            else {
                // Admins/Super-admins see all projects
                projectQuery = query(projectsRef);
            }

            const [projectsSnapshot, usersSnapshot] = await Promise.all([
                getDocs(projectQuery),
                getDocs(usersRef)
            ]);
            
            const allProjects = projectsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project));
            
            const totalProjects = allProjects.length;
            const pendingReviews = allProjects.filter(p => p.status === 'Under Review' || p.status === 'Pending Completion Approval').length;
            const approvedProjects = allProjects.filter(p => p.status === 'Recommended').length;
            const rejectedProjects = allProjects.filter(p => p.status === 'Not Recommended').length;
            const completedProjects = allProjects.filter(p => p.status === 'Completed').length;
            const totalUsers = usersSnapshot.size;

            const sortedProjects = allProjects
                .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime())
                .slice(0, 5);
            
            setStats({ totalProjects, pendingReviews, approvedProjects, totalUsers, rejectedProjects, completedProjects });
            setRecentProjects(sortedProjects);

            const groupCounts = Object.entries(
                allProjects.reduce((acc, project) => {
                const key = project[aggregationKey as keyof Project] as string | undefined;
                if (key) {
                    acc[key] = (acc[key] || 0) + 1;
                }
                return acc;
                }, {} as Record<string, number>)
            ).map(([group, count]) => ({ group, projects: count }))
            .sort((a, b) => b.projects - a.projects)
            .slice(0, 7);
            setChartData(groupCounts);

        } catch (error) {
            console.error("Error fetching admin dashboard data: ", error);
        } finally {
            setLoading(false);
        }
    }
    getDashboardData();
  }, [user, aggregationKey]);
  
  const isPrincipal = user?.designation === 'Principal';
  const isHod = user?.designation === 'HOD';
  const isCro = user?.role === 'CRO';

  const getDashboardTitle = () => {
      if (isPrincipal && user?.institute) return `${user.institute} Dashboard`;
      if (isHod && user?.department) return `${user.department} Dashboard`;
      if (isCro) return 'CRO Dashboard';
      return "Admin Dashboard";
  };

  const statCards = [
    { title: 'Total Projects', value: stats.totalProjects.toString(), icon: Book, loading: loading },
    { title: 'Pending Reviews', value: stats.pendingReviews.toString(), icon: Clock, loading: loading },
    { title: 'Recommended', value: stats.approvedProjects.toString(), icon: CheckCircle, loading: loading },
    { title: 'Not Recommended', value: stats.rejectedProjects.toString(), icon: XCircle, loading: loading },
    { title: 'Completed', value: stats.completedProjects.toString(), icon: FileCheck2, loading: loading },
    ...(isPrincipal || isHod ? [] : [{ title: 'Total Users', value: stats.totalUsers.toString(), icon: Users, loading: loading }]),
  ];

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-3xl font-bold tracking-tight">
        {getDashboardTitle()}
      </h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((card, index) => (
          <Card 
            key={card.title} 
            className="animate-in fade-in-0 slide-in-from-bottom-4"
            style={{ animationFillMode: 'backwards', animationDelay: `${index * 100}ms` }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {card.loading ? <Skeleton className="h-8 w-1/4" /> : <div className="text-2xl font-bold">{card.value}</div>}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 animate-in fade-in-0 slide-in-from-bottom-4" style={{ animationFillMode: 'backwards', animationDelay: '600ms' }}>
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-2xl font-bold tracking-tight">Recent Submissions</h3>
                <Link href="/dashboard/all-projects" passHref>
                  <Button variant="ghost">
                    View All
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
            </div>
            {loading ? <Skeleton className="h-[400px] w-full" /> : <ProjectList projects={recentProjects} userRole="admin" />}
        </div>
        <div className="lg:col-span-2 animate-in fade-in-0 slide-in-from-bottom-4" style={{ animationFillMode: 'backwards', animationDelay: '700ms' }}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-2xl font-bold tracking-tight">Projects by {aggregationLabel}</h3>
              <Link href="/dashboard/analytics" passHref>
                  <Button variant="ghost">
                    Analytics
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
            </div>
            {loading ? <Skeleton className="h-[400px] w-full" /> : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{chartTitle}</CardTitle>
                    <CardDescription>
                      Distribution of projects across the top 7 {aggregationLabel.toLowerCase()}s.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pl-0">
                    <ChartContainer config={chartConfig} className="h-[320px] w-full">
                      <BarChart
                        accessibilityLayer
                        data={chartData}
                        layout="vertical"
                        margin={{ left: 5, right: 5 }}
                      >
                        <CartesianGrid horizontal={false} />
                        <YAxis
                          dataKey="group"
                          type="category"
                          tickLine={false}
                          tickMargin={10}
                          axisLine={false}
                          width={150}
                          tick={(props) => {
                            const { x, y, payload } = props;
                            const label = payload.value.length > 20 ? `${payload.value.substring(0, 20)}...` : payload.value;
                            return (
                                <g transform={`translate(${x},${y})`}>
                                    <text x={0} y={0} dy={4} textAnchor="end" fill="hsl(var(--muted-foreground))" fontSize={12}>{label}</text>
                                </g>
                            )
                          }}
                        />
                        <XAxis dataKey="projects" type="number" hide />
                        <ChartTooltip
                          cursor={false}
                          content={<ChartTooltipContent />}
                        />
                        <Bar
                          dataKey="projects"
                          layout="vertical"
                          fill="var(--color-projects)"
                          radius={4}
                        />
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
            )}
        </div>
      </div>
    </div>
  );
}
