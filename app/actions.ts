"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/lib/config"
import { collection, doc, updateDoc, addDoc, deleteDoc, getDocs, query, where, Timestamp } from "firebase/firestore"

export async function updateEmrStatus(
  callId: string,
  userId: string,
  status: "interested" | "not_interested" | "maybe",
) {
  try {
    const emrInterestRef = collection(db, "emrInterests")

    // Check if user already has an interest record for this call
    const existingQuery = query(emrInterestRef, where("callId", "==", callId), where("userId", "==", userId))

    const existingDocs = await getDocs(existingQuery)

    if (!existingDocs.empty) {
      // Update existing record
      const docRef = existingDocs.docs[0].ref
      await updateDoc(docRef, {
        status,
        updatedAt: Timestamp.now(),
      })
    } else {
      // Create new record
      await addDoc(emrInterestRef, {
        callId,
        userId,
        status,
        submittedAt: Timestamp.now(),
        createdAt: Timestamp.now(),
      })
    }

    revalidatePath("/dashboard/emr-management")
    revalidatePath(`/dashboard/emr-management/${callId}`)

    return { success: true }
  } catch (error) {
    console.error("Error updating EMR status:", error)
    return { success: false, error: "Failed to update EMR status" }
  }
}

export async function submitProject(formData: FormData) {
  try {
    const projectData = {
      title: formData.get("title") as string,
      description: formData.get("description") as string,
      principalInvestigator: formData.get("principalInvestigator") as string,
      department: formData.get("department") as string,
      institute: formData.get("institute") as string,
      requestedAmount: Number(formData.get("requestedAmount")),
      duration: Number(formData.get("duration")),
      status: "submitted" as const,
      submittedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }

    const projectsRef = collection(db, "projects")
    await addDoc(projectsRef, projectData)

    revalidatePath("/dashboard/my-projects")
    redirect("/dashboard/my-projects")
  } catch (error) {
    console.error("Error submitting project:", error)
    return { success: false, error: "Failed to submit project" }
  }
}

export async function submitIncentiveClaim(formData: FormData) {
  try {
    const claimData = {
      userId: formData.get("userId") as string,
      type: formData.get("type") as string,
      title: formData.get("title") as string,
      amount: Number(formData.get("amount")),
      details: JSON.parse(formData.get("details") as string),
      status: "pending" as const,
      submittedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
    }

    const claimsRef = collection(db, "incentiveClaims")
    await addDoc(claimsRef, claimData)

    revalidatePath("/dashboard/manage-incentive-claims")
    redirect("/dashboard/manage-incentive-claims")
  } catch (error) {
    console.error("Error submitting incentive claim:", error)
    return { success: false, error: "Failed to submit incentive claim" }
  }
}

export async function updateProjectStatus(projectId: string, status: string) {
  try {
    const projectRef = doc(db, "projects", projectId)
    await updateDoc(projectRef, {
      status,
      updatedAt: Timestamp.now(),
    })

    revalidatePath("/dashboard/all-projects")
    revalidatePath("/dashboard/my-projects")

    return { success: true }
  } catch (error) {
    console.error("Error updating project status:", error)
    return { success: false, error: "Failed to update project status" }
  }
}

export async function deleteProject(projectId: string) {
  try {
    const projectRef = doc(db, "projects", projectId)
    await deleteDoc(projectRef)

    revalidatePath("/dashboard/all-projects")
    revalidatePath("/dashboard/my-projects")

    return { success: true }
  } catch (error) {
    console.error("Error deleting project:", error)
    return { success: false, error: "Failed to delete project" }
  }
}

export async function scheduleMeeting(formData: FormData) {
  try {
    const meetingData = {
      title: formData.get("title") as string,
      description: formData.get("description") as string,
      date: Timestamp.fromDate(new Date(formData.get("date") as string)),
      duration: Number(formData.get("duration")),
      attendees: JSON.parse(formData.get("attendees") as string),
      status: "scheduled" as const,
      createdBy: formData.get("createdBy") as string,
      createdAt: Timestamp.now(),
    }

    const meetingsRef = collection(db, "meetings")
    await addDoc(meetingsRef, meetingData)

    revalidatePath("/dashboard/schedule-meeting")
    revalidatePath("/dashboard/emr-calendar")

    return { success: true }
  } catch (error) {
    console.error("Error scheduling meeting:", error)
    return { success: false, error: "Failed to schedule meeting" }
  }
}
