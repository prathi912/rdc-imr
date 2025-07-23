"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { db, auth } from "@/lib/config"
import { doc, updateDoc, getDoc } from "firebase/firestore"
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth"
import { useRouter } from "next/navigation"
import { uploadFileToServer, fetchOrcidData, linkHistoricalData } from "@/app/actions"
import type { User } from "@/types"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Bot, Loader2 } from "lucide-react"
import { Combobox } from "@/components/ui/combobox"

const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  faculty: z.string().min(1, "Please select a faculty."),
  institute: z.string().min(1, "Please select an institute."),
  campus: z.string().min(1, "Please select a campus."),
  department: z.string().optional(),
  designation: z.string().min(2, "Designation is required."),
  misId: z.string().optional(),
  orcidId: z.string().optional(),
  scopusId: z.string().optional(),
  vidwanId: z.string().optional(),
  googleScholarId: z.string().optional(),
  phoneNumber: z.string().optional(),
})

type ProfileFormValues = z.infer<typeof profileSchema>

const faculties = [
  "Faculty of Engineering & Technology",
  "Faculty of Diploma Studies",
  "Faculty of Applied Sciences",
  "Faculty of IT & Computer Science",
  "Faculty of Agriculture",
  "Faculty of Architecture & Planning",
  "Faculty of Design",
  "Faculty of Fine Arts",
  "Faculty of Arts",
  "Faculty of Commerce",
  "Faculty of Social Work",
  "Faculty of Management Studies",
  "Faculty of Hotel Management & Catering Technology",
  "Faculty of Law",
  "Faculty of Medicine",
  "Faculty of Homoeopathy",
  "Faculty of Ayurved",
  "Faculty of Nursing",
  "Faculty of Pharmacy",
  "Faculty of Physiotherapy",
  "Faculty of Public Health",
  "Parul Sevashram Hospital",
  "RDC",
  "University Office",
  "Parul Aarogya Seva Mandal",
]

const institutes = [
  "Parul Institute of Technology",
  "Parul Institute of Technology-Diploma studies",
  "Ahmedabad Homoeopathic Medical College",
  "Ahmedabad Physiotherapy College",
  "College of Agriculture",
  "Department of Paramedical & Health Sciences",
  "Faculty of Library & Information Science",
  "Institute of Pharmaceutical Sciences",
  "Jawaharlal Nehru Homoeopathic Medical College",
  "Parul College of Pharmacy & Research",
  "Parul Institute of Applied Sciences (Ahmedabad Campus)",
  "Parul Institute of Applied Sciences (Vadodara Campus)",
  "Parul Institute of Architecture & Research",
  "Parul Institute of Arts",
  "Parul Institute of Ayurveda",
  "Parul Institute of Ayurveda & Research",
  "Parul Institute of Business Administration",
  "Parul Institute of Commerce",
  "Parul Institute of Computer Application",
  "Parul Institute of Design",
  "Parul Institute of Engineering & Technology",
  "Parul Institute of Engineering & Technology (Diploma Studies)",
  "Parul Institute of Fine Arts",
  "Parul Institute of Homeopathy & Research",
  "Parul Institute of Hotel Management & Catering Technology",
  "Parul Institute of Law",
  "Parul Institute of Management",
  "Parul Institute of Management & Research",
  "Parul Institute of Medical Sciences & Research",
  "Parul Institute of Nursing",
  "Parul Institute of Performing Arts",
  "Parul Institute of Pharmaceutical Education & Research",
  "Parul Institute of Pharmacy",
  "Parul Institute of Pharmacy & Research",
  "Parul Institute of Physiotherapy",
  "Parul Institute of Physiotherapy and Research",
  "Parul Institute of Social Work",
  "Parul Institute of Vocational Education",
  "Parul Medical Institute & Hospital",
  "Parul Polytechnic Institute",
  "Parul Institute of Public Health",
  "Parul Sevashram Hospital",
  "Rajkot Homoeopathic Medical College",
  "RDC",
  "School of Pharmacy",
  "University Office",
  "Parul Aarogya Seva Mandal",
]

const campuses = ["Vadodara Campus", "Ahmedabad Campus", "Rajkot Campus", "Surat Campus"]

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (error) => reject(error)
    reader.readAsDataURL(file)
  })
}

