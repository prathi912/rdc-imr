import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Book, CheckCircle, Clock, Users } from 'lucide-react';
import { ProjectList } from '@/components/projects/project-list';
import Link from 'next/link';
import { Button } from '../ui/button';
import { ArrowRight } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, limit, orderBy } from 'firebase/firestore';
import type { Project } from '@/types';

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

        const recentProjects = allProjects
            .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime())
            .slice(0, 4);

        return {
            totalProjects,
            pendingReviews,
            approvedProjects,
            totalUsers,
            recentProjects
        };

    } catch (error) {
        console.error("Error fetching admin dashboard data: ", error);
        return { totalProjects: 0, pendingReviews: 0, approvedProjects: 0, totalUsers: 0, recentProjects: [] };
    }
}

export async function AdminDashboard() {
  const { totalProjects, pendingReviews, approvedProjects, totalUsers, recentProjects } = await getDashboardData();
  
  const statCards = [
    { title: 'Total Projects', value: totalProjects.toString(), icon: Book },
    { title: 'Pending Reviews', value: pendingReviews.toString(), icon: Clock },
    { title: 'Approved Projects', value: approvedProjects.toString(), icon: CheckCircle },
    { title: 'Total Users', value: totalUsers.toString(), icon: Users },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-3xl font-bold tracking-tight">Admin Dashboard</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div>
        <div className="mb-4 flex items-center justify-between">
            <h3 className="text-2xl font-bold tracking-tight">Recent Submissions</h3>
            <Link href="/dashboard/all-projects" passHref>
              <Button variant="ghost">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
        </div>
        <ProjectList projects={recentProjects} userRole="admin" />
      </div>
    </div>
  );
}
