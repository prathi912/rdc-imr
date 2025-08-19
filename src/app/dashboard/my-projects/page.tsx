
"use client"

import { useState, useEffect, useMemo } from "react"
import { PageHeader } from "@/components/page-header"
import { ProjectList } from "@/components/projects/project-list"
import type { Project, User, EmrInterest, FundingCall } from "@/types"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { db } from "@/lib/config"
import { collection, getDocs, query, where, or, orderBy } from "firebase/firestore"
import { useToast } from "@/hooks/use-toast"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"

function EmrProjectList({ interests, calls }: { interests: EmrInterest[]; calls: FundingCall[] }) {
  if (interests.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          You have not registered for any EMR projects.
        </CardContent>
      </Card>
    )
  }

  const getCallTitle = (interest: EmrInterest) => {
    // For historical/bulk-uploaded projects, the title is stored directly in the interest record.
    if (interest.isBulkUploaded && interest.callTitle) {
      return interest.callTitle;
    }
    // For regular projects, find the title from the associated funding call.
    return calls.find((c) => c.id === interest.callId)?.title || "Unknown Funding Call"
  }

  return (
    <Card>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funding Call Title</TableHead>
              <TableHead>Registered On</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {interests.map((interest) => (
              <TableRow key={interest.id}>
                <TableCell className="font-medium">{getCallTitle(interest)}</TableCell>
                <TableCell>{format(new Date(interest.registeredAt), "PPP")}</TableCell>
                <TableCell>
                  <Badge variant={interest.status === "Recommended" || interest.status === 'Sanctioned' ? "default" : "secondary"}>
                    {interest.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export default function MyProjectsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [myProjects, setMyProjects] = useState<Project[]>([])
  const [myEmrInterests, setMyEmrInterests] = useState<EmrInterest[]>([])
  const [fundingCalls, setFundingCalls] = useState<FundingCall[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    const storedUser = localStorage.getItem("user")
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser) as User
      setUser(parsedUser)
    } else {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) return

    const fetchAllData = async () => {
      setLoading(true)
      try {
        // Fetch IMR Projects where the user is PI, Co-PI, or PI by email (for historical data)
        const projectsRef = collection(db, "projects")
        const imrQuery = query(
          projectsRef,
          or(
            where("pi_uid", "==", user.uid), 
            where("coPiUids", "array-contains", user.uid),
            where("pi_email", "==", user.email)
          )
        );

        // Fetch EMR Interests
        const emrInterestsRef = collection(db, "emrInterests")
        const emrQuery = query(
          emrInterestsRef,
          or(
            where("userId", "==", user.uid),
            where("coPiUids", "array-contains", user.uid)
          )
        );

        // Fetch Funding Calls
        const callsRef = collection(db, "fundingCalls")
        const callsQuery = query(callsRef)

        const [imrSnapshot, emrSnapshot, callsSnapshot] = await Promise.all([
          getDocs(imrQuery),
          getDocs(emrQuery),
          getDocs(callsQuery),
        ])

        const imrProjectList = imrSnapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() } as Project))
          .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime())

        const emrInterestList = emrSnapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() } as EmrInterest))
          .sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime());

        setMyProjects(imrProjectList)
        setMyEmrInterests(emrInterestList)
        setFundingCalls(callsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as FundingCall)))
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

    fetchAllData()
  }, [user, toast])

  const filteredImrProjects = useMemo(() => {
    if (!searchTerm) return myProjects
    return myProjects.filter((p) => p.title.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [myProjects, searchTerm])
  
  const filteredEmrInterests = useMemo(() => {
    if (!searchTerm) return myEmrInterests;
    return myEmrInterests.filter(interest => {
        const call = fundingCalls.find(c => c.id === interest.callId);
        const title = interest.callTitle || call?.title || '';
        return title.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [myEmrInterests, fundingCalls, searchTerm]);

  if (loading || !user) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="My Projects" description="A list of all projects you have submitted or are associated with." />
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
      <PageHeader
        title="My Projects"
        description="A list of all projects you are associated with as a PI or Co-PI, for both Intramural (IMR) and Extramural (EMR) funding."
      />
      <div className="mt-8">
        <Tabs defaultValue="imr" className="w-full">
          <div className="flex justify-between items-center mb-4">
            <TabsList>
              <TabsTrigger value="imr">Intramural Research (IMR)</TabsTrigger>
              <TabsTrigger value="emr">Extramural Research (EMR)</TabsTrigger>
            </TabsList>
            <Input
              placeholder="Filter by title..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="max-w-sm"
            />
          </div>
          <TabsContent value="imr">
            {filteredImrProjects.length === 0 && !loading ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  You have not submitted any IMR projects yet.
                </CardContent>
              </Card>
            ) : (
              <ProjectList projects={filteredImrProjects} currentUser={user} />
            )}
          </TabsContent>
          <TabsContent value="emr">
            <EmrProjectList interests={filteredEmrInterests} calls={fundingCalls} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
