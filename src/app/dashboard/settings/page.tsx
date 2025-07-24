"use client"

import type React from "react"

import { useState, useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { db, auth } from "@/lib/config"
import { doc, getDoc, updateDoc } from "firebase/firestore"
import { uploadFileToServer, fetchOrcidData } from "@/app/actions"
import type { User } from "@/types"
import { Skeleton } from "@/components/ui/skeleton"
import {
  onAuthStateChanged,
  type User as FirebaseUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
} from "firebase/auth"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Banknote, Bot, Loader2 } from "lucide-react"
import { Combobox } from "@/components/ui/combobox"

const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email(),
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

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: z.string().min(8, "New password must be at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })
type PasswordFormValues = z.infer<typeof passwordSchema>

const bankDetailsSchema = z.object({
  beneficiaryName: z.string().min(2, "Beneficiary's name is required."),
  accountNumber: z.string().min(5, "A valid account number is required."),
  bankName: z.string().min(1, "Please select a bank."),
  branchName: z.string().min(2, "Branch name is required."),
  city: z.string().min(2, "City is required."),
  ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code format."),
})
type BankDetailsFormValues = z.infer<typeof bankDetailsSchema>

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

const campuses = ["Vadodara", "Ahmedabad", "Rajkot", "Goa"]

const salaryBanks = ["AU Bank", "HDFC Bank", "Central Bank of India"]

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (error) => reject(error)
    reader.readAsDataURL(file)
  })
}

