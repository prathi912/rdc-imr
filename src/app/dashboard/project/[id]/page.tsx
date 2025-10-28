
"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { doc, getDoc, onSnapshot, collection, query, where } from "firebase/firestore"
import { db } from "@/lib/config"
import type { Project, User, Evaluation } from "@/types"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { ProjectDetailsClient } from "@/components/projects/project-details-client"
import { getDocs } from "firebase/firestore"

export default function ProjectDetailsPage() {
  const params = useParams()
  const projectId = params.id as string
  const [project, setProject] = useState<Project | null>(null)
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [piUser, setPiUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProjectAndUsers = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch the project document
      const projectRef = doc(db, 'projects', projectId);
      const projectSnap = await getDoc(projectRef);

      if (!projectSnap.exists()) {
        setError('Project not found.');
        setLoading(false);
        return;
      }
      
      const projectData = { id: projectSnap.id, ...projectSnap.data() } as Project;
      setProject(projectData);
      
      // Fetch all users
      const usersRef = collection(db, 'users');
      const usersSnap = await getDocs(usersRef);
      const userList = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }) as User);
      setAllUsers(userList);
      
      // Find the specific PI user
      const pi = userList.find(u => u.uid === projectData.pi_uid);
      setPiUser(pi || null);

    } catch (err: any) {
      setError(err.message || 'Failed to load project data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProjectAndUsers();
  }, [fetchProjectAndUsers]);
  
  const handleProjectUpdate = (updatedProject: Project) => {
    setProject(updatedProject);
    // Optionally, you might want to re-fetch related data here if the update could affect it
  };


  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Loading Project..." description="Please wait while we fetch the details." />
        <Card className="mt-8">
            <CardContent className="pt-6 space-y-6">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-10 w-1/2" />
                <Skeleton className="h-10 w-full" />
            </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Error" description={error} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Project Not Found" description="The project you are looking for does not exist." />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <PageHeader title={project.title} description={project.type} backButtonHref="/dashboard/my-projects" />
      <div className="mt-8">
        <ProjectDetailsClient 
          project={project}
          allUsers={allUsers}
          piUser={piUser}
          onProjectUpdate={handleProjectUpdate}
        />
      </div>
    </div>
  );
}
