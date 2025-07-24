"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  ExternalLink,
  Mail,
  Phone,
  Building,
  GraduationCap,
  Award,
  Calendar,
  Users,
  Plus,
  X,
  AlertCircle,
} from "lucide-react"
import type { User, Project, EmrInterest, FundingCall, Publication } from "@/types"
import { format } from "date-fns"
import { collection, query, where, getDocs, onSnapshot, doc } from "firebase/firestore"
import { db } from "@/lib/config"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "../ui/skeleton"
import { addPublication, findUserByEmail } from "@/app/actions"

interface ProfileClientProps {
  user: User
  projects: Project[]
  emrInterests: EmrInterest[]
  fundingCalls: FundingCall[]
}

const ProfileDetail = ({
  icon: Icon,
  label,
  children,
}: { icon: React.ElementType; label: string; children: React.ReactNode }) => (
  <div className="flex items-start gap-3">
    <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{children}</p>
    </div>
  </div>
)

// Helper function to safely format dates
const formatDate = (dateValue: any, formatString = "MMM yyyy"): string => {
  try {
    let date: Date

    // Handle Firestore Timestamp
    if (dateValue && typeof dateValue.toDate === "function") {
      date = dateValue.toDate()
    }
    // Handle string dates
    else if (typeof dateValue === "string") {
      date = new Date(dateValue)
    }
    // Handle Date objects
    else if (dateValue instanceof Date) {
      date = dateValue
    }
    // Handle timestamp numbers
    else if (typeof dateValue === "number") {
      date = new Date(dateValue)
    } else {
      // Fallback to current date if invalid
      date = new Date()
    }

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return "Invalid Date"
    }

    return format(date, formatString)
  } catch (error) {
    console.error("Error formatting date:", error, dateValue)
    return "Invalid Date"
  }
}