export default function SettingsPage() {
  const { toast } = useToast()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false)
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false)
  const [isSubmittingBank, setIsSubmittingBank] = useState(false)
  const [profilePicFile, setProfilePicFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isFetchingOrcid, setIsFetchingOrcid] = useState(false)
  const [departments, setDepartments] = useState<string[]>([])

  const isPrincipal = useMemo(() => user?.designation === "Principal", [user])
  const isCro = useMemo(() => user?.role === "CRO", [user])

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      email: "",
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

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  })

  const bankForm = useForm<BankDetailsFormValues>({
    resolver: zodResolver(bankDetailsSchema),
    defaultValues: {
      beneficiaryName: "",
      accountNumber: "",
      bankName: "",
      branchName: "",
      city: "",
      ifscCode: "",
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

          profileForm.reset({
            name: appUser.name || "",
            email: appUser.email || "",
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
          if (appUser.bankDetails) {
            bankForm.reset(appUser.bankDetails)
          }
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

  async function onProfileSubmit(data: ProfileFormValues) {
    if (!user) return
    setIsSubmittingProfile(true)
    try {
      const userDocRef = doc(db, "users", user.uid)
      const { email, ...updateData } = data

      // Sanitize data: Ensure optional fields that are empty strings are not sent as undefined
      for (const key in updateData) {
        if ((updateData as any)[key] === undefined) {
          ;(updateData as any)[key] = ""
        }
      }

      await updateDoc(userDocRef, updateData)

      const updatedUser = { ...user, ...updateData }
      localStorage.setItem("user", JSON.stringify(updatedUser))
      setUser(updatedUser)

      toast({ title: "Profile updated successfully!" })
    } catch (error) {
      console.error("Profile update error:", error)
      toast({ variant: "destructive", title: "Update Failed", description: "Could not update your profile." })
    } finally {
      setIsSubmittingProfile(false)
    }
  }

  async function onBankDetailsSubmit(data: BankDetailsFormValues) {
    if (!user) return
    setIsSubmittingBank(true)
    try {
      const userDocRef = doc(db, "users", user.uid)
      await updateDoc(userDocRef, { bankDetails: data })

      const updatedUser = { ...user, bankDetails: data }
      localStorage.setItem("user", JSON.stringify(updatedUser))
      setUser(updatedUser)

      toast({ title: "Bank details updated successfully!" })
    } catch (error) {
      console.error("Bank details update error:", error)
      toast({ variant: "destructive", title: "Update Failed", description: "Could not update your bank details." })
    } finally {
      setIsSubmittingBank(false)
    }
  }

  async function onPasswordSubmit(data: PasswordFormValues) {
    setIsSubmittingPassword(true)
    const currentUser = auth.currentUser

    if (!currentUser || !currentUser.email) {
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: "Could not find the current user. Please log in again.",
      })
      setIsSubmittingPassword(false)
      return
    }

    try {
      const credential = EmailAuthProvider.credential(currentUser.email, data.currentPassword)
      await reauthenticateWithCredential(currentUser, credential)
      await updatePassword(currentUser, data.newPassword)

      toast({ title: "Password updated successfully!" })
      passwordForm.reset()
    } catch (error: any) {
      console.error("Password update error:", error)
      if (error.code === "auth/invalid-credential") {
        passwordForm.setError("currentPassword", {
          type: "manual",
          message: "The current password you entered is incorrect.",
        })
      } else if (error.code === "auth/requires-recent-login") {
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: "For security, please log out and sign in again before changing your password.",
        })
      } else {
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: "Could not update your password. Please try again.",
        })
      }
    } finally {
      setIsSubmittingPassword(false)
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
    const orcidId = profileForm.getValues("orcidId")
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
        profileForm.setValue("name", result.data.name, { shouldValidate: true })
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

  const isAcademicInfoLocked = isCro || isPrincipal

  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Settings" description="Manage your account settings and preferences." />
        <div className="mt-8 space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Update your personal information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
            <CardFooter className="border-t px-6 py-4">
              <Skeleton className="h-10 w-24" />
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Password</CardTitle>
              <CardDescription>Change your password.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
            <CardFooter className="border-t px-6 py-4">
              <Skeleton className="h-10 w-32" />
            </CardFooter>
          </Card>
        </div>
      </div>
    )
  }

  const departmentOptions = departments.map((dept) => ({ label: dept, value: dept }))

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Settings" description="Manage your account settings and preferences." />
      <div className="mt-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Profile Picture</CardTitle>
            <CardDescription>Update your profile picture.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-6">
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
            </div>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button onClick={handlePictureUpdate} disabled={isUploading || !profilePicFile}>
              {isUploading ? "Uploading..." : "Save Picture"}
            </Button>
          </CardFooter>
        </Card>

        <Form {...profileForm}>
          <form onSubmit={profileForm.handleSubmit(onProfileSubmit)}>
            <Card>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Update your personal information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={profileForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Your name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={profileForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="Your email" {...field} disabled />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  name="faculty"
                  control={profileForm.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Faculty</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isAcademicInfoLocked}>
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
                  control={profileForm.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Institute</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isAcademicInfoLocked}>
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
                  control={profileForm.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campus</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isAcademicInfoLocked}>
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
                  control={profileForm.control}
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
                        disabled={isAcademicInfoLocked}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="designation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Designation</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Professor" {...field} disabled={isAcademicInfoLocked} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />
                <h3 className="text-md font-semibold pt-2">Academic & Researcher IDs</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={profileForm.control}
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
                    control={profileForm.control}
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
                </div>
                <FormField
                  control={profileForm.control}
                  name="scopusId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Scopus ID (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Your Scopus Author ID" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="vidwanId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vidwan ID (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Your Vidwan-ID" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="googleScholarId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Google Scholar ID (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Your Google Scholar Profile ID" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />
                <FormField
                  control={profileForm.control}
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
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button type="submit" disabled={isSubmittingProfile}>
                  {isSubmittingProfile ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            </Card>
      </form>
        </Form>

        {/* Paper Publications Section */}
        <Card>
          <CardHeader>
            <CardTitle>Research Papers</CardTitle>
            <CardDescription>Add your published research papers and co-authors.</CardDescription>
          </CardHeader>
          <CardContent>
            {/* PaperForm component to add papers */}
            <PaperForm userId={user?.uid || ""} onPaperAdded={() => { /* Optionally refresh papers list */ }} />
          </CardContent>
        </Card>

        <Form {...bankForm}>
          <form onSubmit={bankForm.handleSubmit(onBankDetailsSubmit)}>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Banknote />
                  <CardTitle>Salary Bank Account Details</CardTitle>
                </div>
                <CardDescription>
                  This information is required for grant disbursal. These details would be only visible to admin if your
                  project is approved.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  name="beneficiaryName"
                  control={bankForm.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Beneficiary Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Name as per bank records" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="accountNumber"
                  control={bankForm.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Your bank account number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="bankName"
                  control={bankForm.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Name</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select your bank" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {salaryBanks.map((b) => (
                            <SelectItem key={b} value={b}>
                              {b}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    name="branchName"
                    control={bankForm.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Branch Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Akota" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="city"
                    control={bankForm.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Vadodara" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  name="ifscCode"
                  control={bankForm.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IFSC Code</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., HDFC0000001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button type="submit" disabled={isSubmittingBank}>
                  {isSubmittingBank ? "Saving..." : "Save Bank Details"}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </Form>
        <Form {...passwordForm}>
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}>
            <Card>
              <CardHeader>
                <CardTitle>Password</CardTitle>
                <CardDescription>Change your password. Please enter your current password to confirm.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={passwordForm.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Separator />
                <FormField
                  control={passwordForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button type="submit" disabled={isSubmittingPassword}>
                  {isSubmittingPassword ? "Updating..." : "Update Password"}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </Form>
      </div>
    </div>
  )
}
