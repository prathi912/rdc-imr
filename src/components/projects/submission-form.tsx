"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { X, Upload, FileText, AlertCircle } from "lucide-react"
import { useAuth } from "@/components/contexts/AuthContext"
import { findUserByMisId } from "@/app/actions"
import { toast } from "@/hooks/use-toast"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { Project } from "@/types"

// File size limit (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024

// Helper function to validate file size
const validateFileSize = (file: File): boolean => {
  return file.size <= MAX_FILE_SIZE
}

// Helper function to get file size error message
const getFileSizeError = (fileName: string): string => {
  return `File "${fileName}" exceeds the 5MB size limit. Please compress or reduce the file size and try again.`
}

const formSchema = z.object({
  title: z.string().min(10, "Title must be at least 10 characters"),
  abstract: z.string().min(100, "Abstract must be at least 100 characters"),
  type: z.string().min(1, "Please select a project type"),
  teamInfo: z.string().min(50, "Team information must be at least 50 characters"),
  timelineAndOutcomes: z.string().min(100, "Timeline and outcomes must be at least 100 characters"),
  proposalFile: z
    .instanceof(File)
    .optional()
    .refine(
      (file) => {
        if (!file) return true
        return validateFileSize(file)
      },
      (file) => ({ message: file ? getFileSizeError(file.name) : "Invalid file" }),
    ),
  cvFile: z
    .instanceof(File)
    .optional()
    .refine(
      (file) => {
        if (!file) return true
        return validateFileSize(file)
      },
      (file) => ({ message: file ? getFileSizeError(file.name) : "Invalid file" }),
    ),
  ethicsFile: z
    .instanceof(File)
    .optional()
    .refine(
      (file) => {
        if (!file) return true
        return validateFileSize(file)
      },
      (file) => ({ message: file ? getFileSizeError(file.name) : "Invalid file" }),
    ),
  sdgGoals: z.array(z.string()).optional(),
})

type FormData = z.infer<typeof formSchema>

interface SubmissionFormProps {
  project?: Project
  onSubmit: (data: FormData & { coPiUids: string[] }) => Promise<void>
  isLoading?: boolean
}

const PROJECT_TYPES = ["Research", "Unidisciplinary", "Multi-Disciplinary", "Inter-Disciplinary"]

const SDG_GOALS = [
  "No Poverty",
  "Zero Hunger",
  "Good Health and Well-being",
  "Quality Education",
  "Gender Equality",
  "Clean Water and Sanitation",
  "Affordable and Clean Energy",
  "Decent Work and Economic Growth",
  "Industry, Innovation and Infrastructure",
  "Reduced Inequality",
  "Sustainable Cities and Communities",
  "Responsible Consumption and Production",
  "Climate Action",
  "Life Below Water",
  "Life on Land",
  "Peace and Justice Strong Institutions",
  "Partnerships to achieve the Goal",
]

