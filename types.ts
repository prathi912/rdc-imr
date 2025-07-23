export interface User {
  uid: string
  email: string
  displayName?: string
  role: "faculty" | "admin" | "evaluator"
  department?: string
  institute?: string
  misId?: string
  profileComplete: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Project {
  id: string
  title: string
  description: string
  principalInvestigator: string
  coInvestigators?: string[]
  department: string
  institute: string
  fundingAgency?: string
  requestedAmount: number
  duration: number
  status: "draft" | "submitted" | "under_review" | "approved" | "rejected"
  submittedAt?: Date
  createdAt: Date
  updatedAt: Date
  documents: Document[]
  evaluations: Evaluation[]
}

export interface Document {
  id: string
  name: string
  url: string
  type: string
  size: number
  uploadedAt: Date
}

export interface Evaluation {
  id: string
  projectId: string
  evaluatorId: string
  evaluatorName: string
  score: number
  comments: string
  criteria: EvaluationCriteria
  status: "pending" | "completed"
  submittedAt?: Date
  createdAt: Date
}

export interface EvaluationCriteria {
  technicalMerit: number
  innovation: number
  feasibility: number
  impact: number
  methodology: number
}

export interface EMRCall {
  id: string
  title: string
  description: string
  deadline: Date
  status: "active" | "closed"
  createdAt: Date
  updatedAt: Date
}

export interface EMRInterest {
  id: string
  callId: string
  userId: string
  userName: string
  department: string
  institute: string
  status: "interested" | "not_interested" | "maybe"
  submittedAt: Date
}

export interface IncentiveClaim {
  id: string
  userId: string
  type: "research_paper" | "book" | "patent" | "conference" | "membership" | "apc"
  title: string
  details: any
  amount: number
  status: "pending" | "approved" | "rejected"
  submittedAt: Date
  reviewedAt?: Date
  reviewedBy?: string
  comments?: string
}

export interface Notification {
  id: string
  userId: string
  title: string
  message: string
  type: "info" | "success" | "warning" | "error"
  read: boolean
  createdAt: Date
}

export interface Institute {
  id: string
  name: string
  code: string
  departments: Department[]
}

export interface Department {
  id: string
  name: string
  code: string
  instituteId: string
}

export interface Meeting {
  id: string
  title: string
  description?: string
  date: Date
  duration: number
  attendees: string[]
  status: "scheduled" | "completed" | "cancelled"
  meetingLink?: string
  createdBy: string
  createdAt: Date
}
