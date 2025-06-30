'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Book, CheckCircle, Clock, Users } from 'lucide-react';
import { ProjectList } from '@/components/projects/project-list';
import Link from 'next/link';
import { Button } from '../ui/button';
import { ArrowRight } from 'lucide-react';
import { db } from '@/lib/config';
import { collection, getDocs } from 'firebase/firestore';
import type { Project } from '@/types';
import { Skeleton } from '../ui/skeleton';

interface DashboardStats {
  totalProjects: number;
  pendingReviews: number;
  approvedProjects: number;
  totalUsers: number;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalProjects: 0,
    pendingReviews: 0,
    approvedProjects: 0,
    totalUsers: 0,
  });
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getDashboardData() {
      try {
        const projectsRef = collection(db, "projects");
        const usersRef = collection(db, "users");

        const projectsSnapshot = await getDocs(projectsRef);
        const usersSnapshot = await getDocs(usersRef);

        const allProjects = projectsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project));
        
        const totalProjects = allProjects.length;
        const pendingReviews = allProjects.filter(p => p.status === 'Under Review').length;
        const approvedProjects = allProjects.filter(p => p.status === 'Approved').length;
        const totalUsers = usersSnapshot.size;

        const sortedProjects = allProjects
            .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime())
            .slice(0, 4);
        
        setStats({ totalProjects, pendingReviews, approvedProjects, totalUsers });
        setRecentProjects(sortedProjects);
      } catch (error) {
        console.error("Error fetching admin dashboard data: ", error);
      } finally {
        setLoading(false);
      }
    }
    getDashboardData();
  }, []);
  
  const statCards = [
    { title: 'Total Projects', value: stats.totalProjects.toString(), icon: Book, loading: loading },
    { title: 'Pending Reviews', value: stats.pendingReviews.toString(), icon: Clock, loading: loading },
    { title: 'Approved Projects', value: stats.approvedProjects.toString(), icon: CheckCircle, loading: loading },
    { title: 'Total Users', value: stats.totalUsers.toString(), icon: Users, loading: loading },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-3xl font-bold tracking-tight">Admin Dashboard</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card, index) => (
          <Card 
            key={card.title} 
            className="animate-in fade-in-0 slide-in-from-bottom-4"
            style={{ animationFillMode: 'backwards', animationDelay: `${index * 120}ms` }}
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
      <div className="animate-in fade-in-0 slide-in-from-bottom-4" style={{ animationFillMode: 'backwards', animationDelay: '500ms' }}>
        <div className="mb-4 flex items-center justify-between">
            <h3 className="text-2xl font-bold tracking-tight">Recent Submissions</h3>
            <Link href="/dashboard/all-projects" passHref>
              <Button variant="ghost">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
        </div>
        {loading ? <Skeleton className="h-64 w-full" /> : <ProjectList projects={recentProjects} userRole="admin" />}
      </div>
    </div>
  );
}
