
"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Logo } from "@/components/logo"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"
import { auth, db } from "@/lib/config"
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth"
import { doc, getDoc, setDoc } from "firebase/firestore"
import type { User } from "@/types"
import { useState } from "react"
import { getDefaultModulesForRole } from "@/lib/modules"
import {
  linkHistoricalData,
  notifySuperAdminsOnNewUser,
  linkPapersToNewUser,
  linkEmrInterestsToNewUser,
  isEmailDomainAllowed,
  linkEmrCoPiInterestsToNewUser,
} from "@/app/actions"
import { Eye, EyeOff } from "lucide-react"

const signupSchema = z
  .object({
    email: z.string().email("Invalid email address."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })

type SignupFormValues = z.infer<typeof signupSchema>

export default function SignupPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  })

  const validateEmailDomain = async (email: string): Promise<boolean> => {
    if (email === "rathipranav07@gmail.com" || email === "vicepresident_86@paruluniversity.ac.in") {
      return true
    }

    if (/^\d+$/.test(email.split("@")[0])) {
      return false
    }

    const domainCheck = await isEmailDomainAllowed(email)
    return domainCheck.allowed
  }

  const processNewUser = async (firebaseUser: FirebaseUser) => {
    const userDocRef = doc(db, "users", firebaseUser.uid)
    const userDocSnap = await getDoc(userDocRef)

    if (userDocSnap.exists()) {
      toast({
        title: "Account Exists",
        description: "This email is already registered. Please sign in.",
      })
      await signOut(auth)
      router.push("/login")
      return
    }

    const domainCheck = await isEmailDomainAllowed(firebaseUser.email!)
    const staffRes = await fetch(`/api/get-staff-data?email=${firebaseUser.email!}`)
    const staffResult = await staffRes.json()

    let userDataFromExcel: Partial<User> = {}
    let role: User["role"] = "faculty"
    let designation: User["designation"] = "faculty"
    let profileComplete = false
    let notifyRole: string | null = null
    let campus: User['campus'] = 'Vadodara';

    if (firebaseUser.email?.endsWith('@goa.paruluniversity.ac.in')) {
        campus = 'Goa';
    }

    if (firebaseUser.email === "vicepresident_86@paruluniversity.ac.in") {
      role = "Super-admin"
      designation = "Super-admin"
      profileComplete = true
      notifyRole = "Super-admin"
    } else if (staffResult.success) {
      userDataFromExcel = staffResult.data
      const userType = staffResult.data.type

      if (userType === "CRO") {
        role = "CRO"
        designation = "CRO"
        profileComplete = true
        notifyRole = "CRO"
      } else if (userType === "Institutional") {
        role = "faculty"
        designation = "Principal"
        profileComplete = true
        notifyRole = "Principal"
      }
    } else if (domainCheck.isCro) {
      role = "CRO"
      designation = "CRO"
      profileComplete = true
      notifyRole = "CRO"
    }

    const user: User = {
      uid: firebaseUser.uid,
      name: userDataFromExcel.name || firebaseUser.displayName || firebaseUser.email!.split("@")[0],
      email: firebaseUser.email!,
      role,
      designation,
      campus,
      faculty: userDataFromExcel.faculty || null,
      institute: userDataFromExcel.institute || null,
      department: userDataFromExcel.department || null,
      phoneNumber: userDataFromExcel.phoneNumber || null,
      misId: userDataFromExcel.misId || null,
      profileComplete,
      allowedModules: getDefaultModulesForRole(role, designation),
      hasCompletedTutorial: false,
    }

    if (firebaseUser.photoURL) {
      user.photoURL = firebaseUser.photoURL
    }

    await setDoc(userDocRef, user)

    if (notifyRole) {
      await notifySuperAdminsOnNewUser(user.name, notifyRole)
    }

    try {
      const historicalResult = await linkHistoricalData(user)
      if (historicalResult.success && historicalResult.count > 0) {
        console.log(`Successfully linked ${historicalResult.count} historical IMR projects for new user ${user.email}.`)
      }

      const paperResult = await linkPapersToNewUser(user.uid, user.email)
      if (paperResult.success && paperResult.count > 0) {
        console.log(`Successfully linked ${paperResult.count} research papers for new user ${user.email}.`)
      }

      const emrInterestResult = await linkEmrInterestsToNewUser(user.uid, user.email)
      if (emrInterestResult.success && emrInterestResult.count > 0) {
        console.log(`Successfully linked ${emrInterestResult.count} EMR interests for new user ${user.email}.`)
      }
      
      const emrCoPiResult = await linkEmrCoPiInterestsToNewUser(user.uid, user.email);
      if (emrCoPiResult.success && emrCoPiResult.count > 0) {
        console.log(`Successfully linked ${emrCoPiResult.count} EMR Co-PI interests for new user ${user.email}.`);
      }

    } catch (e) {
      console.error("Error calling linking actions:", e)
    }

    if (typeof window !== "undefined") {
      localStorage.setItem("user", JSON.stringify(user))
    }

    if (user.profileComplete) {
      toast({
        title: "Account Created",
        description: "Welcome! Redirecting to your dashboard.",
      })
      router.push("/dashboard")
    } else {
      toast({
        title: "Account Created",
        description: "Let's complete your profile to continue.",
      })
      router.push("/profile-setup")
    }
  }

  const onEmailSubmit = async (data: SignupFormValues) => {
    setIsSubmitting(true)
    try {
      const isValidDomain = await validateEmailDomain(data.email)
      if (!isValidDomain) {
        toast({
          variant: "destructive",
          title: "Access Denied",
          description: "This email domain is not authorized for portal access, or student accounts are not permitted.",
        })
        setIsSubmitting(false)
        return
      }

      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password)
      await processNewUser(userCredential.user)
    } catch (error: any) {
      console.error("Signup Error:", error)
      toast({
        variant: "destructive",
        title: "Sign Up Failed",
        description:
          error.code === "auth/email-already-in-use"
            ? "This email is already registered."
            : error.message || "An unknown error occurred.",
      })
      setIsSubmitting(false)
    }
  }

  const handleGoogleSignUp = async () => {
    setIsSubmitting(true)
    const provider = new GoogleAuthProvider()
    try {
      const result = await signInWithPopup(auth, provider)
      const firebaseUser = result.user
      const email = firebaseUser.email

      if (!email) {
        throw new Error("No email found in Google account")
      }

      const isValidDomain = await validateEmailDomain(email)
      if (!isValidDomain) {
        await signOut(auth)
        toast({
          variant: "destructive",
          title: "Access Denied",
          description: "This email domain is not authorized for portal access, or student accounts are not permitted.",
        })
        setIsSubmitting(false)
        return
      }

      await processNewUser(firebaseUser)
    } catch (error: any) {
      console.error("Google Sign-up error:", error)
      toast({
        variant: "destructive",
        title: "Sign Up Failed",
        description: error.message || "Could not sign up with Google. Please try again.",
      })
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-background dark:bg-transparent">
      <main className="flex-1 flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <div className="w-full max-w-md">
          <Card className="shadow-xl">
            <CardHeader className="text-center">
              <div className="mx-auto mb-6 flex justify-center">
                <Logo />
              </div>
              <CardTitle className="text-2xl font-bold">Create an Account</CardTitle>
              <CardDescription>Join the Parul University Research Projects Portal.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onEmailSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>University Email</FormLabel>
                        <FormControl>
                          <Input placeholder="your.name@paruluniversity.ac.in" {...field} disabled={isSubmitting} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              {...field}
                              disabled={isSubmitting}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                              onClick={() => setShowPassword(!showPassword)}
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showConfirmPassword ? "text" : "password"}
                              placeholder="••••••••"
                              {...field}
                              disabled={isSubmitting}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            >
                              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? "Creating Account..." : "Sign Up with Email"}
                  </Button>
                </form>
              </Form>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full bg-transparent"
                onClick={handleGoogleSignUp}
                disabled={isSubmitting}
              >
                <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="mr-2 h-4 w-4">
                  <title>Google</title>
                  <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.85 3.18-1.73 4.1-1.02 1.02-2.62 1.9-4.63 1.9-3.87 0-7-3.13-7-7s3.13-7 7-7c2.18 0 3.66.87 4.53 1.73l2.43-2.38C18.04 2.33 15.47 1 12.48 1 7.01 1 3 5.02 3 9.98s4.01 8.98 9.48 8.98c2.96 0 5.42-1 7.15-2.68 1.78-1.74 2.37-4.24 2.37-6.52 0-.6-.05-1.18-.15-1.72H12.48z" />
                </svg>
                Sign up with Google
              </Button>
            </CardContent>
            <CardFooter className="justify-center text-sm">
              <p className="text-muted-foreground">Already have an account?&nbsp;</p>
              <Link href="/login" passHref>
                <Button variant="link" className="p-0 h-auto">
                  Sign In
                </Button>
              </Link>
            </CardFooter>
          </Card>
        </div>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Parul University. All rights reserved.
        </p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link className="text-xs hover:underline underline-offset-4" href="/help">
            Help
          </Link>
          <Link className="text-xs hover:underline underline-offset-4" href="/terms-of-use">
            Terms of Service
          </Link>
          <Link className="text-xs hover:underline underline-offset-4" href="/privacy-policy">
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  )
}

  