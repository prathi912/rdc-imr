import type { User, Project } from "@/types"

export interface DebugInfo {
  userInstitute: string | undefined
  userRole: string | undefined
  userDesignation: string | undefined
  projectCount: number
  sampleProjects: string[]
  timestamp: string
}

export function createDebugInfo(user: User, projects: Project[]): DebugInfo {
  return {
    userInstitute: user.institute,
    userRole: user.role,
    userDesignation: user.designation,
    projectCount: projects.length,
    sampleProjects: projects.slice(0, 3).map((p) => p.institute || "No Institute"),
    timestamp: new Date().toISOString(),
  }
}

export function logDebugInfo(debugInfo: DebugInfo, context: string): void {
  console.log(`[DEBUG - ${context}]`, debugInfo)
}

export function findInstituteMatches(userInstitute: string, allInstitutes: string[]): string[] {
  if (!userInstitute) return []

  const normalized = userInstitute.toLowerCase()
  return allInstitutes.filter((institute) => institute && institute.toLowerCase().includes(normalized))
}