export default function ProfileSetupPage() {
  const { toast } = useToast()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [profilePicFile, setProfilePicFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isFetchingOrcid, setIsFetchingOrcid] = useState(false)
  const [departments, setDepartments] = useState<string[]>([])
  const [staffData, setStaffData] = useState<any[]>([])

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      faculty: "",
      institute: "",
      campus: "",
      department: "",
      designation: "",
      misId: "",
      orcidId: "",
      scopusId: "",
      vidwanId: "",
      googleScholarId: "",
      phoneNumber: "",
    },
  })

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const userDocRef = doc(db, "users", firebaseUser.uid)
        const userDocSnap = await getDoc(userDocRef)
        if (userDocSnap.exists()) {
          const appUser = { uid: firebaseUser.uid, ...userDocSnap.data() } as User
          setUser(appUser)
          setPreviewUrl(appUser.photoURL || null)

          form.reset({
            name: appUser.name || "",
            faculty: appUser.faculty || "",
            institute: appUser.institute || "",
            campus: appUser.campus || "",
            department: appUser.department || "",
            designation: appUser.designation || "",
            misId: appUser.misId || "",
            orcidId: appUser.orcidId || "",
            scopusId: appUser.scopusId || "",
            vidwanId: appUser.vidwanId || "",
            googleScholarId: appUser.googleScholarId || "",
            phoneNumber: appUser.phoneNumber || "",
          })
        }
      }
      setLoading(false)
    })

    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    async function fetchDepartments() {
      try {
        const res = await fetch("/api/get-departments")
        const result = await res.json()
        if (result.success) {
          setDepartments(result.data)
        }
      } catch (error) {
        console.error("Failed to fetch departments", error)
      }
    }
    fetchDepartments()
  }, [])

  useEffect(() => {
    async function fetchStaffData() {
      try {
        const res = await fetch("/api/get-staff-data")
        const result = await res.json()
        if (result.success) {
          setStaffData(result.data)
        }
      } catch (error) {
        console.error("Failed to fetch staff data", error)
      }
    }
    fetchStaffData()
  }, [])

  const handleEmailMatch = (email: string) => {
    const matchedStaff = staffData.find((staff) => staff.email && staff.email.toLowerCase() === email.toLowerCase())

    if (matchedStaff) {
      form.setValue("name", matchedStaff.name || "")
      form.setValue("faculty", matchedStaff.faculty || "")
      form.setValue("institute", matchedStaff.institute || "")
      form.setValue("campus", matchedStaff.campus || "")
      form.setValue("department", matchedStaff.department || "")
      form.setValue("designation", matchedStaff.designation || "")
      form.setValue("phoneNumber", matchedStaff.phoneNumber || "")

      toast({
        title: "Profile Pre-filled",
        description: "Your profile has been pre-filled with data from the staff database.",
      })
    }
  }

  useEffect(() => {
    if (user?.email && staffData.length > 0) {
      handleEmailMatch(user.email)
    }
  }, [user?.email, staffData, form])

  async function onSubmit(data: ProfileFormValues) {
    if (!user) return
    setIsSubmitting(true)
    try {
      const userDocRef = doc(db, "users", user.uid)

      // Sanitize data: Ensure optional fields that are empty strings are not sent as undefined
      for (const key in data) {
        if ((data as any)[key] === undefined) {
          ;(data as any)[key] = ""
        }
      }

      await updateDoc(userDocRef, data)

      const updatedUser = { ...user, ...data }
      localStorage.setItem("user", JSON.stringify(updatedUser))
      setUser(updatedUser)

      // Link historical data
      await linkHistoricalData({
        uid: user.uid,
        email: user.email,
        institute: data.institute,
        department: data.department,
        phoneNumber: data.phoneNumber,
        campus: data.campus,
      })

      toast({ title: "Profile setup completed successfully!" })
      router.push("/dashboard")
    } catch (error) {
      console.error("Profile setup error:", error)
      toast({ variant: "destructive", title: "Setup Failed", description: "Could not complete your profile setup." })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      setProfilePicFile(file)
      setPreviewUrl(URL.createObjectURL(file))
    }
  }

  const handlePictureUpdate = async () => {
    if (!profilePicFile || !user) return
    setIsUploading(true)
    try {
      const dataUrl = await fileToDataUrl(profilePicFile)
      const path = `profile-pictures/${user.uid}`
      const result = await uploadFileToServer(dataUrl, path)

      if (!result.success || !result.url) {
        throw new Error(result.error || "Upload failed")
      }
      const photoURL = result.url

      const userDocRef = doc(db, "users", user.uid)
      await updateDoc(userDocRef, { photoURL })

      const updatedUser = { ...user, photoURL }
      setUser(updatedUser)
      localStorage.setItem("user", JSON.stringify(updatedUser))

      toast({ title: "Profile picture updated!" })
      setProfilePicFile(null)
    } catch (error) {
      console.error("Error updating profile picture: ", error)
      toast({ variant: "destructive", title: "Update Failed", description: "Could not update your profile picture." })
    } finally {
      setIsUploading(false)
    }
  }

  const handleFetchOrcid = async () => {
    const orcidId = form.getValues("orcidId")
    if (!orcidId) {
      toast({
        variant: "destructive",
        title: "ORCID iD Missing",
        description: "Please enter an ORCID iD to fetch data.",
      })
      return
    }
    setIsFetchingOrcid(true)
    try {
      const result = await fetchOrcidData(orcidId)
      if (result.success && result.data) {
        form.setValue("name", result.data.name, { shouldValidate: true })
        toast({ title: "Success", description: "Your name has been pre-filled from your ORCID profile." })
      } else {
        toast({ variant: "destructive", title: "Fetch Failed", description: result.error })
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "An unexpected error occurred." })
    } finally {
      setIsFetchingOrcid(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Complete Your Profile</CardTitle>
              <CardDescription>Please provide your details to get started.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const departmentOptions = departments.map((dept) => ({ label: dept, value: dept }))

  return (
    <div className="container mx-auto py-10">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Complete Your Profile</CardTitle>
            <CardDescription>Please provide your details to get started with the Research Portal.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Profile Picture Section */}
            <div className="flex items-center gap-6">
              <Avatar className="h-20 w-20">
                <AvatarImage src={previewUrl || user?.photoURL || undefined} alt={user?.name || ""} />
                <AvatarFallback>{user?.name?.[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <Input
                  id="picture"
                  type="file"
                  onChange={handleFileChange}
                  accept="image/png, image/jpeg"
                  className="max-w-xs"
                />
                <p className="text-xs text-muted-foreground">PNG or JPG. 2MB max.</p>
                {profilePicFile && (
                  <Button onClick={handlePictureUpdate} disabled={isUploading} size="sm">
                    {isUploading ? "Uploading..." : "Save Picture"}
                  </Button>
                )}
              </div>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Your full name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  name="faculty"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Faculty</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select your faculty" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {faculties.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  name="institute"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Institute</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select your institute" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {institutes.map((i) => (
                            <SelectItem key={i} value={i}>
                              {i}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  name="campus"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campus</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select your campus" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {campuses.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
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
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <Combobox
                        options={departmentOptions}
                        value={field.value || ""}
                        onChange={field.onChange}
                        placeholder="Select your department"
                        searchPlaceholder="Search departments..."
                        emptyPlaceholder="No department found."
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="designation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Designation</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Professor, Assistant Professor" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="e.g. 9876543210" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Academic & Researcher IDs (Optional)</h3>

                  <FormField
                    control={form.control}
                    name="misId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>MIS ID</FormLabel>
                        <FormControl>
                          <Input placeholder="Your MIS ID" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="orcidId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ORCID iD</FormLabel>
                        <div className="flex items-center gap-2">
                          <FormControl>
                            <Input placeholder="e.g., 0000-0001-2345-6789" {...field} />
                          </FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={handleFetchOrcid}
                            disabled={isFetchingOrcid}
                            title="Fetch data from ORCID"
                          >
                            {isFetchingOrcid ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Bot className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="scopusId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Scopus ID</FormLabel>
                        <FormControl>
                          <Input placeholder="Your Scopus Author ID" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="vidwanId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vidwan ID</FormLabel>
                        <FormControl>
                          <Input placeholder="Your Vidwan-ID" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="googleScholarId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Google Scholar ID</FormLabel>
                        <FormControl>
                          <Input placeholder="Your Google Scholar Profile ID" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </form>
            </Form>
          </CardContent>
          <CardFooter>
            <Button onClick={form.handleSubmit(onSubmit)} disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Setting up..." : "Complete Setup"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
