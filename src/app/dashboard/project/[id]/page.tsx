
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { doc, getDoc, collection, getDocs, query, where, documentId } from 'firebase/firestore';
import { db } from '@/lib/config';
import type { Project, User } from '@/types';
import { PageHeader } from '@/components/page-header';
import { ProjectDetailsClient } from '@/components/projects/project-details-client';
import { ProjectSummary } from '@/components/projects/project-summary';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { PRINCIPAL_EMAILS } from '@/lib/constants';

export default function ProjectDetailsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [piUser, setPiUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sessionUser, setSessionUser] = useState<User | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
        setSessionUser(JSON.parse(storedUser));
    }
  }, []);

  const getProjectAndUsers = useCallback(async (id: string) => {
    if (!sessionUser) return;
    setLoading(true);
    try {
        const projectRef = doc(db, 'projects', id);
        const projectSnap = await getDoc(projectRef);

        if (!projectSnap.exists()) {
            setNotFound(true);
            setLoading(false);
            return;
        }
        
        const projectData = { 
            id: projectSnap.id,
            ...projectSnap.data(),
            submissionDate: projectSnap.data().submissionDate || new Date().toISOString()
        } as Project;

        // Perform comprehensive client-side authorization check
        const isAdmin = ['Super-admin', 'admin', 'CRO'].includes(sessionUser.role);
        const isPrincipal = sessionUser.email ? PRINCIPAL_EMAILS.includes(sessionUser.email) : false;
        const isPrincipalForProject = isPrincipal && sessionUser.institute === projectData.institute;
        const isHod = sessionUser.designation === 'HOD' && sessionUser.department === projectData.departmentName;
        const isPI = sessionUser.uid === projectData.pi_uid;
        const isCoPI = projectData.coPiUids?.includes(sessionUser.uid);
        const isAssignedEvaluator = projectData.meetingDetails?.assignedEvaluators?.includes(sessionUser.uid);
        const isSpecialUser = sessionUser.email === 'unnati.joshi22950@paruluniversity.ac.in' && projectData.faculty === 'Faculty of Engineering & Technology';

        const hasPermission = isPI || isCoPI || isAdmin || isPrincipalForProject || isHod || isAssignedEvaluator || isSpecialUser;

        if (!hasPermission) {
             setNotFound(true); 
             setLoading(false);
             return;
        }

        setProject(projectData);

        // Fetch PI's user data only if pi_uid exists
        if (projectData.pi_uid) {
            const piUserRef = doc(db, 'users', projectData.pi_uid);
            const piUserSnap = await getDoc(piUserRef);
            if (piUserSnap.exists()) {
                setPiUser({ uid: piUserSnap.id, ...piUserSnap.data() } as User);
            }
        }

        const usersRef = collection(db, 'users');
        let userList: User[] = [];

        // Only admins need the full user list for UI components like re-assigning evaluators.
        if (isAdmin) {
          const usersSnap = await getDocs(usersRef);
          userList = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
        }
        setAllUsers(userList);

    } catch (error) {
        console.error("Error fetching project data:", error);
        setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [sessionUser]);

  useEffect(() => {
    if (projectId && sessionUser) {
        getProjectAndUsers(projectId);
    } else if (!sessionUser && !loading) {
        // If there's no session user and we aren't already loading, it's likely they're logged out.
        setNotFound(true);
    }
  }, [projectId, sessionUser, getProjectAndUsers, loading]);


  if (loading) {
     return (
        <div className="container mx-auto py-10">
             <PageHeader 
                title="Project Details"
                description="Loading project details..."
             />
             <div className="mt-8">
                <Card>
                    <CardContent className="p-6">
                        <Skeleton className="h-[400px] w-full" />
                    </CardContent>
                </Card>
             </div>
        </div>
     )
  }

  if (notFound || !project) {
    return (
      <div className="container mx-auto py-10 text-center">
        <PageHeader 
          title="Project Not Found"
          description="The project you are looking for does not exist or you do not have permission to view it."
          backButtonHref="/dashboard/all-projects"
          backButtonText="Back to Projects"
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <PageHeader 
        title="Project Details"
        description="View project details and manage its status."
        backButtonHref="/dashboard/all-projects"
        backButtonText="Back to Projects"
      >
        <ProjectSummary project={project} />
      </PageHeader>
      <div className="mt-8">
        <ProjectDetailsClient project={project} allUsers={allUsers} piUser={piUser} />
      </div>
    </div>
  );
}
