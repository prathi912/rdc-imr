"use client"

import type { User } from "firebase/auth"
import { createContext, useContext, useEffect, useState, type ReactNode, useCallback } from "react"
import { auth, db, functions as firebaseFunctions } from "@/lib/firebase/config"
import {
  getUserProfile,
  createUserProfileFS,
  createIdeaFromProfile,
  getIdeaWhereUserIsTeamMember,
  getIdeaById,
  updateTeamMemberDetailsInIdeaAfterProfileSetup,
  logUserActivity,
} from "@/lib/firebase/firestore"
import type { UserProfile, Role, IdeaSubmission, TeamMember, ActivityLogAction } from "@/types"
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword as firebaseSignInWithEmailPassword,
  sendPasswordResetEmail,
} from "firebase/auth"
import { doc, deleteDoc } from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { LoadingSpinner } from "@/components/common/LoadingSpinner"

// Predefined Mentor Emails
const MENTOR_EMAILS: string[] = [
  "prashant.khanna8747@paruluniversity.ac.in",
  "riddhi.bagha29080@paruluniversity.ac.in",
  "nikhil.jumade24167@paruluniversity.ac.in",
  "jay.sudani@paruluniversity.ac.in",
  "hardik.kharva2899@paruluniversity.ac.in",
  "sonal.sudani23321@paruluniversity.ac.in",
  "panchamkumar.baraiya28771@paruluniversity.ac.in",
  "juned.shaikh32161@paruluniversity.ac.in",
]

interface AuthContextType {
  user: User | null
  userProfile: UserProfile | null
  loading: boolean
  initialLoadComplete: boolean
  isTeamMemberForIdea: IdeaSubmission | null
  teamLeaderProfileForMember: UserProfile | null
  preFilledTeamMemberDataFromLeader: TeamMember | null
  isMentorEmail: (email: string | null | undefined) => boolean

