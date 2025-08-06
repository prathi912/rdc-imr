"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"

import { saveProjectSubmission, findUserByMisId, uploadFileToServer } from "@/app/actions"
import type { Project, User, CoPiDetails } from "@/types"
import { AlertCircle, Loader2, Plus, X, FileText, Upload } from 'lucide-react'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ACCEPTED_FILE_TYPES = ["application/pdf"]

const sdgGoals = [
  "Goal 1: No Poverty",
  "Goal 2: Zero Hunger", 
  "Goal 3: Good Health and Well-being",
  "Goal 4: Quality Education",
  "Goal 5: Gender Equality",
  "Goal 6: Clean Water and Sanitation",
  "Goal 7: Affordable and Clean Energy",
  "Goal 8: Decent Work and Economic Growth",
  "Goal 9: Industry, Innovation and Infrastructure",
  "Goal 10: Reduced Inequality",
  "Goal 11: Sustainable Cities and Communities",
  "Goal 12: Responsible Consumption and Production",
  "Goal 13: Climate Action",
  "Goal 14: Life Below Water",
  "Goal 15: Life on Land",
  "Goal 16: Peace and Justice Strong Institutions",
  "Goal 17: Partnerships to achieve the Goal"
]

const projectSchema = z.object({
  title: z.string().min(10, "Title must be at least 10 characters long"),
  abstract: z.string().min(100, "Abstract must be at least 100 characters long"),
  type: z.string().min(1, "Please select a project type"),
  teamInfo: z.string().min(50, "Team information must be at least 50 characters long"),
  timelineAndOutcomes: z.string().min(100, "Timeline and outcomes must be at least 100 characters long"),
  proposalFile: z.any().refine((file) => file instanceof File, "Project proposal is required"),
  ethicsFile: z.any().optional(),
  sdgGoals: z.array(z.string()).optional(),
  coPiDetails: z.array(z.object({
    uid: z.string().optional(),
    name: z.string().min(1, "Co-PI name is required"),
    email: z.string().email("Valid email is required"),
    cvFile: z.any().refine((file) => file instanceof File, "CV is required for each Co-PI")
  })).optional()
})

type ProjectFormData = z.infer<typeof projectSchema>

interface SubmissionFormProps {
  user: User
  existingProject?: Project
}

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (error) => reject(error)
    reader.readAsDataURL(file)
  })
}

