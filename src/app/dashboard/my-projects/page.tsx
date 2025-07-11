
"use client"

import { useState, useEffect, useMemo } from "react"
import { PageHeader } from "@/components/page-header"
import { ProjectList } from "@/components/projects/project-list"
import type { Project, User } from "@/types"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { db } from "@/lib/config"
import { collection, getDocs, query, where, or } from "firebase/firestore"
import { useToast } from "@/hooks/use-toast"
import { Input } from "@/components/ui/input"

export default function MyProjectsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [myProjects, setMyProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    const storedUser = localStorage.getItem("user")
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser) as User
      setUser(parsedUser)

      const fetchProjects = async () => {
        setLoading(true)
        try {
          const projectsRef = collection(db, "projects")
          const isPrincipal = parsedUser.designation === "Principal"

          const allUserProjects: Project[] = []
          const projectIds = new Set<string>()

          const addProjectsToList = (projects: Project[]) => {
            projects.forEach((p) => {
              if (!projectIds.has(p.id)) {
                allUserProjects.push(p)
                projectIds.add(p.id)
              }
            })
          }

          // Queries for personal projects (PI, Co-PI, email)
          const personalProjectQueries = [
              query(projectsRef, where("pi_uid", "==", parsedUser.uid)),
              query(projectsRef, where("coPiUids", "array-contains", parsedUser.uid))
          ];
          if (parsedUser.email) {
            personalProjectQueries.push(query(projectsRef, where("pi_email", "==", parsedUser.email)));
          }

          const personalProjectSnapshots = await Promise.all(personalProjectQueries.map(q => getDocs(q).catch(e => { console.warn("A personal project query failed:", e); return null; })));

          personalProjectSnapshots.forEach(snapshot => {
              if (snapshot) {
                  addProjectsToList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)));
              }
          });


          // Additional query for Principals to get all projects from their institute
          if (isPrincipal && parsedUser.institute) {
            try {
              const instituteQuery = query(projectsRef, where("institute", "==", parsedUser.institute))
              const instituteSnapshot = await getDocs(instituteQuery)
              addProjectsToList(instituteSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)))
            } catch (error) {
              console.error("Failed to fetch institute projects:", error)
              toast({
                variant: "destructive",
                title: "Could not load institute projects",
                description: "There was an error fetching all projects for your institute.",
              })
            }
          }

          // Sort projects by submission date
          allUserProjects.sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime())

          setMyProjects(allUserProjects)
        } catch (error: any) {
          console.error("Error fetching user's projects:", error)
          toast({
            variant: "destructive",
            title: "Error",
            description: `Could not fetch your projects. ${error.message || "Please try again later."}`,
          })
        } finally {
          setLoading(false)
        }
      }
      fetchProjects()
    } else {
      setLoading(false)
    }
  }, [toast])

  const filteredProjects = useMemo(() => {
    if (!searchTerm) return myProjects
    return myProjects.filter((p) => p.title.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [myProjects, searchTerm])

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
  )
}