export function ProfileClient({ user: initialUser, projects, emrInterests, fundingCalls }: ProfileClientProps) {
  const [user, setUser] = useState(initialUser)
  const [publications, setPublications] = useState<Publication[]>([])
  const [loadingPublications, setLoadingPublications] = useState(true)
  const [showAddPublication, setShowAddPublication] = useState(false)
  const [publicationForm, setPublicationForm] = useState({
    title: "",
    currentUserRole: "first-author", // "first-author" or "co-author"
    authors: [{ name: user.name, email: user.email, isCurrentUser: true }],
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    const userDocRef = doc(db, "users", initialUser.uid)
    const unsubscribe = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        setUser({ uid: doc.id, ...doc.data() } as User)
      }
    })
    return () => unsubscribe()
  }, [initialUser.uid])

  useEffect(() => {
    const fetchPublications = async () => {
      setLoadingPublications(true)
      try {
        const q = query(collection(db, "publications"), where("authorUids", "array-contains", user.uid))
        const snapshot = await getDocs(q)
        const userPublications = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Publication)
        userPublications.sort((a, b) => {
          const dateA =
            a.createdAt && typeof a.createdAt.toDate === "function" ? a.createdAt.toDate() : new Date(a.createdAt || 0)
          const dateB =
            b.createdAt && typeof b.createdAt.toDate === "function" ? b.createdAt.toDate() : new Date(b.createdAt || 0)
          return dateB.getTime() - dateA.getTime()
        })
        setPublications(userPublications)
      } catch (error) {
        console.error("Error fetching publications:", error)
      } finally {
        setLoadingPublications(false)
      }
    }
    fetchPublications()
  }, [user.uid])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Completed":
      case "Recommended":
      case "Sanctioned":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
      case "In Progress":
      case "Under Review":
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
      case "Recommended":
      case "Endorsement Signed":
      case "Submitted to Agency":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
      case "Evaluation Pending":
      case "PPT Submitted":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
      case "Revision Needed":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
      case "Not Recommended":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
    }
  }

  const addAuthor = () => {
    setPublicationForm((prev) => ({
      ...prev,
      authors: [...prev.authors, { name: "", email: "", isCurrentUser: false }],
    }))
  }

  const removeAuthor = (index: number) => {
    if (publicationForm.authors[index].isCurrentUser) return // Don't allow removing current user

    setPublicationForm((prev) => ({
      ...prev,
      authors: prev.authors.filter((_, i) => i !== index),
    }))
  }

  const updateAuthor = (index: number, field: "name" | "email", value: string) => {
    setPublicationForm((prev) => ({
      ...prev,
      authors: prev.authors.map((author, i) => (i === index ? { ...author, [field]: value } : author)),
    }))
  }

  const handleSubmitPublication = async () => {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      // Validate form
      if (!publicationForm.title.trim()) {
        throw new Error("Publication title is required.")
      }

      if (publicationForm.authors.some((author) => !author.name.trim() || !author.email.trim())) {
        throw new Error("All authors must have both name and email filled.")
      }

      // Reorder authors based on current user's role
      const orderedAuthors = [...publicationForm.authors]
      if (publicationForm.currentUserRole === "first-author") {
        // Move current user to first position
        const currentUserIndex = orderedAuthors.findIndex((author) => author.isCurrentUser)
        if (currentUserIndex > 0) {
          const currentUser = orderedAuthors.splice(currentUserIndex, 1)[0]
          orderedAuthors.unshift(currentUser)
        }
      }

      // Find or validate all author UIDs
      const authorUids: string[] = []
      const authorNames: string[] = []

      for (const author of orderedAuthors) {
        if (author.isCurrentUser) {
          authorUids.push(user.uid)
          authorNames.push(author.name)
        } else {
          // Try to find user by email
          const result = await findUserByEmail(author.email)
          if (result.success && result.user) {
            authorUids.push(result.user.uid)
            authorNames.push(result.user.name) // Use the name from database
          } else {
            // User not found, use provided name but no UID (external author)
            console.warn(`User not found for email: ${author.email}`)
            authorNames.push(author.name)
            // We'll add external authors without UIDs for now
          }
        }
      }

      // Only add UIDs for users who exist in the system
      const validAuthorUids = authorUids.filter((uid) => uid)

      if (validAuthorUids.length === 0) {
        throw new Error("At least one author must be a registered user.")
      }

      const result = await addPublication({
        title: publicationForm.title.trim(),
        authorUids: validAuthorUids,
        authorNames: authorNames.map((name) => name.trim()),
        addedByUid: user.uid,
      })

      if (!result.success) {
        throw new Error(result.error || "Failed to add publication.")
      }

      // Reset form and close dialog
      setPublicationForm({
        title: "",
        currentUserRole: "first-author",
        authors: [{ name: user.name, email: user.email, isCurrentUser: true }],
      })
      setShowAddPublication(false)

      // Refresh publications
      const q = query(collection(db, "publications"), where("authorUids", "array-contains", user.uid))
      const snapshot = await getDocs(q)
      const userPublications = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Publication)
      userPublications.sort((a, b) => {
        const dateA =
          a.createdAt && typeof a.createdAt.toDate === "function" ? a.createdAt.toDate() : new Date(a.createdAt || 0)
        const dateB =
          b.createdAt && typeof b.createdAt.toDate === "function" ? b.createdAt.toDate() : new Date(b.createdAt || 0)
        return dateB.getTime() - dateA.getTime()
      })
      setPublications(userPublications)
    } catch (error: any) {
      setSubmitError(error.message)
    } finally {
      setIsSubmitting(false)
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
            {user.researchDomain && (
              <CardDescription className="px-6 pt-2 font-medium text-primary">{user.researchDomain}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <Separator />
            <ProfileDetail icon={Mail} label="Email">
              {user.email}
            </ProfileDetail>
            {user.phoneNumber && (
              <ProfileDetail icon={Phone} label="Phone">
                {user.phoneNumber}
              </ProfileDetail>
            )}
            <ProfileDetail icon={Building} label="Institute">
              {user.institute}
            </ProfileDetail>
            <ProfileDetail icon={GraduationCap} label="Department">
              {user.department}
            </ProfileDetail>
            <ProfileDetail icon={Award} label="Faculty">
              {user.faculty}
            </ProfileDetail>

            <Separator />
            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-muted-foreground">Academic IDs</h4>
              {user.orcidId && (
                <ProfileDetail icon={ExternalLink} label="ORCID iD">
                  <a
                    href={`https://orcid.org/${user.orcidId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {user.orcidId}
                  </a>
                </ProfileDetail>
              )}
              {user.scopusId && (
                <ProfileDetail icon={ExternalLink} label="Scopus ID">
                  {user.scopusId}
                </ProfileDetail>
              )}
              {user.googleScholarId && (
                <ProfileDetail icon={ExternalLink} label="Google Scholar ID">
                  {user.googleScholarId}
                </ProfileDetail>
              )}
              {user.vidwanId && (
                <ProfileDetail icon={ExternalLink} label="Vidwan ID">
                  {user.vidwanId}
                </ProfileDetail>
              )}
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
              <CardHeader>
                <CardTitle>IMR Projects</CardTitle>
              </CardHeader>
              <CardContent>
                {projects.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No IMR projects found.</p>
                ) : (
                  <div className="space-y-4">
                    {projects.map((project) => (
                      <div key={project.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-semibold text-sm line-clamp-2">{project.title}</h4>
                          <Badge className={getStatusColor(project.status)} variant="secondary">
                            {project.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{project.abstract}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(project.submissionDate)}
                          </div>
                          <div className="flex items-center gap-1">
                            <Building className="h-3 w-3" />
                            {project.faculty}
                          </div>
                          {project.grant && (
                            <div className="flex items-center gap-1">
                              <Award className="h-3 w-3" />₹{project.grant.totalAmount.toLocaleString()}
                            </div>
                          )}
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
              <CardHeader>
                <CardTitle>EMR Applications</CardTitle>
              </CardHeader>
              <CardContent>
                {emrInterests.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No EMR applications found.</p>
                ) : (
                  <div className="space-y-4">
                    {emrInterests.map((interest) => {
                      const fundingCall = fundingCalls.find((call) => call.id === interest.callId)
                      return (
                        <div key={interest.id} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="font-semibold text-sm line-clamp-2">
                              {fundingCall?.title || "EMR Application"}
                            </h4>
                            <Badge className={getEmrStatusColor(interest.status)} variant="secondary">
                              {interest.status}
                            </Badge>
                          </div>
                          {fundingCall && (
                            <p className="text-xs text-muted-foreground mb-2">Agency: {fundingCall.agency}</p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(interest.registeredAt)}
                            </div>
                            <div className="flex items-center gap-1">
                              <Building className="h-3 w-3" />
                              {interest.faculty}
                            </div>
                            {interest.coPiNames && interest.coPiNames.length > 0 && (
                              <div className="flex items-center gap-1">
                                <Users className="h-3 w-3" />+{interest.coPiNames.length} Co-PI
                                {interest.coPiNames.length > 1 ? "s" : ""}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="publications" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Paper Publications</CardTitle>
                    <CardDescription>
                      {publications.length} publication{publications.length !== 1 ? "s" : ""} found
                    </CardDescription>
                  </div>
                  <Dialog open={showAddPublication} onOpenChange={setShowAddPublication}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Publication
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Add New Publication</DialogTitle>
                        <DialogDescription>
                          Add a new publication and specify all co-authors. The publication will be linked to all
                          registered co-authors' profiles.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-6">
                        {/* Publication Title */}
                        <div className="space-y-2">
                          <Label htmlFor="title">Publication Title *</Label>
                          <Textarea
                            id="title"
                            placeholder="Enter the full title of your publication..."
                            value={publicationForm.title}
                            onChange={(e) => setPublicationForm((prev) => ({ ...prev, title: e.target.value }))}
                            rows={3}
                          />
                        </div>

                        {/* Current User Role */}
                        <div className="space-y-2">
                          <Label htmlFor="role">Your Role *</Label>
                          <Select
                            value={publicationForm.currentUserRole}
                            onValueChange={(value) =>
                              setPublicationForm((prev) => ({ ...prev, currentUserRole: value }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="first-author">First Author</SelectItem>
                              <SelectItem value="co-author">Co-Author</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {publicationForm.currentUserRole === "first-author"
                              ? "You will be listed as the first author of this publication."
                              : "You will be listed as a co-author. Please ensure the first author is added below."}
                          </p>
                        </div>

                        {/* Authors */}
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <Label>Authors *</Label>
                            <Button type="button" variant="outline" size="sm" onClick={addAuthor}>
                              <Plus className="h-4 w-4 mr-2" />
                              Add Author
                            </Button>
                          </div>

                          <div className="space-y-3">
                            {publicationForm.authors.map((author, index) => (
                              <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                                <div className="flex-1 grid grid-cols-2 gap-3">
                                  <div>
                                    <Label htmlFor={`author-name-${index}`} className="text-xs">
                                      Name {author.isCurrentUser && "(You)"}
                                    </Label>
                                    <Input
                                      id={`author-name-${index}`}
                                      placeholder="Author name"
                                      value={author.name}
                                      onChange={(e) => updateAuthor(index, "name", e.target.value)}
                                      disabled={author.isCurrentUser}
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor={`author-email-${index}`} className="text-xs">
                                      Email
                                    </Label>
                                    <Input
                                      id={`author-email-${index}`}
                                      type="email"
                                      placeholder="author@example.com"
                                      value={author.email}
                                      onChange={(e) => updateAuthor(index, "email", e.target.value)}
                                      disabled={author.isCurrentUser}
                                    />
                                  </div>
                                </div>
                                {!author.isCurrentUser && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeAuthor(index)}
                                    className="mt-6"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>

                          <p className="text-xs text-muted-foreground">
                            Publications will be automatically linked to co-authors who have accounts in the system.
                            External authors will be listed by name only.
                          </p>
                        </div>

                        {submitError && (
                          <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{submitError}</AlertDescription>
                          </Alert>
                        )}
                      </div>

                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowAddPublication(false)}
                          disabled={isSubmitting}
                        >
                          Cancel
                        </Button>
                        <Button type="button" onClick={handleSubmitPublication} disabled={isSubmitting}>
                          {isSubmitting ? "Adding..." : "Add Publication"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {loadingPublications ? (
                  <Skeleton className="h-40 w-full" />
                ) : publications.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No publications added yet.</p>
                ) : (
                  <div className="space-y-4">
                    {publications.map((publication) => (
                      <div key={publication.id} className="border rounded-lg p-4">
                        <h4 className="font-semibold text-sm mb-2">{publication.title}</h4>
                        <p className="text-xs text-muted-foreground mb-2">
                          Authors: {publication.authorNames.join(", ")}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(publication.createdAt)}
                          </div>
                          {publication.authorNames.length > 1 && (
                            <div className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {publication.authorNames.length} Author{publication.authorNames.length > 1 ? "s" : ""}
                            </div>
                          )}
                        </div>
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

export * from "@/src/components/profile/profile-client"
