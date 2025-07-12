"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { doc, getDoc, collection, getDocs } from "firebase/firestore"
import { db } from "@/lib/config"
import type { Project, User } from "@/types"
import { PageHeader } from "@/components/page-header"
import { ProjectDetailsClient } from "@/components/projects/project-details-client"
import { ProjectSummary } from "@/components/projects/project-summary"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { PRINCIPAL_EMAILS } from "@/lib/constants"
import { useAuth } from "@/components/contexts/AuthContext"

export default function ProjectDetailsPage() {
  const params = useParams()
  const projectId = params.id as string
  const [project, setProject] = useState<Project | null>(null)
  const [piUser, setPiUser] = useState<User | null>(null)
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Use AuthContext instead of localStorage
  const { user: firebaseUser, userProfile, loading: authLoading, initialLoadComplete } = useAuth()

  // Convert Firebase user and profile to the expected User type
  const sessionUser =
    firebaseUser && userProfile
      ? {
          uid: firebaseUser.uid,
          name: userProfile.fullName || firebaseUser.displayName || "",
          email: firebaseUser.email || "",
          role: userProfile.isSuperAdmin
            ? ("Super-admin" as const)
            : userProfile.role === "ADMIN_FACULTY"
              ? ("admin" as const)
              : ("faculty" as const),
          designation: userProfile.designation || "faculty",
          department: userProfile.department,
          institute: userProfile.instituteName,
          faculty: userProfile.faculty,
          photoURL: firebaseUser.photoURL || "",
        }
      : firebaseUser
        ? {
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || "",
            email: firebaseUser.email || "",
            role: "faculty" as const,
            photoURL: firebaseUser.photoURL || "",
          }
        : null

  const getProjectAndUsers = useCallback(
    async (id: string) => {
      if (!sessionUser) {
        console.log("No session user available for authorization check")
        return
      }

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

        const projectData = {
          id: projectSnap.id,
          ...projectSnap.data(),
          submissionDate: projectSnap.data().submissionDate || new Date().toISOString(),
        } as Project

        // Debug logging
        console.log("Authorization check:", {
          sessionUserUid: sessionUser.uid,
          projectPiUid: projectData.pi_uid,
          sessionUserRole: sessionUser.role,
          sessionUserEmail: sessionUser.email,
          sessionUserDesignation: sessionUser.designation,
          sessionUserDepartment: sessionUser.department,
          sessionUserInstitute: sessionUser.institute,
          projectInstitute: projectData.institute,
          projectDepartment: projectData.departmentName,
        })

        // Perform comprehensive client-side authorization check
        const isAdmin = ["Super-admin", "admin", "CRO"].includes(sessionUser.role)
        const isPrincipal = sessionUser.email ? PRINCIPAL_EMAILS.includes(sessionUser.email) : false
        const isPrincipalForProject = isPrincipal && sessionUser.institute === projectData.institute
        const isHod = sessionUser.designation === "HOD" && sessionUser.department === projectData.departmentName
        const isPI = sessionUser.uid === projectData.pi_uid
        const isCoPI = projectData.coPiUids?.includes(sessionUser.uid)
        const isAssignedEvaluator = projectData.meetingDetails?.assignedEvaluators?.includes(sessionUser.uid)
        const isSpecialUser =
          sessionUser.email === "unnati.joshi22950@paruluniversity.ac.in" &&
          projectData.faculty === "Faculty of Engineering & Technology"

        // Debug logging for permission checks
        console.log("Permission checks:", {
          isPI,
          isCoPI,
          isAdmin,
          isPrincipal,
          isPrincipalForProject,
          isHod,
          isAssignedEvaluator,
          isSpecialUser,
        })

        const hasPermission =
          isPI || isCoPI || isAdmin || isPrincipalForProject || isHod || isAssignedEvaluator || isSpecialUser

        console.log("Final permission result:", hasPermission)

        if (!hasPermission) {
          console.log("User does not have permission to view this project")
          setNotFound(true)
          setLoading(false)
          return
        }

        setProject(projectData)

        // Fetch PI's user data only if pi_uid exists
        if (projectData.pi_uid) {
          const piUserRef = doc(db, "users", projectData.pi_uid)
          const piUserSnap = await getDoc(piUserRef)
          if (piUserSnap.exists()) {
            setPiUser({ uid: piUserSnap.id, ...piUserSnap.data() } as User)
          }
        }

        const usersRef = collection(db, "users")
        let userList: User[] = []

        // Only admins need the full user list for UI components like re-assigning evaluators.
        if (sessionUser && ["Super-admin", "admin", "CRO"].includes(sessionUser.role)) {
          const usersSnap = await getDocs(usersRef)
          userList = usersSnap.docs.map((doc) => ({ uid: doc.id, ...doc.data() }) as User)
        }
        setAllUsers(userList)
      } catch (error) {
        console.error("Error fetching project data:", error)
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    },
    [sessionUser],
  )

  useEffect(() => {
    // Wait for auth to complete loading and have initial load complete
    if (!authLoading && initialLoadComplete) {
      if (projectId && sessionUser) {
        console.log("Fetching project data for:", { projectId, sessionUserUid: sessionUser.uid })
        getProjectAndUsers(projectId)
      } else if (projectId && !sessionUser) {
        // If we have projectId but no sessionUser after auth is complete, show not found
        console.log("No session user found after auth completion, showing not found")
        setNotFound(true)
        setLoading(false)
      }
    }
  }, [projectId, sessionUser, authLoading, initialLoadComplete, getProjectAndUsers])

  // Show loading while auth is loading or while we're fetching project data
  if (authLoading || !initialLoadComplete || (loading && !notFound)) {
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
          backButtonHref="/dashboard/my-projects"
          backButtonText="Back to Projects"
        />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10">
      <PageHeader
        title="Project Details"
        description="View project details and manage its status."
        backButtonHref="/dashboard/my-projects"
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
