
"use client"

import { useState, useEffect } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import {
  ExternalLink,
  Mail,
  Phone,
  Building,
  GraduationCap,
  Award,
  FileText,
  Calendar,
  Users,
  BookCopy,
} from "lucide-react"
import type { User, Project, EmrInterest, FundingCall, Publication } from "@/types"
import { format } from "date-fns"
import { collection, query, where, getDocs, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/config"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "../ui/skeleton"

interface ProfileClientProps {
  user: User
  projects: Project[]
  emrInterests: EmrInterest[]
  fundingCalls: FundingCall[]
}

const ProfileDetail = ({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) => (
  <div className="flex items-start gap-3">
    <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{children}</p>
    </div>
  </div>
)

export function ProfileClient({ user: initialUser, projects, emrInterests, fundingCalls }: ProfileClientProps) {
  const [user, setUser] = useState(initialUser)
  const [publications, setPublications] = useState<Publication[]>([])
  const [loadingPublications, setLoadingPublications] = useState(true)

  useEffect(() => {
    const userDocRef = doc(db, 'users', initialUser.uid);
    const unsubscribe = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        setUser({ uid: doc.id, ...doc.data() } as User);
      }
    });
    return () => unsubscribe();
  }, [initialUser.uid]);

  useEffect(() => {
    const fetchPublications = async () => {
      setLoadingPublications(true);
      try {
        const q = query(
          collection(db, "publications"),
          where("authorUids", "array-contains", user.uid)
        );
        const snapshot = await getDocs(q);
        const userPublications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Publication));
        userPublications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setPublications(userPublications);
      } catch (error) {
        console.error("Error fetching publications:", error);
      } finally {
        setLoadingPublications(false);
      }
    };
    fetchPublications();
  }, [user.uid]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Completed": case "Recommended": case "Sanctioned":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
      case "In Progress": case "Under Review":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
      case "Revision Needed":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
      case "Not Recommended":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
    }
  }

  const getEmrStatusColor = (status: string) => {
    switch (status) {
      case "Recommended": case "Endorsement Signed": case "Submitted to Agency":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
      case "Evaluation Pending": case "PPT Submitted":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
      case "Revision Needed":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
      case "Not Recommended":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
      {/* Left Column: Profile Card */}
      <div className="md:col-span-1 md:sticky md:top-24">
        <Card className="overflow-hidden">
          <CardHeader className="p-0">
            <div className="h-24 bg-primary/20" />
            <div className="flex items-center gap-4 p-6 pb-2 -mt-16">
               <Avatar className="h-24 w-24 border-4 border-background">
                <AvatarImage src={user.photoURL || undefined} alt={user.name} />
                <AvatarFallback className="text-2xl">{user.name?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="pt-12">
                <CardTitle className="text-xl">{user.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{user.designation}</p>
              </div>
            </div>
            {user.researchDomain && <CardDescription className="px-6 pt-2 font-medium text-primary">{user.researchDomain}</CardDescription>}
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <Separator />
            <ProfileDetail icon={Mail} label="Email">{user.email}</ProfileDetail>
            {user.phoneNumber && <ProfileDetail icon={Phone} label="Phone">{user.phoneNumber}</ProfileDetail>}
            <ProfileDetail icon={Building} label="Institute">{user.institute}</ProfileDetail>
            <ProfileDetail icon={GraduationCap} label="Department">{user.department}</ProfileDetail>
            <ProfileDetail icon={Award} label="Faculty">{user.faculty}</ProfileDetail>
            
            <Separator />
             <div className="space-y-3">
              <h4 className="font-semibold text-sm text-muted-foreground">Academic IDs</h4>
              {user.orcidId && <ProfileDetail icon={ExternalLink} label="ORCID iD"><a href={`https://orcid.org/${user.orcidId}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{user.orcidId}</a></ProfileDetail>}
              {user.scopusId && <ProfileDetail icon={ExternalLink} label="Scopus ID">{user.scopusId}</ProfileDetail>}
              {user.googleScholarId && <ProfileDetail icon={ExternalLink} label="Google Scholar ID">{user.googleScholarId}</ProfileDetail>}
              {user.vidwanId && <ProfileDetail icon={ExternalLink} label="Vidwan ID">{user.vidwanId}</ProfileDetail>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Projects, Publications etc. */}
      <div className="md:col-span-2 space-y-8">
        <Tabs defaultValue="imr" className="w-full">
            <TabsList>
                <TabsTrigger value="imr">IMR Projects ({projects.length})</TabsTrigger>
                <TabsTrigger value="emr">EMR Applications ({emrInterests.length})</TabsTrigger>
                <TabsTrigger value="publications">Paper Publications ({publications.length})</TabsTrigger>
            </TabsList>
            
            <TabsContent value="imr" className="mt-4">
                <Card>
                    <CardHeader><CardTitle>IMR Projects</CardTitle></CardHeader>
                    <CardContent>
                        {projects.length === 0 ? <p className="text-muted-foreground text-center py-8">No IMR projects found.</p> : (
                        <div className="space-y-4">
                            {projects.map((project) => (
                            <div key={project.id} className="border rounded-lg p-4">
                                <div className="flex items-start justify-between mb-2"><h4 className="font-semibold text-sm line-clamp-2">{project.title}</h4><Badge className={getStatusColor(project.status)} variant="secondary">{project.status}</Badge></div>
                                <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{project.abstract}</p>
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(project.submissionDate), "MMM yyyy")}</div>
                                <div className="flex items-center gap-1"><Building className="h-3 w-3" />{project.faculty}</div>
                                {project.grant && <div className="flex items-center gap-1"><Award className="h-3 w-3" />₹{project.grant.totalAmount.toLocaleString()}</div>}
                                </div>
                            </div>
                            ))}
                        </div>
                        )}
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="emr" className="mt-4">
                <Card>
                    <CardHeader><CardTitle>EMR Applications</CardTitle></CardHeader>
                    <CardContent>
                        {emrInterests.length === 0 ? <p className="text-muted-foreground text-center py-8">No EMR applications found.</p> : (
                        <div className="space-y-4">
                            {emrInterests.map((interest) => {
                            const fundingCall = fundingCalls.find((call) => call.id === interest.callId)
                            return (
                                <div key={interest.id} className="border rounded-lg p-4">
                                <div className="flex items-start justify-between mb-2"><h4 className="font-semibold text-sm line-clamp-2">{fundingCall?.title || "EMR Application"}</h4><Badge className={getEmrStatusColor(interest.status)} variant="secondary">{interest.status}</Badge></div>
                                {fundingCall && <p className="text-xs text-muted-foreground mb-2">Agency: {fundingCall.agency}</p>}
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                    <div className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(interest.registeredAt), "MMM yyyy")}</div>
                                    <div className="flex items-center gap-1"><Building className="h-3 w-3" />{interest.faculty}</div>
                                    {interest.coPiNames && interest.coPiNames.length > 0 && <div className="flex items-center gap-1"><Users className="h-3 w-3" />+{interest.coPiNames.length} Co-PI{interest.coPiNames.length > 1 ? "s" : ""}</div>}
                                </div>
                                </div>
                            )})}
                        </div>
                        )}
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="publications" className="mt-4">
                 <Card>
                    <CardHeader><CardTitle>Paper Publications</CardTitle></CardHeader>
                    <CardContent>
                        {loadingPublications ? <Skeleton className="h-40 w-full" /> : 
                        publications.length === 0 ? <p className="text-muted-foreground text-center py-8">No publications added yet.</p> : (
                        <div className="space-y-4">
                            {publications.map((pub) => (
                            <div key={pub.id} className="border rounded-lg p-4">
                                <h4 className="font-semibold text-sm">{pub.title}</h4>
                                <p className="text-xs text-muted-foreground mt-2">Authors: {pub.authorNames.join(', ')}</p>
                                <p className="text-xs text-muted-foreground mt-1">Added on: {format(new Date(pub.createdAt), "PPP")}</p>
                            </div>
                            ))}
                        </div>
                        )}
                    </CardContent>
                </Card>
            </TabsContent>

        </Tabs>
      </div>
    </div>
  )
}