export function SubmissionForm({ project, onSubmit, isLoading = false }: SubmissionFormProps) {
  const { user } = useAuth()
  const [coPis, setCoPis] = useState<{ uid: string; name: string }[]>([])
  const [newCoPiMisId, setNewCoPiMisId] = useState("")
  const [isAddingCoPi, setIsAddingCoPi] = useState(false)

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: project?.title || "",
      abstract: project?.abstract || "",
      type: project?.type || "",
      teamInfo: project?.teamInfo || "",
      timelineAndOutcomes: project?.timelineAndOutcomes || "",
      sdgGoals: project?.sdgGoals || [],
    },
  })

  // Load existing Co-PIs if editing
  useEffect(() => {
    if (project?.coPiUids) {
      // In a real app, you'd fetch the Co-PI names from the database
      // For now, we'll just show the UIDs
      setCoPis(project.coPiUids.map((uid) => ({ uid, name: `Co-PI ${uid.slice(0, 8)}` })))
    }
  }, [project])

  const addCoPi = async () => {
    if (!newCoPiMisId.trim()) {
      toast({
        title: "Error",
        description: "Please enter a MIS ID",
        variant: "destructive",
      })
      return
    }

    setIsAddingCoPi(true)
    try {
      const result = await findUserByMisId(newCoPiMisId.trim())
      if (result.success && result.user) {
        // Check if already added
        if (coPis.some((coPi) => coPi.uid === result.user!.uid)) {
          toast({
            title: "Error",
            description: "This user is already added as a Co-PI",
            variant: "destructive",
          })
          return
        }

        // Check if trying to add themselves
        if (result.user.uid === user?.uid) {
          toast({
            title: "Error",
            description: "You cannot add yourself as a Co-PI",
            variant: "destructive",
          })
          return
        }

        setCoPis((prev) => [...prev, result.user!])
        setNewCoPiMisId("")
        toast({
          title: "Success",
          description: `${result.user.name} added as Co-PI`,
        })
      } else {
        toast({
          title: "Error",
          description: result.error || "User not found",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to search for user",
        variant: "destructive",
      })
    } finally {
      setIsAddingCoPi(false)
    }
  }

  const removeCoPi = (uid: string) => {
    setCoPis((prev) => prev.filter((coPi) => coPi.uid !== uid))
  }

  const handleSubmit = async (data: FormData) => {
    try {
      await onSubmit({
        ...data,
        coPiUids: coPis.map((coPi) => coPi.uid),
      })
    } catch (error) {
      console.error("Submission error:", error)
    }
  }

  const toggleSdgGoal = (goal: string) => {
    const currentGoals = form.getValues("sdgGoals") || []
    const updatedGoals = currentGoals.includes(goal) ? currentGoals.filter((g) => g !== goal) : [...currentGoals, goal]
    form.setValue("sdgGoals", updatedGoals)
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>{project ? "Edit Project" : "Submit New Project"}</CardTitle>
          <CardDescription>
            {project
              ? "Update your project details"
              : "Fill out the form below to submit your research project proposal"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Basic Information</h3>

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Title *</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your project title" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Type *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select project type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PROJECT_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="abstract"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Abstract *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Provide a detailed abstract of your project (minimum 100 characters)"
                          className="min-h-[120px]"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>{field.value?.length || 0}/100 minimum characters</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Co-Principal Investigators */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Co-Principal Investigators</h3>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter MIS ID of Co-PI"
                    value={newCoPiMisId}
                    onChange={(e) => setNewCoPiMisId(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addCoPi())}
                  />
                  <Button type="button" onClick={addCoPi} disabled={isAddingCoPi} variant="outline">
                    {isAddingCoPi ? "Adding..." : "Add Co-PI"}
                  </Button>
                </div>

                {coPis.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {coPis.map((coPi) => (
                      <Badge key={coPi.uid} variant="secondary" className="flex items-center gap-1">
                        {coPi.name}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => removeCoPi(coPi.uid)} />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Project Details */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Project Details</h3>

                <FormField
                  control={form.control}
                  name="teamInfo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Team Information *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe your research team, their roles, and qualifications (minimum 50 characters)"
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>{field.value?.length || 0}/50 minimum characters</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="timelineAndOutcomes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timeline and Expected Outcomes *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe your project timeline, milestones, and expected outcomes (minimum 100 characters)"
                          className="min-h-[120px]"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>{field.value?.length || 0}/100 minimum characters</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* SDG Goals */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Sustainable Development Goals (Optional)</h3>
                <p className="text-sm text-muted-foreground">Select the SDG goals that your project contributes to:</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {SDG_GOALS.map((goal) => (
                    <Badge
                      key={goal}
                      variant={form.watch("sdgGoals")?.includes(goal) ? "default" : "outline"}
                      className="cursor-pointer justify-center p-2 text-center"
                      onClick={() => toggleSdgGoal(goal)}
                    >
                      {goal}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* File Uploads */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">File Uploads</h3>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Maximum file size: 5MB per file. Supported formats: PDF, DOC, DOCX
                  </AlertDescription>
                </Alert>

                <FormField
                  control={form.control}
                  name="proposalFile"
                  render={({ field: { onChange, value, ...field } }) => (
                    <FormItem>
                      <FormLabel>Project Proposal</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input
                            type="file"
                            accept=".pdf,.doc,.docx"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file && !validateFileSize(file)) {
                                toast({
                                  title: "File Too Large",
                                  description: getFileSizeError(file.name),
                                  variant: "destructive",
                                })
                                e.target.value = ""
                                return
                              }
                              onChange(file)
                            }}
                            {...field}
                          />
                          <Upload className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </FormControl>
                      <FormDescription>Upload your detailed project proposal (PDF, DOC, or DOCX)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cvFile"
                  render={({ field: { onChange, value, ...field } }) => (
                    <FormItem>
                      <FormLabel>Principal Investigator CV</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input
                            type="file"
                            accept=".pdf,.doc,.docx"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file && !validateFileSize(file)) {
                                toast({
                                  title: "File Too Large",
                                  description: getFileSizeError(file.name),
                                  variant: "destructive",
                                })
                                e.target.value = ""
                                return
                              }
                              onChange(file)
                            }}
                            {...field}
                          />
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </FormControl>
                      <FormDescription>Upload your current CV (PDF, DOC, or DOCX)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="ethicsFile"
                  render={({ field: { onChange, value, ...field } }) => (
                    <FormItem>
                      <FormLabel>Ethics Clearance (if applicable)</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input
                            type="file"
                            accept=".pdf,.doc,.docx"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file && !validateFileSize(file)) {
                                toast({
                                  title: "File Too Large",
                                  description: getFileSizeError(file.name),
                                  variant: "destructive",
                                })
                                e.target.value = ""
                                return
                              }
                              onChange(file)
                            }}
                            {...field}
                          />
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Upload ethics clearance certificate if your research involves human subjects
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-4">
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Submitting..." : project ? "Update Project" : "Submit Project"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
