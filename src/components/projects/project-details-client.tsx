
"use client"

import type React from "react"

import { useState, useEffect, useCallback, useMemo } from "react"
import * as z from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { format, startOfToday, isToday, parseISO } from "date-fns"
import { useRouter } from "next/navigation"
import Link from "next/link"

import type { Project, User, GrantDetails, Evaluation, GrantPhase } from "@/types"
import { db } from "@/lib/config"
import { doc, updateDoc, addDoc, collection, getDoc, getDocs, where, query } from "firebase/firestore"
import {
  uploadFileToServer,
  updateProjectStatus,
  updateProjectWithRevision,
  updateProjectDuration,
  updateProjectEvaluators,
  notifyAdminsOnCompletionRequest,
  findUserByMisId,
  updateCoInvestigators,
  sendEmail,
} from "@/app/actions"
import { generatePresentationNoting } from "@/app/document-actions"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useIsMobile } from "@/hooks/use-mobile"

import {
  Check,
  ChevronDown,
  Clock,
  X,
  DollarSign,
  FileCheck2,
  CalendarIcon,
  Edit,
  UserCog,
  Banknote,
  AlertCircle,
  Users,
  Loader2,
  Printer,
  Download,
} from "lucide-react"

import { GrantManagement } from "./grant-management"
import { EvaluationForm } from "./evaluation-form"
import { EvaluationsSummary } from "./evaluations-summary"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { Textarea } from "../ui/textarea"

interface ProjectDetailsClientProps {
  project: Project
  allUsers: User[]
  piUser: User | null
}

const statusVariant: { [key: string]: "default" | "secondary" | "destructive" | "outline" } = {
  Submitted: "secondary",
  Recommended: "default",
  "In Progress": "default",
  "Under Review": "secondary",
  "Revision Needed": "secondary",
  "Pending Completion Approval": "secondary",
  "Not Recommended": "destructive",
  Completed: "outline",
}

const scheduleSchema = z.object({
  date: z.date({ required_error: "A meeting date is required." }),
  time: z.string().min(1, "Meeting time is required."),
  venue: z.string().min(1, "Meeting venue is required."),
})
type ScheduleFormData = z.infer<typeof scheduleSchema>

const durationSchema = z
  .object({
    startDate: z.date({ required_error: "A start date is required." }),
    endDate: z.date({ required_error: "An end date is required." }),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "End date must be after start date.",
    path: ["endDate"],
  })
type DurationFormData = z.infer<typeof durationSchema>

const evaluatorSchema = z.object({
  evaluatorUids: z.array(z.string()).min(1, "Please select at least one evaluator."),
})
type EvaluatorFormData = z.infer<typeof evaluatorSchema>

const revisionCommentSchema = z.object({
  comments: z.string().min(10, "Please provide detailed comments for the revision."),
})
type RevisionCommentFormData = z.infer<typeof revisionCommentSchema>

const venues = ["RDC Committee Room, PIMSR"]

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (error) => reject(error)
    reader.readAsDataURL(file)
  })
}

