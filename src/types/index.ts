export interface User {
  uid: string
  name: string
  email: string
  role: "faculty" | "admin" | "Super-admin" | "CRO"
  faculty?: string
  institute?: string
  campus?: string
  department?: string
  designation?: string
  misId?: string
  orcidId?: string
  scopusId?: string
  vidwanId?: string
  googleScholarId?: string
  phoneNumber?: string
  photoURL?: string
  hasCompletedTutorial?: boolean
  bankDetails?: BankDetails
}

export interface BankDetails {
  beneficiaryName: string
  accountNumber: string
  bankName: string
  branchName: string
  city: string
  ifscCode: string
}

export interface Project {
  id: string
  title: string
  abstract: string
  type: "Research" | "Development" | "Consultancy"
  pi: string
  pi_uid: string
  pi_email: string
  pi_phoneNumber?: string
  coPiUids?: string[]
  faculty: string
  institute: string
  campus?: string
  departmentName?: string
  teamInfo: string
  timelineAndOutcomes: string
  status:
    | "Submitted"
    | "Under Review"
    | "Revision Needed"
    | "Recommended"
    | "Not Recommended"
    | "Sanctioned"
    | "In Progress"
    | "Completed"
  submissionDate: string
  revisionComments?: string
  revisedProposalUrl?: string
  revisionSubmissionDate?: string
  proposalUrl?: string
  meetingDetails?: {
    date: string
    time: string
    venue: string
    assignedEvaluators: string[]
  }
  projectStartDate?: string
  projectEndDate?: string
  grant?: GrantDetails
  isBulkUploaded?: boolean
}

export interface GrantDetails {
  totalAmount: number
  status: "Pending" | "Awarded" | "Disbursed" | "Completed"
  sanctionNumber?: string
  phases: GrantPhase[]
}

export interface GrantPhase {
  id: string
  name: string
  amount: number
  status: "Pending Disbursement" | "Disbursed" | "Completed"
  disbursementDate?: string
  transactions: Transaction[]
}

export interface Transaction {
  id: string
  phaseId: string
  dateOfTransaction: string
  amount: number
  vendorName: string
  isGstRegistered: boolean
  gstNumber?: string
  description?: string
  invoiceUrl?: string
}

export interface Evaluation {
  id: string
  projectId: string
  evaluatorUid: string
  evaluatorName: string
  recommendation: "Recommended" | "Not Recommended" | "Revision Needed"
  comments?: string
  evaluationDate: string
}

export interface IncentiveClaim {
  id: string
  uid: string
  userName: string
  userEmail: string
  userFaculty: string
  userInstitute: string
  userDepartment?: string
  userCampus?: string
  claimType: "research-paper" | "patent" | "conference" | "book" | "membership" | "apc"
  status: "Pending" | "Under Review" | "Accepted" | "Rejected"
  submissionDate: string

  // Research Paper fields
  paperTitle?: string
  journalName?: string
  publicationDate?: string
  impactFactor?: number
  quartile?: "Q1" | "Q2" | "Q3" | "Q4"
  totalAuthors?: number
  authorPosition?: number
  paperUrl?: string

  // Patent fields
  patentTitle?: string
  patentNumber?: string
  patentType?: "Filed" | "Published" | "Granted"
  patentDate?: string
  patentUrl?: string

  // Conference fields
  conferencePaperTitle?: string
  conferenceName?: string
  conferenceDate?: string
  conferenceLocation?: string
  conferenceType?: "International" | "National"
  presentationType?: "Oral" | "Poster"
  conferenceUrl?: string

  // Book fields
  publicationType?: "Book" | "Book Chapter" | "Edited Book"
  publicationTitle?: string
  publisher?: string
  isbn?: string
  publicationYear?: string
  bookUrl?: string

  // Membership fields
  professionalBodyName?: string
  membershipType?: "Life Member" | "Annual Member" | "Fellow"
  membershipDate?: string
  membershipUrl?: string

  // APC fields
  apcPaperTitle?: string
  apcJournalName?: string
  apcAmount?: number
  apcPaymentDate?: string
  apcReceiptUrl?: string
}

export interface Notification {
  id: string
  uid: string
  projectId?: string
  title: string
  createdAt: string
  isRead: boolean
}

export interface EmrInterest {
  id: string
  interestId: string
  callId: string
  userId: string
  userName: string
  userEmail: string
  faculty: string
  department: string
  coPiUids?: string[]
  coPiNames?: string[]
  registeredAt: string
  status:
    | "Registered"
    | "Evaluation Pending"
    | "PPT Submitted"
    | "Recommended"
    | "Not Recommended"
    | "Endorsement Signed"
    | "Submitted to Agency"
  meetingSlot?: {
    date: string
    time: string
  }
  pptUrl?: string
  pptSubmissionDate?: string
}

export interface FundingCall {
  id: string
  callIdentifier: string
  title: string
  agency: string
  description?: string
  callType: "Research Grant" | "Fellowship" | "Conference" | "Equipment" | "Other"
  applyDeadline: string
  interestDeadline: string
  detailsUrl?: string
  attachments?: { name: string; url: string }[]
  createdAt: string
  createdBy: string
  status: "Open" | "Meeting Scheduled" | "Evaluation Complete" | "Closed"
  isAnnounced: boolean
  meetingDetails?: {
    date: string
    venue: string
    assignedEvaluators: string[]
  }
}

export interface EmrEvaluation {
  evaluatorUid: string
  evaluatorName: string
  recommendation: "Recommended" | "Not Recommended"
  comments: string
  evaluationDate: string
}

export interface Module {
  id: string
  name: string
  description: string
  isEnabled: boolean
  roles: string[]
  route: string
  icon: string
  order: number
}
