
'use client';

import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { type Project, type User } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { db } from '@/lib/config';
import { collection, getDocs, query, where, orderBy, or } from 'firebase/firestore';
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
          
          // This query now correctly combines the three conditions to find all projects associated with a user.
          // The Firestore security rules have been updated to explicitly allow this specific OR query.
          const combinedQuery = query(
            projectsRef,
            or(
              where('pi_uid', '==', parsedUser.uid),
              where('coPiUids', 'array-contains', parsedUser.uid),
              where('pi_email', '==', parsedUser.email) // This will find historical projects before pi_uid is linked.
            )
          );
          
          const querySnapshot = await getDocs(combinedQuery);
          
          const userProjectsMap = new Map<string, Project>();

          querySnapshot.forEach((doc) => {
            if (!userProjectsMap.has(doc.id)) {
              userProjectsMap.set(doc.id, { id: doc.id, ...doc.data() } as Project);
            }
          });

          const allUserProjects = Array.from(userProjectsMap.values());
          allUserProjects.sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime());

          setMyProjects(allUserProjects);
        } catch (error: any) {
          console.error("Error fetching user's projects:", error);
          toast({ variant: 'destructive', title: 'Error', description: `Could not fetch your projects. Reason: ${error.message}` });
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
