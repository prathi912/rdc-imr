
"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { collection, query, where, getDocs, limit, orderBy, or } from "firebase/firestore"
import { db } from "@/lib/config"
import type { User, IncentiveClaim, Project, EmrInterest, FundingCall, ResearchPaper } from "@/types"
import { PageHeader } from "@/components/page-header"
import { ProfileClient } from "@/components/profile/profile-client"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { fetchEvaluatorProjectsForUser } from "@/app/actions"
import { isToday, parseISO } from "date-fns"

export default function ProfilePage() {
  const params = useParams()
  const misId = params.misId as string

  const [profileUser, setProfileUser] = useState<User | null>(null)
  const [claims, setClaims] = useState<IncentiveClaim[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [emrInterests, setEmrInterests] = useState<EmrInterest[]>([]);
  const [fundingCalls, setFundingCalls] = useState<FundingCall[]>([]);
  const [researchPapers, setResearchPapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sessionUser, setSessionUser] = useState<User | null>(null)

  useEffect(() => {
    const storedUser = localStorage.getItem("user")
    if (storedUser) {
      setSessionUser(JSON.parse(storedUser))
    } else {
      setLoading(false)
      setError("You must be logged in to view profiles.")
    }
  }, [])

  useEffect(() => {
    if (!misId || !sessionUser) {
      return
    }

    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const usersRef = collection(db, "users")
        const userQuery = query(usersRef, where("misId", "==", misId), limit(1))
        const userSnapshot = await getDocs(userQuery)

        if (userSnapshot.empty) {
          throw new Error("User not found.")
        }

        const targetUserDoc = userSnapshot.docs[0]
        const fetchedUser = { uid: targetUserDoc.id, ...targetUserDoc.data() } as User

        // --- Permission Check ---
        const isAdmin = ["Super-admin", "admin", "CRO"].includes(sessionUser.role)
        const isOwner = sessionUser.uid === fetchedUser.uid
        
        let isAssignedEvaluatorOnMeetingDay = false;
        if (!isAdmin && !isOwner) {
            const result = await fetchEvaluatorProjectsForUser(sessionUser.uid, fetchedUser.uid);
            if (result.success && result.projects && result.projects.length > 0) {
                isAssignedEvaluatorOnMeetingDay = true;
            }
        }
        
        if (!isAdmin && !isOwner && !isAssignedEvaluatorOnMeetingDay) {
          throw new Error("Access Denied: You do not have permission to view this profile.")
        }

        setProfileUser(fetchedUser)

        // --- Data Fetching (if permission is granted) ---
        const claimsRef = collection(db, "incentiveClaims");
        const claimsQuery = query(claimsRef, where("uid", "==", fetchedUser.uid), orderBy("submissionDate", "desc"));
        const claimsSnapshot = await getDocs(claimsQuery);
        setClaims(claimsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IncentiveClaim)));
        
        const emrInterestsRef = collection(db, "emrInterests");
        const emrInterestsQuery = query(
          emrInterestsRef, 
          or(
            where("userId", "==", fetchedUser.uid), 
            where("coPiUids", "array-contains", fetchedUser.uid)
          )
        );
        const emrInterestsSnapshot = await getDocs(emrInterestsQuery);
        const fetchedEmrInterests = emrInterestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));
        setEmrInterests(fetchedEmrInterests);

        if (fetchedEmrInterests.length > 0) {
            const callIds = [...new Set(fetchedEmrInterests.map(i => i.callId))];
            if (callIds.length > 0) {
              const callsQuery = query(collection(db, 'fundingCalls'), where('__name__', 'in', callIds));
              const callsSnapshot = await getDocs(callsQuery);
              const fetchedCalls = callsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingCall));
              setFundingCalls(fetchedCalls);
            }
        }

        try {
          const projectsRef = collection(db, "projects")
          const projectsQuery = query(
              projectsRef,
              or(
                  where("pi_uid", "==", fetchedUser.uid),
                  where("coPiUids", "array-contains", fetchedUser.uid),
                  where("pi_email", "==", fetchedUser.email)
              )
          );

          const projectsSnapshot = await getDocs(projectsQuery);
          const allProjects = projectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));

          const sortedProjects = allProjects
            .filter((p) => p.status !== "Draft")
            .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime())

          setProjects(sortedProjects)
        } catch (projectsError) {
          console.error("Error fetching projects:", projectsError)
          setProjects([])
        }
        
        try {
            const res = await fetch(`/api/get-research-papers?userUid=${fetchedUser.uid}&userEmail=${fetchedUser.email}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    setResearchPapers(data.papers || []);
                } else {
                    console.warn("API failed to fetch research papers:", data.error);
                    setResearchPapers([]);
                }
            } else {
                console.warn("HTTP error fetching research papers:", res.statusText);
                setResearchPapers([]);
            }
        } catch (paperError) {
            console.error("Network error fetching research papers:", paperError);
            setResearchPapers([]);
        }

      } catch (err: any) {
        if (err.code === "permission-denied") {
          setError("Access Denied: You do not have permission to view this profile.")
        } else {
          setError(err.message || "Failed to load profile data.")
        }
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [misId, sessionUser])

  if (loading) {
    return (
      <div className="container mx-auto max-w-7xl py-10">
        <PageHeader
          title="Loading Profile..."
          description="Please wait..."
          showBackButton={true}
          backButtonHref="/dashboard"
        />
        <div className="mt-8 flex flex-col items-center">
          <Card className="w-full max-w-4xl shadow-xl border-0 bg-card/80 backdrop-blur-lg">
            <CardContent className="p-6 md:p-8">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <Skeleton className="h-28 w-28 rounded-full" />
                <div className="flex flex-col items-center md:items-start text-center md:text-left w-full">
                  <Skeleton className="h-10 w-56" />
                  <Skeleton className="h-4 w-40 mt-3" />
                  <div className="flex justify-center md:justify-start gap-8 my-4">
                    <Skeleton className="h-10 w-20" />
                    <Skeleton className="h-10 w-20" />
                    <Skeleton className="h-10 w-20" />
                    <Skeleton className="h-10 w-20" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 pt-6 mt-6 border-t">
                <div className="space-y-4">
                  <Skeleton className="h-8 w-48" />
                  <div className="space-y-4">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </div>
                </div>
                <div className="space-y-4">
                  <Skeleton className="h-8 w-48" />
                  <div className="space-y-4">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="w-full max-w-4xl mt-8">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <Skeleton className="h-7 w-64" />
                <Skeleton className="h-10 w-32" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !profileUser) {
    return (
      <div className="container mx-auto max-w-7xl py-10">
        <PageHeader
          title="Error"
          description={error || "Could not load profile."}
          showBackButton={true}
          backButtonHref="/dashboard"
        />
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-7xl py-10">
      <PageHeader
        title={`${profileUser.name}'s Profile`}
        description="Public research profile and contributions."
        showBackButton={false}
      />
      <div className="mt-8">
        <ProfileClient user={profileUser} projects={projects} emrInterests={emrInterests} fundingCalls={fundingCalls} claims={claims} />
      </div>
    </div>
  )
}
