'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { type Project, type User } from '@/types';
import { projects } from '@/lib/data';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export default function MyProjectsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [myProjects, setMyProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser) as User;
      setUser(parsedUser);
      // In a real app, you'd filter by user ID (pi_uid)
      const userProjects = projects.filter(p => p.pi === parsedUser.name);
      setMyProjects(userProjects);
    }
    setLoading(false);
  }, []);

  if (loading) {
    return (
       <div className="container mx-auto py-10">
        <PageHeader title="My Projects" description="A list of all projects you have submitted." />
        <div className="mt-8">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="My Projects" description="A list of all projects you have submitted." />
      <div className="mt-8">
        <ProjectList projects={myProjects} userRole="faculty" />
      </div>
    </div>
  );
}
