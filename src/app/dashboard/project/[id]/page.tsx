
"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useParams } from "next/navigation"
import { doc, getDoc, collection, getDocs, query, where, limit } from "firebase/firestore"
import { db } from "@/lib/config"
import type { Project, User } from "@/types"
import { PageHeader } from "@/components/page-header"
import { ProjectDetailsClient } from "@/components/projects/project-details-client"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { ProjectSummary } from "@/components/projects/project-summary"

export default function ProjectDetailsPage() {
  const params = useParams()
  const projectId = params.id as string
  const [project, setProject] = useState<Project | null>(null)
  const [piUser, setPiUser] = useState<User | null>(null)
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [sessionUser, setSessionUser] = useState<User | null>(null)

  const getProjectAndUsers = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const projectRef = doc(db, "projects", id)
      const projectSnap = await getDoc(projectRef)

      if (!projectSnap.exists()) {
        console.log("Project document does not exist:", id)
        setNotFound(true)
        setLoading(false)
        return
      }

      let projectData = {
        id: projectSnap.id,
        ...projectSnap.data(),
        submissionDate: projectSnap.data().submissionDate || new Date().toISOString(),
      } as Project
      

      let fetchedPiUser: User | null = null;
      // First, try to fetch the PI user by their UID
      if (projectData.pi_uid) {
        const piUserRef = doc(db, "users", projectData.pi_uid)
        const piUserSnap = await getDoc(piUserRef)
        if (piUserSnap.exists()) {
          fetchedPiUser = { uid: piUserSnap.id, ...piUserSnap.data() } as User
        }
      }
      
      // If no user was found by UID, try fetching by email (for historical projects)
      if (!fetchedPiUser && projectData.pi_email) {
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('email', '==', projectData.pi_email), limit(1));
          const userQuerySnap = await getDocs(q);
          if (!userQuerySnap.empty) {
              const userDoc = userQuerySnap.docs[0];
              fetchedPiUser = { uid: userDoc.id, ...userDoc.data() } as User;
          }
      }

      // If we found a PI user, enrich the project data with their latest info
      if (fetchedPiUser) {
        setPiUser(fetchedPiUser);
        projectData.pi = fetchedPiUser.name || projectData.pi;
        projectData.faculty = fetchedPiUser.faculty || projectData.faculty;
        projectData.institute = fetchedPiUser.institute || projectData.institute;
        projectData.departmentName = fetchedPiUser.department || projectData.departmentName;
        projectData.pi_phoneNumber = fetchedPiUser.phoneNumber || projectData.pi_phoneNumber;
      }
      
      setProject(projectData);

      // Only admins need the full user list
      if (sessionUser && ["Super-admin", "admin", "CRO"].includes(sessionUser.role)) {
        const usersRef = collection(db, "users")
        const usersSnap = await getDocs(usersRef)
        const userList = usersSnap.docs.map((doc) => ({ uid: doc.id, ...doc.data() }) as User)
        setAllUsers(userList)
      }
    } catch (error) {
      console.error("Error fetching project data:", error)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [sessionUser])

  useEffect(() => {
    const storedUser = localStorage.getItem("user")
    if (storedUser) {
      setSessionUser(JSON.parse(storedUser))
    }
  }, [])

  useEffect(() => {
    if (projectId && sessionUser) {
      getProjectAndUsers(projectId)
    } else if (!sessionUser) {
      setLoading(true) // Wait for user to be set
    }
  }, [projectId, sessionUser, getProjectAndUsers])

  const backButtonHref = useMemo(() => {
    if (!sessionUser) return '/dashboard/my-projects';
    
    const adminRoles = ['admin', 'CRO', 'Super-admin'];
    const hasAdminView = adminRoles.includes(sessionUser.role) || sessionUser.designation === 'Principal' || sessionUser.designation === 'HOD';

    return hasAdminView ? '/dashboard/all-projects' : '/dashboard/my-projects';
  }, [sessionUser]);

  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Project Details" description="Loading project details..." />
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
          backButtonHref={backButtonHref}
          backButtonText="Back to Projects"
        />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10">
      <PageHeader
        title={project.title}
        description="View project details and manage its status."
        backButtonHref={backButtonHref}
        backButtonText="Back to Projects"
      >
        <ProjectSummary project={project} />
      </PageHeader>
      <div className="mt-8">
        <ProjectDetailsClient project={project} allUsers={allUsers} piUser={piUser} />
      </div>
    </div>
  )
}

  