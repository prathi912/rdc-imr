
'use client';

import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { type Project, type User } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { db } from '@/lib/config';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';

export default function MyProjectsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [myProjects, setMyProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser) as User;
      setUser(parsedUser);

      const fetchProjects = async () => {
        setLoading(true);
        try {
          const projectsRef = collection(db, 'projects');
          
          const piQuery = query(
            projectsRef,
            where('pi_uid', '==', parsedUser.uid)
          );
          const coPiQuery = query(
            projectsRef,
            where('coPiUids', 'array-contains', parsedUser.uid)
          );

          const [piSnapshot, coPiSnapshot] = await Promise.all([
            getDocs(piQuery),
            getDocs(coPiQuery),
          ]);
          
          const userProjects: Project[] = [];
          const projectIds = new Set<string>();

          piSnapshot.forEach(doc => {
            if (!projectIds.has(doc.id)) {
                userProjects.push({ id: doc.id, ...doc.data() } as Project);
                projectIds.add(doc.id);
            }
          });

          coPiSnapshot.forEach(doc => {
              if (!projectIds.has(doc.id)) {
                  userProjects.push({ id: doc.id, ...doc.data() } as Project);
                  projectIds.add(doc.id);
              }
          });

          userProjects.sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime());

          setMyProjects(userProjects);
        } catch (error) {
          console.error("Error fetching user's projects:", error);
          toast({ variant: 'destructive', title: 'Error', description: "Could not fetch your projects." });
        } finally {
          setLoading(false);
        }
      };
      fetchProjects();
    } else {
      setLoading(false);
    }
  }, [toast]);

  const filteredProjects = useMemo(() => {
    if (!searchTerm) return myProjects;
    return myProjects.filter(p => 
      p.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [myProjects, searchTerm]);

  if (loading) {
    return (
       <div className="container mx-auto py-10">
        <PageHeader title="My Projects" description="A list of all projects you have submitted or saved as drafts." />
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
      <PageHeader title="My Projects" description="A list of all projects you are associated with as a PI or Co-PI." />
      <div className="flex items-center py-4">
        <Input
            placeholder="Filter by title..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="max-w-sm"
        />
      </div>
      <div className="mt-4">
        {filteredProjects.length === 0 && !loading ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              You have not submitted any projects yet.
            </CardContent>
          </Card>
        ) : (
          <ProjectList projects={filteredProjects} userRole="faculty" />
        )}
      </div>
    </div>
  );
}