export function ProjectDetailsClient({ project: initialProject, allUsers, piUser }: ProjectDetailsClientProps) {
  const [project, setProject] = useState(initialProject)
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [coPiUsers, setCoPiUsers] = useState<User[]>([])
  const [isUpdating, setIsUpdating] = useState(false)
  const { toast } = useToast()
  const router = useRouter()
  const [sanctionNumber, setSanctionNumber] = useState("")
  const [phaseName, setPhaseName] = useState("Phase 1")
  const [phaseAmount, setPhaseAmount] = useState<number | "">("")
  const [isAwarding, setIsAwarding] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isCompletionDialogOpen, setIsCompletionDialogOpen] = useState(false)
  const [completionReportFile, setCompletionReportFile] = useState<File | null>(null)
  const [utilizationCertificateFile, setUtilizationCertificateFile] = useState<File | null>(null)
  const [isSubmittingCompletion, setIsSubmittingCompletion] = useState(false)
  const [showApprovalAlert, setShowApprovalAlert] = useState(false)
  const [isRevisionDialogOpen, setIsRevisionDialogOpen] = useState(false)
  const [revisedProposalFile, setRevisedProposalFile] = useState<File | null>(null)
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false)
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false)
  const [isDurationDialogOpen, setIsDurationDialogOpen] = useState(false)
  const [isEvaluatorDialogOpen, setIsEvaluatorDialogOpen] = useState(false)
  const [isRevisionCommentDialogOpen, setIsRevisionCommentDialogOpen] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const isMobile = useIsMobile();

  // Co-PI management state
  const [coPiSearchTerm, setCoPiSearchTerm] = useState("")
  const [foundCoPi, setFoundCoPi] = useState<{ uid: string; name: string } | null>(null)
  const [coPiList, setCoPiList] = useState<{ uid: string; name: string }[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSavingCoPis, setIsSavingCoPis] = useState(false)

  const scheduleForm = useForm<ScheduleFormData>({
    resolver: zodResolver(scheduleSchema),
  })

  const durationForm = useForm<DurationFormData>({
    resolver: zodResolver(durationSchema),
  })

  const evaluatorForm = useForm<EvaluatorFormData>({
    resolver: zodResolver(evaluatorSchema),
  })

  const revisionCommentForm = useForm<RevisionCommentFormData>({
    resolver: zodResolver(revisionCommentSchema),
    defaultValues: { comments: "" },
  })

  const refetchEvaluations = useCallback(async () => {
    try {
      const evaluationsCol = collection(db, "projects", initialProject.id, "evaluations")
      const evaluationsSnapshot = await getDocs(evaluationsCol)
      const evaluationsList = evaluationsSnapshot.docs.map((evaluationDoc) => evaluationDoc.data() as Evaluation)
      setEvaluations(evaluationsList)
    } catch (error) {
      console.error("Error refetching evaluations:", error)
      toast({ variant: "destructive", title: "Error", description: "Could not refresh evaluation data." })
    }
  }, [initialProject.id, toast])

  useEffect(() => {
    setProject(initialProject)
  }, [initialProject])

  const canFetchEvaluations = useMemo(() => {
    if (!user) return false
    const isAdmin = ["Super-admin", "admin", "CRO"].includes(user.role)
    const isAssignedEvaluator = initialProject.meetingDetails?.assignedEvaluators?.includes(user.uid)
    return isAdmin || isAssignedEvaluator
  }, [user, initialProject])

  useEffect(() => {
    if (canFetchEvaluations) {
      refetchEvaluations()
    }
  }, [canFetchEvaluations, refetchEvaluations])

  useEffect(() => {
    const storedUser = localStorage.getItem("user")
    if (storedUser) {
      setUser(JSON.parse(storedUser))
    }
  }, [])

  useEffect(() => {
    const fetchCoPiUsers = async () => {
      if (project.coPiUids && project.coPiUids.length > 0) {
        const usersRef = collection(db, "users")
        const q = query(usersRef, where("__name__", "in", project.coPiUids))
        const querySnapshot = await getDocs(q)
        const fetchedUsers = querySnapshot.docs.map((coPiDoc) => ({ uid: coPiDoc.id, ...coPiDoc.data() }) as User)
        setCoPiUsers(fetchedUsers)
        setCoPiList(fetchedUsers.map((u) => ({ uid: u.uid, name: u.name })))
      }
    }
    fetchCoPiUsers()
  }, [project.coPiUids])

  useEffect(() => {
    if (project.meetingDetails) {
      scheduleForm.reset({
        date: project.meetingDetails.date ? parseISO(project.meetingDetails.date) : undefined,
        time: project.meetingDetails.time,
        venue: project.meetingDetails.venue,
      })
    }
    durationForm.reset({
      startDate: project.projectStartDate ? new Date(project.projectStartDate) : undefined,
      endDate: project.projectEndDate ? new Date(project.projectEndDate) : undefined,
    })
    evaluatorForm.reset({
      evaluatorUids: project.meetingDetails?.assignedEvaluators || [],
    })
  }, [project, scheduleForm, durationForm, evaluatorForm])

  const isPI = user?.uid === project.pi_uid || user?.email === project.pi_email
  const isAdmin = user && ["Super-admin", "admin", "CRO"].includes(user.role)
  const isSuperAdmin = user?.role === "Super-admin"
  const isAssignedEvaluator = user && project.meetingDetails?.assignedEvaluators?.includes(user.uid)
  const canViewDocuments = isPI || isAdmin || isAssignedEvaluator

  const isMeetingToday = project.meetingDetails?.date ? isToday(parseISO(project.meetingDetails.date)) : false
  const showEvaluationForm = user && project.status === "Under Review" && isAssignedEvaluator && isMeetingToday

  const allEvaluationsIn =
    (project.meetingDetails?.assignedEvaluators?.length ?? 0) > 0 &&
    evaluations.length >= (project.meetingDetails?.assignedEvaluators?.length ?? 0)

  const canManageGrants =
    user &&
    (user.role === "Super-admin" ||
      user.role === "admin" ||
      user.uid === project.pi_uid ||
      user.email === project.pi_email)

  const canRequestClosure = useMemo(() => {
    if (!isPI) return false
    const normalizedStatus = project.status.toLowerCase()
    const allowedStatuses = ["recommended", "in progress", "completed", "sanctioned", "pending completion approval"]
    return allowedStatuses.includes(normalizedStatus) && normalizedStatus !== "pending completion approval"
  }, [isPI, project.status])

  const assignedEvaluatorNames = useMemo(() => {
    if (!project.meetingDetails?.assignedEvaluators || !allUsers.length) {
      return []
    }
    return project.meetingDetails.assignedEvaluators.map((uid) => {
      const evaluator = allUsers.find((u) => u.uid === uid)
      return evaluator ? evaluator.name : "Unknown Evaluator"
    })
  }, [project.meetingDetails, allUsers])

  const handleStatusUpdate = async (newStatus: Project["status"], comments?: string) => {
    setIsUpdating(true)
    const result = await updateProjectStatus(project.id, newStatus, comments)
    setIsUpdating(false)

    if (result.success) {
      setProject({ ...project, status: newStatus })
      toast({ title: "Success", description: `Project status updated to ${newStatus}` })
      router.refresh()
      if (newStatus === "Revision Needed") {
        setIsRevisionCommentDialogOpen(false)
        revisionCommentForm.reset()
      }
    } else {
      toast({ variant: "destructive", title: "Error", description: result.error || "Failed to update project status." })
    }
  }

  const handleSearchCoPi = async () => {
    if (!coPiSearchTerm) return
    setIsSearching(true)
    setFoundCoPi(null)
    try {
      const result = await findUserByMisId(coPiSearchTerm)
      if (result.success && result.user) {
        setFoundCoPi(result.user)
      } else {
        toast({ variant: "destructive", title: "User Not Found", description: result.error })
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Search Failed", description: "An error occurred while searching." })
    } finally {
      setIsSearching(false)
    }
  }

  const handleAddCoPi = () => {
    if (foundCoPi && !coPiList.some((coPi) => coPi.uid === foundCoPi.uid)) {
      if (user && foundCoPi.uid === user.uid) {
        toast({ variant: "destructive", title: "Cannot Add Self", description: "You cannot add yourself as a Co-PI." })
        return
      }
      setCoPiList([...coPiList, foundCoPi])
    }
    setFoundCoPi(null)
    setCoPiSearchTerm("")
  }

  const handleRemoveCoPi = (uidToRemove: string) => {
    setCoPiList(coPiList.filter((coPi) => coPi.uid !== uidToRemove))
  }

  const handleSaveCoPis = async () => {
    setIsSavingCoPis(true)
    const coPiUids = coPiList.map((coPi) => coPi.uid)
    const result = await updateCoInvestigators(project.id, coPiUids)
    if (result.success) {
      toast({ title: "Success", description: "Co-PI list has been updated." })
      setProject((prev) => ({ ...prev, coPiUids }))
    } else {
      toast({ variant: "destructive", title: "Error", description: result.error })
    }
    setIsSavingCoPis(false)
  }

  const handleScheduleUpdate = async (data: ScheduleFormData) => {
    setIsUpdating(true)
    try {
      const projectRef = doc(db, "projects", project.id)
      const newMeetingDetails = {
        date: format(data.date, "yyyy-MM-dd"),
        time: data.time,
        venue: data.venue,
      }

      await updateDoc(projectRef, {
        "meetingDetails.date": newMeetingDetails.date,
        "meetingDetails.time": newMeetingDetails.time,
        "meetingDetails.venue": newMeetingDetails.venue,
      })

      await addDoc(collection(db, "notifications"), {
        uid: project.pi_uid,
        title: `MEETING RESCHEDULED for your project: "${project.title}"`,
        projectId: project.id,
        createdAt: new Date().toISOString(),
        isRead: false,
      })

      setProject({
        ...project,
        meetingDetails: { ...project.meetingDetails, ...newMeetingDetails } as Project["meetingDetails"],
      })
      toast({ title: "Success", description: `Meeting schedule has been updated.` })
      setIsScheduleDialogOpen(false)
    } catch (error) {
      console.error("Error updating schedule:", error)
      toast({ variant: "destructive", title: "Error", description: "Failed to update meeting schedule." })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleAwardGrant = async () => {
    if (!phaseAmount || phaseAmount <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Amount",
        description: "Please enter a valid amount for the first phase.",
      })
      return
    }
    if (!sanctionNumber || sanctionNumber.trim() === "") {
      toast({
        variant: "destructive",
        title: "Sanction Number Required",
        description: "Please enter the sanction number.",
      })
      return
    }
    setIsAwarding(true)
    try {
      const projectRef = doc(db, "projects", project.id)

      const newPhase: GrantPhase = {
        id: new Date().toISOString(),
        name: phaseName.trim(),
        amount: phaseAmount,
        status: "Pending Disbursement",
        transactions: [],
      }

      const newGrant: GrantDetails = {
        totalAmount: phaseAmount,
        sanctionNumber: sanctionNumber.trim(),
        status: "Awarded",
        phases: [newPhase],
        bankDetails: piUser?.bankDetails,
      }

      await updateDoc(projectRef, { grant: newGrant })

      // In-app notification
      await addDoc(collection(db, "notifications"), {
        uid: project.pi_uid,
        title: `Congratulations! Your project "${project.title}" has been awarded a grant.`,
        projectId: project.id,
        createdAt: new Date().toISOString(),
        isRead: false,
      })
      
      // Email notification
      if (project.pi_email) {
          const emailHtml = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2>Congratulations, ${project.pi}!</h2>
                <p>We are pleased to inform you that your Intramural Research (IMR) project, <strong>"${project.title}"</strong>, has been recommended and a grant has been awarded.</p>
                <h3>Grant Details:</h3>
                <ul>
                    <li><strong>Sanction Number:</strong> ${newGrant.sanctionNumber}</li>
                    <li><strong>Total Amount:</strong> ₹${newGrant.totalAmount.toLocaleString('en-IN')}</li>
                    <li><strong>Initial Phase:</strong> ${newPhase.name} (₹${newPhase.amount.toLocaleString('en-IN')})</li>
                </ul>
                <p>The first phase amount will be disbursed to your registered bank account shortly. You can now log your project expenses through the grant management section on the portal.</p>
                <p>Thank you for your valuable contribution to research at Parul University.</p>
                <br/>
                <p>Best Regards,</p>
                <p><strong>The R&D Cell Team</strong></p>
            </div>
          `;
          await sendEmail({
              to: project.pi_email,
              subject: `Grant Awarded for Your IMR Project: ${project.title}`,
              html: emailHtml,
              from: 'default'
          });
      }


      setProject({ ...project, grant: newGrant })
      toast({
        title: "Grant Awarded!",
        description: `Phase 1 of the grant for ₹${phaseAmount.toLocaleString("en-IN")} has been created.`,
      })
      setIsDialogOpen(false)
      setPhaseName("Phase 1")
      setPhaseAmount("")
      setSanctionNumber("")
    } catch (error) {
      console.error("Error awarding grant:", error)
      toast({ variant: "destructive", title: "Error", description: "Failed to award grant." })
    } finally {
      setIsAwarding(false)
    }
  }

  const handleCompletionFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setCompletionReportFile(e.target.files[0])
    }
  }

  const handleCertificateFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setUtilizationCertificateFile(e.target.files[0])
    }
  }

  const handleCompletionSubmit = async () => {
    if (!completionReportFile || !utilizationCertificateFile) {
      toast({
        variant: "destructive",
        title: "Files Missing",
        description: "Please upload both the completion report and the utilization certificate.",
      })
      return
    }
    if (!user) {
      toast({ variant: "destructive", title: "Authentication Error", description: "Could not identify user." })
      return
    }
    setIsSubmittingCompletion(true)
    try {
      const projectRef = doc(db, "projects", project.id)

      const uploadFile = async (file: File, folder: string): Promise<string> => {
        try {
          const dataUrl = await fileToDataUrl(file)
          if (!dataUrl || typeof dataUrl !== "string") {
            throw new Error(`Failed to convert ${file.name} to data URL`)
          }

          const path = `reports/${project.id}/${folder}/${Date.now()}-${file.name}`
          const result = await uploadFileToServer(dataUrl, path)

          if (!result.success || !result.url) {
            throw new Error(result.error || `Failed to upload ${file.name}`)
          }
          return result.url
        } catch (error: any) {
          console.error(`Error uploading ${file.name}:`, error)
          throw new Error(`Upload failed for ${file.name}: ${error.message}`)
        }
      }

      const reportUrl = await uploadFile(completionReportFile, "completion-report")
      const certificateUrl = await uploadFile(utilizationCertificateFile, "utilization-certificate")

      const updateData = {
        status: "Pending Completion Approval" as Project["status"],
        completionReportUrl: reportUrl,
        utilizationCertificateUrl: certificateUrl,
        completionSubmissionDate: new Date().toISOString(),
      }

      await updateDoc(projectRef, updateData)
      setProject({ ...project, ...updateData })

      // Notify Super Admins
      await notifyAdminsOnCompletionRequest(project.id, project.title, user.name)

      toast({ title: "Documents Submitted", description: "Your completion documents have been submitted for review." })
      setIsCompletionDialogOpen(false)
      setCompletionReportFile(null)
      setUtilizationCertificateFile(null)
    } catch (error: any) {
      console.error("Error submitting completion documents:", error)
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: error.message || "Could not submit the completion documents. Please try again.",
      })
    } finally {
      setIsSubmittingCompletion(false)
    }
  }

  const handleRevisionSubmit = async () => {
    if (!revisedProposalFile) {
      toast({ variant: "destructive", title: "File Missing", description: "Please upload the revised proposal." })
      return
    }
    setIsSubmittingRevision(true)
    try {
      const dataUrl = await fileToDataUrl(revisedProposalFile)
      const path = `revisions/${project.id}/${revisedProposalFile.name}`
      const uploadResult = await uploadFileToServer(dataUrl, path)

      if (!uploadResult.success || !uploadResult.url) {
        throw new Error(uploadResult.error || "Revision upload failed")
      }

      const revisionResult = await updateProjectWithRevision(project.id, uploadResult.url)

      if (!revisionResult.success) {
        throw new Error(revisionResult.error || "Failed to update project with revision.")
      }

      toast({ title: "Revision Submitted", description: "Your revised proposal has been submitted for re-evaluation." })
      setIsRevisionDialogOpen(false)
      setRevisedProposalFile(null)
      const projectRef = doc(db, "projects", project.id)
      const projectSnap = await getDoc(projectRef)
      setProject({ id: projectSnap.id, ...projectSnap.data() } as Project)
    } catch (error: any) {
      console.error("Error submitting revision:", error)
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: error.message || "Could not submit your revision.",
      })
    } finally {
      setIsSubmittingRevision(false)
    }
  }

  const handleDurationSubmit = async (data: DurationFormData) => {
    setIsUpdating(true)
    const result = await updateProjectDuration(project.id, data.startDate.toISOString(), data.endDate.toISOString())
    if (result.success) {
      toast({ title: "Success", description: "Project duration has been updated." })
      setProject((prev) => ({
        ...prev,
        projectStartDate: data.startDate.toISOString(),
        projectEndDate: data.endDate.toISOString(),
      }))
      setIsDurationDialogOpen(false)
    } else {
      toast({ variant: "destructive", title: "Error", description: result.error })
    }
    setIsUpdating(false)
  }

  const handleEvaluatorSubmit = async (data: EvaluatorFormData) => {
    setIsUpdating(true)
    const result = await updateProjectEvaluators(project.id, data.evaluatorUids)
    if (result.success) {
      toast({ title: "Success", description: "Assigned evaluators have been updated." })
      setProject((prev) => ({
        ...prev,
        meetingDetails: { ...prev.meetingDetails!, assignedEvaluators: data.evaluatorUids },
      }))
      setIsEvaluatorDialogOpen(false)
    } else {
      toast({ variant: "destructive", title: "Error", description: result.error })
    }
    setIsUpdating(false)
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A"
    try {
      return format(parseISO(dateString), "PPP") // PPP is like "Jan 1, 2024"
    } catch (e) {
      console.error("Date formatting error:", e)
      return "Invalid Date"
    }
  }

  const handleProjectUpdate = (updatedProject: Project) => {
    setProject(updatedProject)
  }

  const handleApprovalClick = (status: "Recommended" | "Not Recommended") => {
    if (!allEvaluationsIn) {
      setShowApprovalAlert(true)
      return
    }
    handleStatusUpdate(status)
  }

  const handleRevisionCommentSubmit = (data: RevisionCommentFormData) => {
    handleStatusUpdate("Revision Needed", data.comments)
  }

  const handlePrint = async () => {
    setIsPrinting(true)
    try {
      const result = await generatePresentationNoting(project.id)
      if (result.success && result.fileData) {
        const byteCharacters = atob(result.fileData)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const blob = new Blob([byteArray], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        })

        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${project.pi.replace(/\s/g, "_")}_APPLICATION_IMR.docx`
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
        toast({ title: "Download Started", description: "Office Notings form is being downloaded." })
      } else {
        throw new Error(result.error || "Failed to generate form.")
      }
    } catch (error: any) {
      console.error("Print error:", error)
      toast({ variant: "destructive", title: "Download Failed", description: error.message })
    } finally {
      setIsPrinting(false)
    }
  }

  const availableStatuses: Project["status"][] = [
    "Submitted",
    "Under Review",
    "In Progress",
    "Completed",
    "Pending Completion Approval",
  ]

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>{/* Spacer */}</div>
        {isAdmin && project.status === "Under Review" && (
          <Button onClick={handlePrint} disabled={isPrinting}>
            {isPrinting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download Office Notings
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-2xl">{project.title}</CardTitle>
              <CardDescription>Submitted on {formatDate(project.submissionDate)}</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <Badge variant={statusVariant[project.status] || "secondary"} className="text-sm px-3 py-1">
                {project.status === "Under Review" && <Clock className="mr-2 h-4 w-4" />}
                {project.status === "Revision Needed" && <Edit className="mr-2 h-4 w-4" />}
                {project.status === "Pending Completion Approval" && <Clock className="mr-2 h-4 w-4" />}
                {(project.status === "Recommended" || project.status === "Completed") && (
                  <Check className="mr-2 h-4 w-4" />
                )}
                {project.status === "Not Recommended" && <X className="mr-2 h-4 w-4" />}
                {project.status}
              </Badge>
              {isAdmin && (
                <>
                  {project.status === "Under Review" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" disabled={isUpdating}>
                          Update Status <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleApprovalClick("Recommended")}>
                          <Check className="mr-2 h-4 w-4" /> Recommend
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleApprovalClick("Not Recommended")}>
                          <X className="mr-2 h-4 w-4 text-destructive" />{" "}
                          <span className="text-destructive">Not Recommend</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setIsRevisionCommentDialogOpen(true)}>
                          <Edit className="mr-2 h-4 w-4" /> Request Revision
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {project.status === "Pending Completion Approval" && (
                    <Button onClick={() => handleStatusUpdate("Completed")} disabled={isUpdating}>
                      <FileCheck2 className="mr-2 h-4 w-4" /> Approve Completion
                    </Button>
                  )}
                </>
              )}
              {isPI && project.status === "Revision Needed" && (
                <Dialog open={isRevisionDialogOpen} onOpenChange={setIsRevisionDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <FileCheck2 className="mr-2 h-4 w-4" /> Submit Revision
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Submit Revised Proposal</DialogTitle>
                      <DialogDescription>
                        Upload your revised proposal based on the feedback from the IMR evaluation meeting.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="revised-proposal" className="text-right">
                          Proposal (PDF)
                        </Label>
                        <Input
                          id="revised-proposal"
                          type="file"
                          accept=".pdf"
                          onChange={(e) => setRevisedProposalFile(e.target.files ? e.target.files[0] : null)}
                          className="col-span-3"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        onClick={handleRevisionSubmit}
                        disabled={isSubmittingRevision || !revisedProposalFile}
                      >
                        {isSubmittingRevision ? "Submitting..." : "Submit Revised Proposal"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              {isSuperAdmin && project.status === "Recommended" && (
                <Dialog open={isDurationDialogOpen} onOpenChange={setIsDurationDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {project.projectStartDate ? "Update Duration" : "Set Duration"}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Set Project Duration</DialogTitle>
                      <DialogDescription>Define the start and end dates for this project.</DialogDescription>
                    </DialogHeader>
                    <Form {...durationForm}>
                      <form
                        id="duration-form"
                        onSubmit={durationForm.handleSubmit(handleDurationSubmit)}
                        className="space-y-4 py-4"
                      >
                        <FormField
                          name="startDate"
                          control={durationForm.control}
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>Start Date</FormLabel>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant={"outline"}
                                      className={cn(
                                        "w-full pl-3 text-left font-normal",
                                        !field.value && "text-muted-foreground",
                                      )}
                                    >
                                      {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={field.value}
                                    onSelect={field.onChange}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          name="endDate"
                          control={durationForm.control}
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>End Date</FormLabel>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant={"outline"}
                                      className={cn(
                                        "w-full pl-3 text-left font-normal",
                                        !field.value && "text-muted-foreground",
                                      )}
                                    >
                                      {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={field.value}
                                    onSelect={field.onChange}
                                    disabled={(date) => date < (durationForm.getValues("startDate") || new Date())}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </form>
                    </Form>
                    <DialogFooter>
                      <Button type="submit" form="duration-form" disabled={isUpdating}>
                        {isUpdating ? "Saving..." : "Save Duration"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              {isAdmin && project.status === "Recommended" && !project.grant && (
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <DollarSign className="mr-2 h-4 w-4" /> Award Grant
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Award New Grant</DialogTitle>
                      <DialogDescription>
                        Set the sanction number and details for the first phase of the grant for "{project.title}".
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="sanction-number" className="text-right">
                          Sanction No.
                        </Label>
                        <Input
                          id="sanction-number"
                          value={sanctionNumber}
                          onChange={(e) => setSanctionNumber(e.target.value)}
                          className="col-span-3"
                          placeholder="e.g., RDC/IMSL/122"
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="phase-name" className="text-right">
                          Phase Name
                        </Label>
                        <Input
                          id="phase-name"
                          value={phaseName}
                          onChange={(e) => setPhaseName(e.target.value)}
                          className="col-span-3"
                          placeholder="e.g., Phase 1 - Equipment"
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="phase-amount" className="text-right">
                          Amount (₹)
                        </Label>
                        <Input
                          id="phase-amount"
                          type="number"
                          value={phaseAmount}
                          onChange={(e) => setPhaseAmount(Number(e.target.value))}
                          className="col-span-3"
                          placeholder="e.g., 200000"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="glass" onClick={handleAwardGrant} disabled={isAwarding}>
                        {isAwarding ? "Awarding..." : "Confirm & Award"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              {canRequestClosure && (
                <Dialog open={isCompletionDialogOpen} onOpenChange={setIsCompletionDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <FileCheck2 className="mr-2 h-4 w-4" /> Request Project Closure
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Submit Completion Documents</DialogTitle>
                      <DialogDescription>
                        To request project closure, please upload the final 'Project outcome-cum-completion report' and
                        the 'Utilization Certificate'. You can download the templates below.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Button variant="secondary" asChild>
                                <a href="/templates/COMPLETION_REPORT_TEMPLATE.docx" download>
                                    <Download className="mr-2 h-4 w-4" />
                                    Completion Report Template
                                </a>
                            </Button>
                             <Button variant="secondary" asChild>
                                <a href="/templates/UTILIZATION_CERTIFICATE_TEMPLATE.docx" download>
                                    <Download className="mr-2 h-4 w-4" />
                                    Utilization Certificate Template
                                </a>
                            </Button>
                        </div>
                      <div className="flex flex-col sm:grid sm:grid-cols-4 sm:items-center gap-4">
                        <Label htmlFor="completion-report" className="sm:text-right">
                          Completion Report (PDF)
                        </Label>
                        <Input
                          id="completion-report"
                          type="file"
                          accept=".pdf"
                          onChange={handleCompletionFileChange}
                          className="col-span-3"
                        />
                      </div>
                      <div className="flex flex-col sm:grid sm:grid-cols-4 sm:items-center gap-4">
                        <Label htmlFor="utilization-certificate" className="sm:text-right">
                          Utilization Certificate (PDF)
                        </Label>
                        <Input
                          id="utilization-certificate"
                          type="file"
                          accept=".pdf"
                          onChange={handleCertificateFileChange}
                          className="col-span-3"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        onClick={handleCompletionSubmit}
                        disabled={isSubmittingCompletion || !completionReportFile || !utilizationCertificateFile}
                      >
                        {isSubmittingCompletion ? "Submitting..." : "Submit for Review"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {project.meetingDetails && (
            <>
              <div className="space-y-2 p-4 border rounded-lg bg-secondary/50">
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <h3 className="font-semibold text-lg">IMR Evaluation Meeting Details</h3>
                  <div className="flex items-center gap-2">
                    {isSuperAdmin && (
                      <Dialog open={isEvaluatorDialogOpen} onOpenChange={setIsEvaluatorDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <UserCog className="mr-2 h-4 w-4" />
                            Update Evaluators
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Update Assigned Evaluators</DialogTitle>
                            <DialogDescription>Modify the evaluation committee for this project.</DialogDescription>
                          </DialogHeader>
                          <Form {...evaluatorForm}>
                            <form
                              id="evaluator-form"
                              onSubmit={evaluatorForm.handleSubmit(handleEvaluatorSubmit)}
                              className="space-y-4 py-4"
                            >
                              <FormField
                                control={evaluatorForm.control}
                                name="evaluatorUids"
                                render={({ field }) => (
                                  <FormItem className="flex flex-col">
                                    <FormLabel>Assigned Evaluators</FormLabel>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between bg-transparent">
                                          {field.value?.length > 0
                                            ? `${field.value.length} selected`
                                            : "Select evaluators"}
                                          <ChevronDown className="h-4 w-4 opacity-50" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
                                        {allUsers
                                          .filter((u) => ["faculty", "CRO", "admin", "Super-admin"].includes(u.role))
                                          .map((evaluator) => (
                                            <DropdownMenuCheckboxItem
                                              key={evaluator.uid}
                                              checked={field.value?.includes(evaluator.uid)}
                                              onCheckedChange={(checked) => {
                                                return checked
                                                  ? field.onChange([...(field.value || []), evaluator.uid])
                                                  : field.onChange(field.value?.filter((id) => id !== evaluator.uid))
                                              }}
                                            >
                                              {evaluator.name}
                                            </DropdownMenuCheckboxItem>
                                          ))}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </form>
                          </Form>
                          <DialogFooter>
                            <Button type="submit" form="evaluator-form" disabled={isUpdating}>
                              {isUpdating ? "Saving..." : "Save Evaluators"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                    {isAdmin && (
                      <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Edit className="mr-2 h-4 w-4" />
                            Edit Schedule
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Edit Meeting Schedule</DialogTitle>
                            <DialogDescription>Update the date, time, or venue for this meeting.</DialogDescription>
                          </DialogHeader>
                          <Form {...scheduleForm}>
                            <form
                              id="schedule-edit-form"
                              onSubmit={scheduleForm.handleSubmit(handleScheduleUpdate)}
                              className="space-y-4 py-4"
                            >
                              <FormField
                                control={scheduleForm.control}
                                name="date"
                                render={({ field }) => (
                                  <FormItem className="flex flex-col">
                                    <FormLabel>New Meeting Date</FormLabel>
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <FormControl>
                                          <Button
                                            variant={"outline"}
                                            className={cn(
                                              "w-full pl-3 text-left font-normal",
                                              !field.value && "text-muted-foreground",
                                            )}
                                          >
                                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                          </Button>
                                        </FormControl>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                          mode="single"
                                          selected={field.value}
                                          onSelect={field.onChange}
                                          disabled={(date) => date < startOfToday()}
                                          initialFocus
                                        />
                                      </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={scheduleForm.control}
                                name="time"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>New Meeting Time</FormLabel>
                                    <FormControl>
                                      <Input type="time" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={scheduleForm.control}
                                name="venue"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>New Venue</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                      <FormControl>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select a venue" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        {venues.map((venue) => (
                                          <SelectItem key={venue} value={venue}>
                                            {venue}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </form>
                          </Form>
                          <DialogFooter>
                            <Button type="submit" form="schedule-edit-form" disabled={isUpdating}>
                              {isUpdating ? "Saving..." : "Save Changes"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                  <p>
                    <strong>Date:</strong> {formatDate(project.meetingDetails.date)}
                  </p>
                  <p>
                    <strong>Time:</strong> {project.meetingDetails.time}
                  </p>
                  <p>
                    <strong>Venue:</strong> {project.meetingDetails.venue}
                  </p>
                </div>
                {isAdmin && assignedEvaluatorNames.length > 0 && (
                  <div className="pt-2">
                    <p className="font-semibold text-sm">Assigned Evaluators:</p>
                    <ul className="list-disc list-inside text-sm pl-4">
                      {assignedEvaluatorNames.map((name, index) => (
                        <li key={index}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <Separator />
            </>
          )}
          {project.status === "Revision Needed" && project.revisionComments && (
            <>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Revision Requested</AlertTitle>
                <AlertDescription>
                  <p className="font-semibold mt-2">Evaluator's Comments:</p>
                  <p className="whitespace-pre-wrap">{project.revisionComments}</p>
                </AlertDescription>
              </Alert>
              <Separator />
            </>
          )}
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Abstract</h3>
            <p className="text-muted-foreground">{project.abstract}</p>
          </div>
          <Separator />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Project Details</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="font-medium text-muted-foreground">Category</dt>
                <dd>{project.type}</dd>
                {project.projectStartDate && project.projectEndDate && (
                  <>
                    <dt className="font-medium text-muted-foreground">Project Duration</dt>
                    <dd>
                      {format(new Date(project.projectStartDate), "PPP")} -{" "}
                      {format(new Date(project.projectEndDate), "PPP")}
                    </dd>
                  </>
                )}
              </dl>
              {project.sdgGoals && project.sdgGoals.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2 pt-2">
                    <p className="font-medium text-muted-foreground">UN Sustainable Development Goals</p>
                    <div className="flex flex-wrap gap-1">
                      {project.sdgGoals.map((goal) => (
                        <Badge key={goal} variant="secondary">
                          {goal}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Submitter Information</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="font-medium text-muted-foreground">Principal Investigator</dt>
                <dd>
                    {piUser?.misId ? (
                        <Link href={`/profile/${piUser.misId}`} className="text-primary hover:underline" target="_blank">
                            {project.pi}
                        </Link>
                    ) : (
                        project.pi
                    )}
                </dd>
                <dt className="font-medium text-muted-foreground">Email</dt>
                <dd>{project.pi_email || "N/A"}</dd>
                <dt className="font-medium text-muted-foreground">Phone</dt>
                <dd>{project.pi_phoneNumber || "N/A"}</dd>
                <dt className="font-medium text-muted-foreground">Faculty</dt>
                <dd>{project.faculty}</dd>
                <dt className="font-medium text-muted-foreground">Institute</dt>
                <dd>{project.institute}</dd>
                <dt className="font-medium text-muted-foreground">Department</dt>
                <dd>{project.departmentName}</dd>
              </dl>
            </div>
          </div>
          <Separator />
          {(project.teamInfo || (coPiUsers && coPiUsers.length > 0) || isPI) && (
            <>
              <div className="space-y-4">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Team Information
                </h3>
                {isPI && (
                  <Card className="bg-muted/50">
                    <CardHeader>
                      <CardTitle className="text-base">Manage Co-Investigators</CardTitle>
                      <CardDescription>Add or remove Co-PIs for this project.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Search & Add Co-PI by MIS ID</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="Search by Co-PI's MIS ID"
                            value={coPiSearchTerm}
                            onChange={(e) => setCoPiSearchTerm(e.target.value)}
                          />
                          <Button type="button" onClick={handleSearchCoPi} disabled={isSearching}>
                            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                          </Button>
                        </div>
                        {foundCoPi && (
                          <div className="flex items-center justify-between p-2 border rounded-md">
                            <p>{foundCoPi.name}</p>
                            <Button type="button" size="sm" onClick={handleAddCoPi}>
                              Add
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Current Co-PI(s)</Label>
                        {coPiList.length > 0 ? (
                          coPiList.map((coPi) => (
                            <div key={coPi.uid} className="flex items-center justify-between p-2 bg-background rounded-md">
                              <p className="text-sm font-medium">{coPi.name}</p>
                              <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveCoPi(coPi.uid)}>
                                Remove
                              </Button>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">No Co-PIs added.</p>
                        )}
                      </div>
                      <Button onClick={handleSaveCoPis} disabled={isSavingCoPis}>
                        {isSavingCoPis && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Co-PI List
                      </Button>
                    </CardContent>
                  </Card>
                )}
                {project.teamInfo && (
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {project.teamInfo.split(";").find((part) => part.trim().startsWith("Students:"))}
                  </p>
                )}
              </div>
              <Separator />
            </>
          )}
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Timeline and Outcomes</h3>
            <p className="text-muted-foreground whitespace-pre-wrap">{project.timelineAndOutcomes}</p>
          </div>
          {canViewDocuments && (
            <>
              {(project.proposalUrl || project.cvUrl || project.ethicsUrl) && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg">Submitted Documents</h3>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {project.proposalUrl && (
                        <li>
                          <Button variant="link" asChild className="p-0 h-auto">
                            <a href={project.proposalUrl} target="_blank" rel="noopener noreferrer">
                              View Project Proposal
                            </a>
                          </Button>
                        </li>
                      )}
                      {project.cvUrl && (
                        <li>
                          <Button variant="link" asChild className="p-0 h-auto">
                            <a href={project.cvUrl} target="_blank" rel="noopener noreferrer">
                              View Team CVs
                            </a>
                          </Button>
                        </li>
                      )}
                      {project.ethicsUrl && (
                        <li>
                          <Button variant="link" asChild className="p-0 h-auto">
                            <a href={project.ethicsUrl} target="_blank" rel="noopener noreferrer">
                              View Ethics Approval
                            </a>
                          </Button>
                        </li>
                      )}
                    </ul>
                  </div>
                </>
              )}
              {project.revisedProposalUrl && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg">Revised Proposal</h3>
                    <p className="text-sm text-muted-foreground">
                      The following revised proposal was submitted on {formatDate(project.revisionSubmissionDate)}.
                    </p>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      <li>
                        <Button variant="link" asChild className="p-0 h-auto">
                          <a href={project.revisedProposalUrl} target="_blank" rel="noopener noreferrer">
                            View Revised Proposal
                          </a>
                        </Button>
                      </li>
                    </ul>
                  </div>
                </>
              )}
              {project.completionReportUrl && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg">Completion Documents</h3>
                    <p className="text-sm text-muted-foreground">
                      The following documents were submitted on {formatDate(project.completionSubmissionDate)}.
                    </p>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      <li>
                        <Button variant="link" asChild className="p-0 h-auto">
                          <a href={project.completionReportUrl} target="_blank" rel="noopener noreferrer">
                            Project outcome-cum-completion report
                          </a>
                        </Button>
                      </li>
                      {project.utilizationCertificateUrl && (
                        <li>
                          <Button variant="link" asChild className="p-0 h-auto">
                            <a href={project.utilizationCertificateUrl} target="_blank" rel="noopener noreferrer">
                              Utilization Certificate
                            </a>
                          </Button>
                        </li>
                      )}
                    </ul>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {isAdmin &&
        ["Recommended", "In Progress", "Completed", "Pending Completion Approval"].includes(project.status) && (
          <Card className="mt-8">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Banknote className="h-6 w-6" />
                <CardTitle>PI Bank Details (for Grant Disbursement)</CardTitle>
              </div>
              <CardDescription>
                These are the bank details provided by the Principal Investigator for grant payment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {piUser?.bankDetails ? (
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                  <div>
                    <dt className="font-medium text-muted-foreground">Beneficiary Name</dt>
                    <dd>{piUser.bankDetails.beneficiaryName}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted-foreground">Bank Name</dt>
                    <dd>{piUser.bankDetails.bankName}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted-foreground">Account Number</dt>
                    <dd>{piUser.bankDetails.accountNumber}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted-foreground">IFSC Code</dt>
                    <dd>{piUser.bankDetails.ifscCode}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted-foreground">Branch</dt>
                    <dd>{piUser.bankDetails.branchName}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted-foreground">City</dt>
                    <dd>{piUser.bankDetails.city}</dd>
                  </div>
                </dl>
              ) : (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Bank Details Missing</AlertTitle>
                  <AlertDescription>
                    The Principal Investigator has not provided their bank details in their profile settings. Please ask
                    them to update it to proceed with grant disbursement.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

      {isAdmin && evaluations.length > 0 && <EvaluationsSummary project={project} evaluations={evaluations} />}

      {showEvaluationForm && (
        <EvaluationForm project={project} user={user} onEvaluationSubmitted={refetchEvaluations} />
      )}

      {project.grant && user && canManageGrants && (
        <GrantManagement project={project} user={user} onUpdate={handleProjectUpdate} />
      )}

      <AlertDialog open={showApprovalAlert} onOpenChange={setShowApprovalAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Evaluation Incomplete</AlertDialogTitle>
            <AlertDialogDescription>
              This project cannot be Recommended or Not Recommended until all assigned evaluations have been submitted.
              There are currently {evaluations.length || 0} of {project.meetingDetails?.assignedEvaluators?.length || 0}{" "}
              required evaluations complete.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>OK</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isRevisionCommentDialogOpen} onOpenChange={setIsRevisionCommentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revision Comments</DialogTitle>
            <DialogDescription>
              Please provide comments for the PI to understand what needs to be revised. This will be included in the
              email notification.
            </DialogDescription>
          </DialogHeader>
          <Form {...revisionCommentForm}>
            <form
              id="revision-comment-form"
              onSubmit={revisionCommentForm.handleSubmit(handleRevisionCommentSubmit)}
              className="py-4"
            >
              <FormField
                control={revisionCommentForm.control}
                name="comments"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comments</FormLabel>
                    <FormControl>
                      <Textarea rows={5} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsRevisionCommentDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="revision-comment-form" disabled={isUpdating}>
              {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit and Request Revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
