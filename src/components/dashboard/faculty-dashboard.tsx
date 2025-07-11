
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProjectList } from '@/components/projects/project-list';
import { FilePlus2, CheckCircle, Clock, ArrowRight, BookOpenCheck } from 'lucide-react';
import type { User, Project } from '@/types';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, or } from 'firebase/firestore';
import { Skeleton } from '../ui/skeleton';

export function FacultyDashboard({ user }: { user: User }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const projectsRef = collection(db, 'projects');
        const q = query(
          projectsRef,
          or(
            where('pi_uid', '==', user.uid),
            where('pi_email', '==', user.email)
          )
        );
        const querySnapshot = await getDocs(q);
        
        const projectIds = new Set<string>();
        const userProjects = querySnapshot.docs.reduce((acc, doc) => {
            if (!projectIds.has(doc.id)) {
                projectIds.add(doc.id);
                acc.push({ id: doc.id, ...doc.data() } as Project);
            }
            return acc;
        }, [] as Project[]);

        setProjects(userProjects);
      } catch (error) {
        console.error("Failed to fetch faculty projects", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [user]);

  const activeStatuses = ['Recommended', 'In Progress', 'Pending Completion Approval', 'Sanctioned', 'SANCTIONED'];
  const activeProjects = projects.filter(p => activeStatuses.includes(p.status)).length;
  
  const pendingApprovalStatuses = ['Under Review', 'Submitted', 'Revision Needed'];
  const pendingApproval = projects.filter(p => pendingApprovalStatuses.includes(p.status)).length;
  
  const completedProjects = projects.filter(p => p.status === 'Completed').length;
  const upcomingMeetings = projects.filter(p => p.meetingDetails && p.status !== 'Completed' && p.status !== 'Not Recommended');


  const statCards = [
    { title: 'Active Projects', value: activeProjects.toString(), icon: BookOpenCheck },
    { title: 'Pending Approval', value: pendingApproval.toString(), icon: Clock },
    { title: 'Completed Projects', value: completedProjects.toString(), icon: CheckCircle },
  ];

  const recentProjects = projects
    .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime())
    .slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-3xl font-bold tracking-tight">My Dashboard</h2>
        <Link href="/dashboard/new-submission">
          <Button>
            <FilePlus2 className="mr-2 h-4 w-4" />
            New Submission
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
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
      )}
      
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : upcomingMeetings.length > 0 && (
        <Card className="border-primary/40">
            <CardHeader>
                <CardTitle>Upcoming IMR Evaluation Meeting</CardTitle>
                <CardDescription>Details for your scheduled project presentation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {upcomingMeetings.map(p => (
                    p.meetingDetails &&
                    <div key={p.id} className="p-3 border rounded-lg">
                        <p className="font-semibold">{p.title}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm mt-2 text-muted-foreground">
                            <span><strong>Date:</strong> {new Date(p.meetingDetails.date).toLocaleDateString()}</span>
                            <span><strong>Time:</strong> {p.meetingDetails.time}</span>
                            <span><strong>Venue:</strong> {p.meetingDetails.venue}</span>
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
      )}

      <div>
         <div className="mb-4 flex items-center justify-between">
            <h3 className="text-2xl font-bold tracking-tight">My Recent Projects</h3>
            <Link href="/dashboard/my-projects">
              <Button variant="ghost">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
        </div>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <ProjectList projects={recentProjects} userRole="faculty" />
        )}
      </div>
    </div>
  );
}