export function SubmissionForm({ user, existingProject }: SubmissionFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDraft, setIsDraft] = useState(false)
  const [coPiSearchTerm, setCoPiSearchTerm] = useState("")
  const [foundCoPi, setFoundCoPi] = useState<{ uid: string; name: string; email: string } | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      title: existingProject?.title || "",
      abstract: existingProject?.abstract || "",
      type: existingProject?.type || "",
      teamInfo: existingProject?.teamInfo || "",
      timelineAndOutcomes: existingProject?.timelineAndOutcomes || "",
      sdgGoals: existingProject?.sdgGoals || [],
      coPiDetails: existingProject?.coPiDetails?.map(coPi => ({
        uid: coPi.uid,
        name: coPi.name,
        email: coPi.email,
        cvFile: null // Will need to be re-uploaded for existing projects
      })) || []
    }
  })

  const { fields: coPiFields, append: appendCoPi, remove: removeCoPi } = useFieldArray({
    control: form.control,
    name: "coPiDetails"
  })

  const validateFile = (file: File, type: 'proposal' | 'ethics' | 'cv') => {
    if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
      return "Only PDF files are allowed"
    }
    if (file.size > MAX_FILE_SIZE) {
      return "File size must be less than 5MB"
    }
    return null
  }

  const handleSearchCoPi = async () => {
    if (!coPiSearchTerm.trim()) return
    
    setIsSearching(true)
    setFoundCoPi(null)
    
    try {
      const result = await findUserByMisId(coPiSearchTerm.trim())
      if (result.success && result.user) {
        setFoundCoPi({
          uid: result.user.uid,
          name: result.user.name,
          email: result.user.email || ""
        })
      } else if (result.success && result.staff) {
        setFoundCoPi({
          uid: "",
          name: result.staff.name,
          email: result.staff.email
        })
      } else {
        toast({
          variant: "destructive",
          title: "User Not Found",
          description: result.error || "No user found with this MIS ID"
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Search Failed",
        description: "An error occurred while searching"
      })
    } finally {
      setIsSearching(false)
    }
  }

  const handleAddCoPi = () => {
    if (!foundCoPi) return
    
    // Check if Co-PI is already added
    const existingCoPi = form.getValues("coPiDetails")?.find(
      coPi => coPi.email === foundCoPi.email
    )
    
    if (existingCoPi) {
      toast({
        variant: "destructive",
        title: "Co-PI Already Added",
        description: "This Co-PI is already in the list"
      })
      return
    }

    // Check if trying to add self
    if (foundCoPi.email === user.email) {
      toast({
        variant: "destructive",
        title: "Cannot Add Self",
        description: "You cannot add yourself as a Co-PI"
      })
      return
    }

    appendCoPi({
      uid: foundCoPi.uid || undefined,
      name: foundCoPi.name,
      email: foundCoPi.email,
      cvFile: null
    })

    setFoundCoPi(null)
    setCoPiSearchTerm("")
  }

  const uploadFiles = async (formData: ProjectFormData) => {
    const uploadedFiles: { [key: string]: string } = {}

    // Upload proposal file
    if (formData.proposalFile) {
      const proposalDataUrl = await fileToDataUrl(formData.proposalFile)
      const proposalPath = `proposals/${user.uid}/${Date.now()}-${formData.proposalFile.name}`
      const proposalResult = await uploadFileToServer(proposalDataUrl, proposalPath)
      
      if (!proposalResult.success || !proposalResult.url) {
        throw new Error(proposalResult.error || "Failed to upload proposal")
      }
      uploadedFiles.proposalUrl = proposalResult.url
    }

    // Upload ethics file if provided
    if (formData.ethicsFile) {
      const ethicsDataUrl = await fileToDataUrl(formData.ethicsFile)
      const ethicsPath = `ethics/${user.uid}/${Date.now()}-${formData.ethicsFile.name}`
      const ethicsResult = await uploadFileToServer(ethicsDataUrl, ethicsPath)
      
      if (!ethicsResult.success || !ethicsResult.url) {
        throw new Error(ethicsResult.error || "Failed to upload ethics approval")
      }
      uploadedFiles.ethicsUrl = ethicsResult.url
    }

    // Upload Co-PI CVs
    const coPiDetailsWithCvs: CoPiDetails[] = []
    if (formData.coPiDetails && formData.coPiDetails.length > 0) {
      for (let i = 0; i < formData.coPiDetails.length; i++) {
        const coPi = formData.coPiDetails[i]
        let cvUrl = ""
        let cvFileName = ""

        if (coPi.cvFile) {
          const cvDataUrl = await fileToDataUrl(coPi.cvFile)
          const cvPath = `co-pi-cvs/${user.uid}/${Date.now()}-${coPi.name.replace(/\s+/g, '_')}-${coPi.cvFile.name}`
          const cvResult = await uploadFileToServer(cvDataUrl, cvPath)
          
          if (!cvResult.success || !cvResult.url) {
            throw new Error(`Failed to upload CV for ${coPi.name}`)
          }
          cvUrl = cvResult.url
          cvFileName = coPi.cvFile.name
        }

        coPiDetailsWithCvs.push({
          uid: coPi.uid || null,
          name: coPi.name,
          email: coPi.email,
          cvUrl,
          cvFileName
        })
      }
    }

    return { ...uploadedFiles, coPiDetailsWithCvs }
  }

  const onSubmit = async (data: ProjectFormData, saveAsDraft = false) => {
    setIsSubmitting(true)
    setIsDraft(saveAsDraft)

    try {
      // Validate files
      if (data.proposalFile) {
        const proposalError = validateFile(data.proposalFile, 'proposal')
        if (proposalError) {
          throw new Error(`Proposal file error: ${proposalError}`)
        }
      }

      if (data.ethicsFile) {
        const ethicsError = validateFile(data.ethicsFile, 'ethics')
        if (ethicsError) {
          throw new Error(`Ethics file error: ${ethicsError}`)
        }
      }

      // Validate Co-PI CVs
      if (data.coPiDetails && data.coPiDetails.length > 0) {
        for (const coPi of data.coPiDetails) {
          if (!coPi.cvFile) {
            throw new Error(`CV is required for Co-PI: ${coPi.name}`)
          }
          const cvError = validateFile(coPi.cvFile, 'cv')
          if (cvError) {
            throw new Error(`CV error for ${coPi.name}: ${cvError}`)
          }
        }
      }

      // Upload files
      const uploadResults = await uploadFiles(data)

      // Prepare project data
      const projectData: Omit<Project, 'id'> = {
        title: data.title,
        abstract: data.abstract,
        type: data.type,
        faculty: user.faculty || "",
        institute: user.institute || "",
        departmentName: user.department || "",
        pi: user.name,
        pi_uid: user.uid,
        pi_email: user.email,
        pi_phoneNumber: user.phoneNumber,
        teamInfo: data.teamInfo,
        timelineAndOutcomes: data.timelineAndOutcomes,
        status: saveAsDraft ? "Draft" : "Submitted",
        submissionDate: new Date().toISOString(),
        proposalUrl: uploadResults.proposalUrl,
        ethicsUrl: uploadResults.ethicsUrl,
        sdgGoals: data.sdgGoals,
        coPiDetails: uploadResults.coPiDetailsWithCvs,
        coPiUids: uploadResults.coPiDetailsWithCvs.map(coPi => coPi.uid).filter((uid): uid is string => !!uid)
      }

      const projectId = existingProject?.id || `project_${Date.now()}_${user.uid}`
      const result = await saveProjectSubmission(projectId, projectData)

      if (result.success) {
        toast({
          title: saveAsDraft ? "Draft Saved" : "Project Submitted",
          description: saveAsDraft 
            ? "Your project has been saved as a draft" 
            : "Your project has been submitted successfully"
        })
        router.push("/dashboard/my-projects")
      } else {
        throw new Error(result.error || "Failed to save project")
      }
    } catch (error: any) {
      console.error("Submission error:", error)
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: error.message || "An error occurred while submitting your project"
      })
    } finally {
      setIsSubmitting(false)
      setIsDraft(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>
            {existingProject ? "Edit Project Submission" : "New Project Submission"}
          </CardTitle>
          <CardDescription>
            Fill out all required fields to submit your research project proposal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => onSubmit(data, false))} className="space-y-6">
              
              {/* Basic Project Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Project Information</h3>
                
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Title *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter your project title" />
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
                          <SelectItem value="Research">Research</SelectItem>
                          <SelectItem value="Inter-Disciplinary">Inter-Disciplinary</SelectItem>
                          <SelectItem value="Innovation">Innovation</SelectItem>
                          <SelectItem value="Development">Development</SelectItem>
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
                          {...field} 
                          placeholder="Provide a detailed abstract of your project (minimum 100 characters)"
                          rows={6}
                        />
                      </FormControl>
                      <FormDescription>
                        {field.value?.length || 0} characters (minimum 100 required)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              {/* Team Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Team Information</h3>
                
                <FormField
                  control={form.control}
                  name="teamInfo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Team Information *</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="Describe your team members, their roles, and qualifications (minimum 50 characters)"
                          rows={4}
                        />
                      </FormControl>
                      <FormDescription>
                        {field.value?.length || 0} characters (minimum 50 required)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Co-PI Management */}
                <div className="space-y-4">
                  <Label className="text-sm font-medium">Co-Principal Investigators</Label>
                  
                  {/* Search and Add Co-PI */}
                  <div className="space-y-2">
                    <Label className="text-sm">Search & Add Co-PI by MIS ID</Label>
                    <div className="flex items-center gap-2">
                      <Input 
                        placeholder="Enter Co-PI's MIS ID" 
                        value={coPiSearchTerm}
                        onChange={(e) => setCoPiSearchTerm(e.target.value)}
                      />
                      <Button 
                        type="button" 
                        onClick={handleSearchCoPi} 
                        disabled={isSearching || !coPiSearchTerm.trim()}
                      >
                        {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                      </Button>
                    </div>
                    
                    {foundCoPi && (
                      <div className="flex items-center justify-between p-3 border rounded-md bg-muted/50">
                        <div>
                          <p className="font-medium">{foundCoPi.name}</p>
                          <p className="text-sm text-muted-foreground">{foundCoPi.email}</p>
                        </div>
                        <Button type="button" size="sm" onClick={handleAddCoPi}>
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Co-PI List */}
                  {coPiFields.length > 0 && (
                    <div className="space-y-3">
                      <Label className="text-sm">Added Co-PIs</Label>
                      {coPiFields.map((field, index) => (
                        <div key={field.id} className="p-4 border rounded-md space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{form.watch(`coPiDetails.${index}.name`)}</p>
                              <p className="text-sm text-muted-foreground">{form.watch(`coPiDetails.${index}.email`)}</p>
                            </div>
                            <Button 
                              type="button" 
                              variant="destructive" 
                              size="sm"
                              onClick={() => removeCoPi(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          {/* CV Upload for this Co-PI */}
                          <FormField
                            control={form.control}
                            name={`coPiDetails.${index}.cvFile`}
                            render={({ field: { onChange, value, ...field } }) => (
                              <FormItem>
                                <FormLabel className="flex items-center gap-2">
                                  <FileText className="h-4 w-4" />
                                  CV (PDF, max 5MB) *
                                </FormLabel>
                                <FormControl>
                                  <div className="flex items-center gap-2">
                                    <Input
                                      {...field}
                                      type="file"
                                      accept=".pdf"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) {
                                          const error = validateFile(file, 'cv')
                                          if (error) {
                                            toast({
                                              variant: "destructive",
                                              title: "Invalid File",
                                              description: error
                                            })
                                            return
                                          }
                                          onChange(file)
                                        }
                                      }}
                                      className="flex-1"
                                    />
                                    {value && (
                                      <Badge variant="secondary" className="flex items-center gap-1">
                                        <FileText className="h-3 w-3" />
                                        {value.name}
                                      </Badge>
                                    )}
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Timeline and Outcomes */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Project Details</h3>
                
                <FormField
                  control={form.control}
                  name="timelineAndOutcomes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timeline and Expected Outcomes *</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="Describe your project timeline, milestones, and expected outcomes (minimum 100 characters)"
                          rows={6}
                        />
                      </FormControl>
                      <FormDescription>
                        {field.value?.length || 0} characters (minimum 100 required)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* SDG Goals */}
                <FormField
                  control={form.control}
                  name="sdgGoals"
                  render={() => (
                    <FormItem>
                      <FormLabel>UN Sustainable Development Goals (Optional)</FormLabel>
                      <FormDescription>
                        Select the SDG goals that align with your project
                      </FormDescription>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border rounded-md">
                        {sdgGoals.map((goal) => (
                          <FormField
                            key={goal}
                            control={form.control}
                            name="sdgGoals"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(goal)}
                                    onCheckedChange={(checked) => {
                                      const currentValue = field.value || []
                                      if (checked) {
                                        field.onChange([...currentValue, goal])
                                      } else {
                                        field.onChange(currentValue.filter((value) => value !== goal))
                                      }
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="text-sm font-normal cursor-pointer">
                                  {goal}
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              {/* File Uploads */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Document Uploads</h3>
                
                <FormField
                  control={form.control}
                  name="proposalFile"
                  render={({ field: { onChange, value, ...field } }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        Project Proposal (PDF, max 5MB) *
                      </FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input
                            {...field}
                            type="file"
                            accept=".pdf"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) {
                                const error = validateFile(file, 'proposal')
                                if (error) {
                                  toast({
                                    variant: "destructive",
                                    title: "Invalid File",
                                    description: error
                                  })
                                  return
                                }
                                onChange(file)
                              }
                            }}
                            className="flex-1"
                          />
                          {value && (
                            <Badge variant="secondary" className="flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              {value.name}
                            </Badge>
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="ethicsFile"
                  render={({ field: { onChange, value, ...field } }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        Ethics Approval (PDF, max 5MB) - Optional
                      </FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input
                            {...field}
                            type="file"
                            accept=".pdf"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) {
                                const error = validateFile(file, 'ethics')
                                if (error) {
                                  toast({
                                    variant: "destructive",
                                    title: "Invalid File",
                                    description: error
                                  })
                                  return
                                }
                                onChange(file)
                              }
                            }}
                            className="flex-1"
                          />
                          {value && (
                            <Badge variant="secondary" className="flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              {value.name}
                            </Badge>
                          )}
                        </div>
                      </FormControl>
                      <FormDescription>
                        Upload if your project involves human subjects or ethical considerations
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Validation Summary */}
              {coPiFields.length > 0 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Please ensure all Co-PIs have their CVs uploaded before submitting the project.
                    Each CV must be a PDF file under 5MB.
                  </AlertDescription>
                </Alert>
              )}

              {/* Submit Buttons */}
              <div className="flex gap-4 pt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onSubmit(form.getValues(), true)}
                  disabled={isSubmitting}
                >
                  {isDraft && isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving Draft...
                    </>
                  ) : (
                    "Save as Draft"
                  )}
                </Button>
                
                <Button type="submit" disabled={isSubmitting}>
                  {!isDraft && isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Project"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