  signInWithGoogle: () => Promise<void>
  signUpWithEmailPassword: (email: string, password: string) => Promise<void>
  signInWithEmailPassword: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  setRoleAndCompleteProfile: (
    role: Role,
    additionalData: Omit<
      UserProfile,
      | "uid"
      | "email"
      | "displayName"
      | "photoURL"
      | "role"
      | "isSuperAdmin"
      | "createdAt"
      | "updatedAt"
      | "isTeamMemberOnly"
      | "associatedIdeaId"
      | "associatedTeamLeaderUid"
    >,
  ) => Promise<void>
  deleteCurrentUserAccount: () => Promise<void>
  sendPasswordReset: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isMounted, setIsMounted] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)
  const [isTeamMemberForIdea, setIsTeamMemberForIdea] = useState<IdeaSubmission | null>(null)
  const [teamLeaderProfileForMember, setTeamLeaderProfileForMember] = useState<UserProfile | null>(null)
  const [preFilledTeamMemberDataFromLeader, setPreFilledTeamMemberDataFromLeader] = useState<TeamMember | null>(null)

  const router = useRouter()
  const { toast } = useToast()

  const isMentorEmail = useCallback((email: string | null | undefined): boolean => {
    if (!email) return false
    return MENTOR_EMAILS.includes(email.toLowerCase())
  }, [])

  useEffect(() => {
    setIsMounted(true)
    let lastUserUid: string | null = null

    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      setLoading(true)
      const isNewAuthUser = firebaseUser?.uid !== lastUserUid
      lastUserUid = firebaseUser?.uid || null

      if (firebaseUser && auth.currentUser && firebaseUser.uid === auth.currentUser.uid) {
        setUser(firebaseUser)

        // Store user data in localStorage for compatibility with existing code
        const userData = {
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || "",
          email: firebaseUser.email || "",
          role: "faculty", // Default role, will be updated from profile
          photoURL: firebaseUser.photoURL || "",
        }

        const profile = await getUserProfile(firebaseUser.uid)
        let ideaMembership: IdeaSubmission | null = null
        let leaderProfile: UserProfile | null = null
        let memberDataFromLeader: TeamMember | null = null

        if (profile) {
          if (firebaseUser.email === "pranavrathi07@gmail.com") {
            profile.isSuperAdmin = true
            profile.role = "ADMIN_FACULTY"
          } else if (isMentorEmail(firebaseUser.email)) {
            profile.role = "ADMIN_FACULTY"
          }
          setUserProfile(profile)

          // Update userData with profile information
          userData.role = profile.role === "ADMIN_FACULTY" ? "admin" : "faculty"
          if (profile.isSuperAdmin) {
            userData.role = "Super-admin"
          }

          // Store updated user data in localStorage
          localStorage.setItem(
            "user",
            JSON.stringify({
              ...userData,
              designation: profile.designation || "faculty",
              department: profile.department,
              institute: profile.instituteName,
              faculty: profile.faculty,
            }),
          )

          if (profile.isTeamMemberOnly && profile.associatedIdeaId) {
            ideaMembership = await getIdeaById(profile.associatedIdeaId)
            if (ideaMembership && ideaMembership.userId) {
              leaderProfile = await getUserProfile(ideaMembership.userId)
            }
            if (ideaMembership && ideaMembership.structuredTeamMembers && firebaseUser.email) {
              memberDataFromLeader =
                ideaMembership.structuredTeamMembers.find(
                  (m) => m.email.toLowerCase() === firebaseUser.email!.toLowerCase(),
                ) || null
            }
          }
        } else {
          // No Firestore profile exists, but check if user is a team member via email in an idea
          setUserProfile(null) // Explicitly set to null if no profile
          localStorage.setItem("user", JSON.stringify(userData))

          if (firebaseUser.email) {
            ideaMembership = await getIdeaWhereUserIsTeamMember(firebaseUser.email)
            if (ideaMembership) {
              if (ideaMembership.userId) {
                leaderProfile = await getUserProfile(ideaMembership.userId)
              }
              if (ideaMembership.structuredTeamMembers) {
                memberDataFromLeader =
                  ideaMembership.structuredTeamMembers.find(
                    (m) => m.email.toLowerCase() === firebaseUser.email!.toLowerCase(),
                  ) || null
              }
            }
          }
        }

        setIsTeamMemberForIdea(ideaMembership)
        setTeamLeaderProfileForMember(leaderProfile)
        setPreFilledTeamMemberDataFromLeader(memberDataFromLeader)

        if (profile) {
          if (isNewAuthUser && profile.role !== "ADMIN_FACULTY") {
            logUserActivity(firebaseUser.uid, profile.displayName || profile.fullName, "USER_SIGNED_IN", undefined, {
              ipAddress: "N/A",
              userAgent: "N/A",
            })
          }

          const isOnProfileSetup = window.location.pathname === "/profile-setup"
          const isOnLogin = window.location.pathname === "/login"

          const hasRequiredPersonalDetails =
            profile.fullName &&
            profile.fullName.trim() !== "" &&
            profile.contactNumber &&
            profile.contactNumber.trim() !== ""

          const isIdeaOwnerContext = !profile.isTeamMemberOnly && profile.role !== "ADMIN_FACULTY"

          const hasRequiredIdeaDetails =
            isIdeaOwnerContext &&
            profile.startupTitle &&
            profile.startupTitle.trim() !== "" &&
            profile.problemDefinition &&
            profile.problemDefinition.trim() !== "" &&
            profile.solutionDescription &&
            profile.solutionDescription.trim() !== "" &&
            profile.uniqueness &&
            profile.uniqueness.trim() !== "" &&
            profile.applicantCategory &&
            profile.currentStage

          if (isOnLogin) {
            router.push("/dashboard")
          } else if (isOnProfileSetup) {
            if (profile.role === "ADMIN_FACULTY" && hasRequiredPersonalDetails) {
              router.push("/dashboard")
            } else if (profile.isTeamMemberOnly && hasRequiredPersonalDetails) {
              router.push("/dashboard")
            } else if (isIdeaOwnerContext && hasRequiredPersonalDetails && hasRequiredIdeaDetails) {
              router.push("/dashboard")
            }
          } else {
            if (profile.role === "ADMIN_FACULTY") {
              if (!hasRequiredPersonalDetails) router.push("/profile-setup")
            } else if (profile.isTeamMemberOnly) {
              if (!hasRequiredPersonalDetails) router.push("/profile-setup")
            } else {
              if (!hasRequiredPersonalDetails || !hasRequiredIdeaDetails) router.push("/profile-setup")
            }
          }
        } else {
          // No profile exists for the authenticated user
          setUserProfile(null) // Ensure userProfile is null
          // Team member details (isTeamMemberForIdea, etc.) are already set based on email lookup above

          const isOnProfileSetup = window.location.pathname === "/profile-setup"
          // If user is authenticated but has no Firestore profile,
          // and is not already on the profile setup page (and not a Next.js internal page), redirect them there.
          if (firebaseUser && !isOnProfileSetup && !window.location.pathname.startsWith("/_next")) {
            router.push("/profile-setup")
          }
        }
      } else {
        // No firebaseUser (user is logged out)
        setUser(null)
        setUserProfile(null)
        setIsTeamMemberForIdea(null)
        setTeamLeaderProfileForMember(null)
        setPreFilledTeamMemberDataFromLeader(null)
        localStorage.removeItem("user")

        if (
          !firebaseUser &&
          router &&
          !["/login", "/"].includes(window.location.pathname) &&
          !window.location.pathname.startsWith("/_next")
        ) {
          router.push("/login")
        } else if (firebaseUser && (!auth.currentUser || firebaseUser.uid !== auth.currentUser.uid)) {
          console.warn(
            "Auth state inconsistency detected during sign out or user change.",
            firebaseUser,
            auth.currentUser,
          )
        }
      }
      setLoading(false)
      setInitialLoadComplete(true) // This must be set after all checks and potential redirects within this block
    })
    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMentorEmail])

  const handleAuthError = (error: any, action: string) => {
    console.error(`Error during ${action}:`, error)
    let message = error.message || `Failed to ${action}.`
    if (error.code) {
      switch (error.code) {
        case "auth/popup-closed-by-user":
          message = `The ${action} popup was closed before completion. Please try again.`
          break
        case "auth/cancelled-popup-request":
          message = `The ${action} request was cancelled. Please try again.`
          break
        case "auth/unauthorized-domain":
          message = `This domain is not authorized for Firebase ${action}. Please check Firebase console settings.`
          break
        case "auth/email-already-in-use":
          message = "This email address is already in use. Please try signing in or use a different email."
          break
        case "auth/weak-password":
          message = "The password is too weak. Please use a stronger password."
          break
        case "auth/invalid-credential":
        case "auth/user-not-found":
        case "auth/wrong-password":
          message = "Invalid email or password. Please check your credentials and try again."
          break
        case "auth/requires-recent-login":
          message =
            "This operation is sensitive and requires recent authentication. Please sign out and sign back in to continue."
          break
        default:
          message = `An error occurred during ${action}. Code: ${error.code}`
      }
    }
    toast({
      title: `${action.charAt(0).toUpperCase() + action.slice(1)} Error`,
      description: message,
      variant: "destructive",
    })
  }

  const signInWithGoogle = async () => {
    setLoading(true)
    const provider = new GoogleAuthProvider()
    try {
      await signInWithPopup(auth, provider)
      // onAuthStateChanged will handle the rest
    } catch (error: any) {
      handleAuthError(error, "Google sign-in")
    } finally {
      setLoading(false)
    }
  }

  const signUpWithEmailPassword = async (email: string, password: string) => {
    setLoading(true)
    try {
      await createUserWithEmailAndPassword(auth, email, password)
      await firebaseSignOut(auth)
      toast({
        title: "Sign Up Successful",
        description: "Your account has been created. Please log in with your new credentials.",
      })
      router.push("/login")
    } catch (error: any) {
      handleAuthError(error, "sign-up")
    } finally {
      setLoading(false)
    }
  }

  const signInWithEmailPassword = async (email: string, password: string) => {
    setLoading(true)
    try {
      await firebaseSignInWithEmailPassword(auth, email, password)
      // onAuthStateChanged will handle the rest
    } catch (error: any) {
      handleAuthError(error, "sign-in")
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    if (user && userProfile) {
      await logUserActivity(user.uid, userProfile.displayName || userProfile.fullName, "USER_SIGNED_OUT")
    }
    setLoading(true)
    try {
      await firebaseSignOut(auth)
      // onAuthStateChanged will redirect to /login
      toast({ title: "Signed Out", description: "You have been successfully signed out." })
    } catch (error: any) {
      handleAuthError(error, "sign-out")
    } finally {
      setLoading(false)
    }
  }

  const setRoleAndCompleteProfile = async (
    roleFromForm: Role,
    additionalData: Omit<
      UserProfile,
      | "uid"
      | "email"
      | "displayName"
      | "photoURL"
      | "role"
      | "isSuperAdmin"
      | "createdAt"
      | "updatedAt"
      | "isTeamMemberOnly"
      | "associatedIdeaId"
      | "associatedTeamLeaderUid"
    >,
  ) => {
    if (!user) {
      toast({ title: "Error", description: "No user logged in.", variant: "destructive" })
      return Promise.reject(new Error("No user logged in."))
    }
    setLoading(true)

    const isProfileNew = !userProfile
    let ideaCreationSuccessfulOrNotApplicable = true

    let actualRole = roleFromForm
    const isSuperAdminContext = user.email === "pranavrathi07@gmail.com"
    const isMentorContext = isMentorEmail(user.email)

    if (isSuperAdminContext || isMentorContext) {
      actualRole = "ADMIN_FACULTY"
    }

    const settingUpAsNewTeamMember = isProfileNew && isTeamMemberForIdea !== null

    const profileDataForFirestore: Partial<UserProfile> = {
      role: actualRole,
      isSuperAdmin: isSuperAdminContext,
      fullName: additionalData.fullName,
      contactNumber: additionalData.contactNumber,
      enrollmentNumber: additionalData.enrollmentNumber || null,
      college: additionalData.college || null,
      instituteName: additionalData.instituteName || null,
      isTeamMemberOnly: isProfileNew ? settingUpAsNewTeamMember : userProfile?.isTeamMemberOnly || false,
    }

    if (!isProfileNew && userProfile?.isTeamMemberOnly) {
      profileDataForFirestore.associatedIdeaId = userProfile.associatedIdeaId
      profileDataForFirestore.associatedTeamLeaderUid = userProfile.associatedTeamLeaderUid
    } else if (isProfileNew && settingUpAsNewTeamMember && isTeamMemberForIdea) {
      profileDataForFirestore.associatedIdeaId = isTeamMemberForIdea.id
      profileDataForFirestore.associatedTeamLeaderUid = isTeamMemberForIdea.userId
    }

    if (!profileDataForFirestore.isTeamMemberOnly) {
      if (isSuperAdminContext || isMentorContext) {
        profileDataForFirestore.startupTitle =
          additionalData.startupTitle || (isSuperAdminContext ? "Administrative Account" : "Faculty/Mentor Account")
        profileDataForFirestore.problemDefinition =
          additionalData.problemDefinition ||
          (isSuperAdminContext ? "Handles portal administration." : "Manages portal functions and/or mentorship.")
        profileDataForFirestore.solutionDescription =
          additionalData.solutionDescription ||
          (isSuperAdminContext
            ? "Provides administrative functions and support."
            : "Provides administrative or mentorship support.")
        profileDataForFirestore.uniqueness =
          additionalData.uniqueness ||
          (isSuperAdminContext
            ? "Unique administrative role for system management."
            : "Unique administrative/mentorship role.")
        profileDataForFirestore.currentStage = additionalData.currentStage || "STARTUP_STAGE"
        profileDataForFirestore.applicantCategory = additionalData.applicantCategory || "PARUL_STAFF"
      } else {
        profileDataForFirestore.startupTitle = additionalData.startupTitle
        profileDataForFirestore.problemDefinition = additionalData.problemDefinition
        profileDataForFirestore.solutionDescription = additionalData.solutionDescription
        profileDataForFirestore.uniqueness = additionalData.uniqueness
        profileDataForFirestore.applicantCategory = additionalData.applicantCategory
        profileDataForFirestore.currentStage = additionalData.currentStage
      }
    }

    try {
      const createdOrUpdatedProfile = await createUserProfileFS(user.uid, profileDataForFirestore)
      setUserProfile(createdOrUpdatedProfile) // Update local state immediately

      const logAction: ActivityLogAction = isProfileNew ? "USER_PROFILE_CREATED" : "USER_PROFILE_UPDATED"
      await logUserActivity(
        user.uid,
        createdOrUpdatedProfile.displayName || createdOrUpdatedProfile.fullName,
        logAction,
        {
          type: "USER_PROFILE",
          id: user.uid,
          displayName: createdOrUpdatedProfile.displayName || createdOrUpdatedProfile.fullName || undefined,
        },
        { role: createdOrUpdatedProfile.role, isTeamMember: createdOrUpdatedProfile.isTeamMemberOnly },
      )

      if (
        isProfileNew &&
        !createdOrUpdatedProfile.isTeamMemberOnly &&
        !(isMentorContext && createdOrUpdatedProfile.startupTitle === "Faculty/Mentor Account") &&
        !(isSuperAdminContext && createdOrUpdatedProfile.startupTitle === "Administrative Account") &&
        createdOrUpdatedProfile.startupTitle &&
        createdOrUpdatedProfile.startupTitle.trim() !== ""
      ) {
        try {
          const profileIdeaDataForCreation = {
            startupTitle: createdOrUpdatedProfile.startupTitle!,
            problemDefinition: createdOrUpdatedProfile.problemDefinition!,
            solutionDescription: createdOrUpdatedProfile.solutionDescription!,
            uniqueness: createdOrUpdatedProfile.uniqueness!,
            currentStage: createdOrUpdatedProfile.currentStage!,
            applicantCategory: createdOrUpdatedProfile.applicantCategory!,
          }
          const idea = await createIdeaFromProfile(user.uid, profileIdeaDataForCreation)
          if (idea && idea.id) {
            await logUserActivity(
              user.uid,
              createdOrUpdatedProfile.displayName || createdOrUpdatedProfile.fullName,
              "IDEA_SUBMITTED",
              { type: "IDEA", id: idea.id!, displayName: idea.title },
              { title: idea.title },
            )
          } else {
            toast({
              title: "Profile Saved, Idea Submission Issue",
              description:
                "Your profile was saved, but the initial idea submission could not be completed. Please try saving your profile again or contact support if the issue persists.",
              variant: "destructive",
              duration: 10000,
            })
            ideaCreationSuccessfulOrNotApplicable = false
          }
        } catch (ideaError: any) {
          toast({
            title: "Profile Saved, Idea Submission Failed",
            description: `Your profile was saved, but we couldn't create the initial idea submission: ${ideaError.message}. Please try saving your profile again or contact support.`,
            variant: "destructive",
            duration: 10000,
          })
          ideaCreationSuccessfulOrNotApplicable = false
        }
      }

      if (
        isProfileNew &&
        settingUpAsNewTeamMember &&
        createdOrUpdatedProfile.isTeamMemberOnly &&
        createdOrUpdatedProfile.associatedIdeaId &&
        isTeamMemberForIdea
      ) {
        await updateTeamMemberDetailsInIdeaAfterProfileSetup(
          createdOrUpdatedProfile.associatedIdeaId,
          isTeamMemberForIdea.title,
          user,
          {
            fullName: createdOrUpdatedProfile.fullName,
            contactNumber: createdOrUpdatedProfile.contactNumber,
            enrollmentNumber: createdOrUpdatedProfile.enrollmentNumber,
            college: createdOrUpdatedProfile.college,
            instituteName: createdOrUpdatedProfile.instituteName,
          },
        )
        const updatedIdea = await getIdeaById(createdOrUpdatedProfile.associatedIdeaId)
        setIsTeamMemberForIdea(updatedIdea)
        if (updatedIdea && updatedIdea.userId) {
          const leader = await getUserProfile(updatedIdea.userId)
          setTeamLeaderProfileForMember(leader)
        }
      } else if (
        !isProfileNew &&
        createdOrUpdatedProfile.isTeamMemberOnly &&
        createdOrUpdatedProfile.associatedIdeaId &&
        isTeamMemberForIdea
      ) {
        await updateTeamMemberDetailsInIdeaAfterProfileSetup(
          createdOrUpdatedProfile.associatedIdeaId,
          isTeamMemberForIdea.title,
          user,
          {
            fullName: createdOrUpdatedProfile.fullName,
            contactNumber: createdOrUpdatedProfile.contactNumber,
            enrollmentNumber: createdOrUpdatedProfile.enrollmentNumber,
            college: createdOrUpdatedProfile.college,
            instituteName: createdOrUpdatedProfile.instituteName,
          },
        )
        const updatedIdea = await getIdeaById(createdOrUpdatedProfile.associatedIdeaId)
        setIsTeamMemberForIdea(updatedIdea)
      }

      if (ideaCreationSuccessfulOrNotApplicable) {
        router.push("/dashboard")
        toast({ title: "Profile Saved", description: "Your profile has been successfully set up." })
      }
    } catch (error: any) {
      console.error("Profile setup failed", error)
      toast({
        title: "Profile Setup Error",
        description: error.message || "Failed to set up profile.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const deleteCurrentUserAccount = async () => {
    if (!user || !userProfile) {
      toast({ title: "Not Authenticated", description: "No user is currently logged in.", variant: "destructive" })
      throw new Error("User not authenticated")
    }
    if (user.email === "pranavrathi07@gmail.com") {
      toast({
        title: "Action Restricted",
        description: "The primary super admin account cannot be deleted.",
        variant: "default",
      })
      throw new Error("Primary super admin cannot be deleted.")
    }

    setLoading(true)
    try {
      const userProfileRef = doc(db, "users", user.uid)
      await deleteDoc(userProfileRef)
      toast({ title: "Profile Data Deleted", description: "Your profile information has been removed." })

      const deleteAuthFn = httpsCallable(firebaseFunctions, "deleteMyAuthAccountCallable")
      await deleteAuthFn()

      await logUserActivity(user.uid, userProfile.displayName || userProfile.fullName, "USER_ACCOUNT_DELETED_SELF", {
        type: "USER_PROFILE",
        id: user.uid,
        displayName: userProfile.displayName || userProfile.fullName || undefined,
      })
      // Sign out will be handled by onAuthStateChanged after auth deletion
      toast({
        title: "Account Deleted",
        description: "Your account has been successfully deleted. You have been signed out.",
      })
    } catch (error: any) {
      console.error("Error deleting user account:", error)
      try {
        await firebaseSignOut(auth)
      } catch (e) {
        console.error("Sign out failed after delete error:", e)
      }
      toast({
        title: "Account Deletion Failed",
        description: error.message || "Could not fully delete your account. Please contact support.",
        variant: "destructive",
      })
      throw error
    } finally {
      setLoading(false)
    }
  }

  const sendPasswordReset = async () => {
    if (!user || !user.email) {
      toast({ title: "Error", description: "No authenticated user or email found.", variant: "destructive" })
      return
    }
    setLoading(true)
    try {
      await sendPasswordResetEmail(auth, user.email)
      toast({
        title: "Password Reset Email Sent",
        description: `A password reset link has been sent to ${user.email}. Please check your inbox.`,
      })
      await logUserActivity(
        user.uid,
        userProfile?.displayName || userProfile?.fullName,
        "USER_PASSWORD_RESET_REQUESTED",
        {
          type: "USER_PROFILE",
          id: user.uid,
          displayName: userProfile?.displayName || userProfile?.fullName || undefined,
        },
      )
    } catch (error: any) {
      handleAuthError(error, "sending password reset email")
    } finally {
      setLoading(false)
    }
  }

  if (!isMounted) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background z-[9999]">
        <LoadingSpinner size={32} />
        <p className="ml-2 text-muted-foreground">Initializing Authentication...</p>
      </div>
    )
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        initialLoadComplete,
        isTeamMemberForIdea,
        teamLeaderProfileForMember,
        preFilledTeamMemberDataFromLeader,
        isMentorEmail,
        signInWithGoogle,
        signUpWithEmailPassword,
        signInWithEmailPassword,
        signOut,
        setRoleAndCompleteProfile,
        deleteCurrentUserAccount,
        sendPasswordReset,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
