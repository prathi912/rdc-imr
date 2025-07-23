"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import {
  ExternalLink,
  Mail,
  Phone,
  MapPin,
  Building,
  GraduationCap,
  Award,
  FileText,
  Calendar,
  Users,
} from "lucide-react"
import type { User, Project, EmrInterest, FundingCall } from "@/types"
import { format } from "date-fns"

interface ProfileClientProps {
  user: User
  projects: Project[]
  emrInterests: EmrInterest[]
  fundingCalls: FundingCall[]
}

export function ProfileClient({ user, projects, emrInterests, fundingCalls }: ProfileClientProps) {
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      {/* Profile Information */}
      <div className="md:col-span-1">
        <Card>
          <CardHeader className="text-center">
            <Avatar className="h-32 w-32 mx-auto mb-4">
              <AvatarImage src={user.photoURL || undefined} alt={user.name} />
              <AvatarFallback className="text-2xl">{user.name[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <CardTitle className="text-2xl">{user.name}</CardTitle>
            <p className="text-muted-foreground">{user.designation}</p>
            <Badge variant="secondary" className="mt-2">
              {user.role}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{user.email}</span>
            </div>
            {user.phoneNumber && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{user.phoneNumber}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Building className="h-4 w-4 text-muted-foreground" />
              <span>{user.institute}</span>
            </div>
            {user.campus && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{user.campus}</span>
              </div>
            )}
            {user.department && (
              <div className="flex items-center gap-2 text-sm">
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
                <span>{user.department}</span>
              </div>
            )}
            {user.faculty && (
              <div className="flex items-center gap-2 text-sm">
                <Award className="h-4 w-4 text-muted-foreground" />
                <span>{user.faculty}</span>
              </div>
            )}

            <Separator />

            {/* Academic IDs */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Academic IDs</h4>
              {user.misId && (
                <div className="text-sm">
                  <span className="font-medium">MIS ID:</span> {user.misId}
                </div>
              )}
              {user.orcidId && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">ORCID:</span>
                  <Button variant="link" size="sm" className="h-auto p-0" asChild>
                    <a href={`https://orcid.org/${user.orcidId}`} target="_blank" rel="noopener noreferrer">
                      {user.orcidId}
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </Button>
                </div>
              )}
              {user.scopusId && (
                <div className="text-sm">
                  <span className="font-medium">Scopus ID:</span> {user.scopusId}
                </div>
              )}
              {user.googleScholarId && (
                <div className="text-sm">
                  <span className="font-medium">Google Scholar:</span> {user.googleScholarId}
                </div>
              )}
              {user.vidwanId && (
                <div className="text-sm">
                  <span className="font-medium">Vidwan ID:</span> {user.vidwanId}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Projects and Activities */}
      <div className="md:col-span-2 space-y-8">
        {/* IMR Projects */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              IMR Projects ({projects.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No IMR projects found.</p>
            ) : (
              <div className="space-y-4">
                {projects.slice(0, 5).map((project) => (
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
                        {format(new Date(project.submissionDate), "MMM yyyy")}
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
                {projects.length > 5 && (
                  <p className="text-sm text-muted-foreground text-center">
                    And {projects.length - 5} more projects...
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* EMR Applications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              EMR Applications ({emrInterests.length})
            </CardTitle>
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
                          {format(new Date(interest.registeredAt), "MMM yyyy")}
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

        {/* Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>Research Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{projects.length}</div>
                <div className="text-xs text-muted-foreground">IMR Projects</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {projects.filter((p) => p.status === "Completed").length}
                </div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{emrInterests.length}</div>
                <div className="text-xs text-muted-foreground">EMR Applications</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  ₹{projects.reduce((total, p) => total + (p.grant?.totalAmount || 0), 0).toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">Total Funding</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
