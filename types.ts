export interface User {
  uid: string
  email: string
  name: string
  role: "Super-admin" | "admin" | "CRO" | "Evaluator" | "Faculty"
  designation?: string
  institute?: string
  department?: string
  faculty?: string
  faculties?: string[]
  misId?: string
  phoneNumber?: string
  profileComplete?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface Project {
  id: string
  title: string
  abstract: string
  type: string
  pi: string
  pi_email: string
  pi_phoneNumber?: string
  pi_uid: string
  faculty: string
  institute: string
  departmentName: string
  campus?: string
  status:
    | "Draft"
    | "Submitted"
    | "Under Review"
    | "Recommended"
    | "Not Recommended"
    | "In Progress"
    | "Completed"
    | "Pending Completion Approval"
  submissionDate: string
  evaluatedBy?: string[]
  meetingDetails?: {
    scheduledDate?: string
    meetingLink?: string
    assignedEvaluators?: string[]
  }
  grant?: {
    totalAmount: number
    sanctionNumber?: string
    sanctionDate?: string
  }
  isBulkUploaded?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface IncentiveClaim {
  id: string
  uid: string
  userName: string
  userEmail: string
  claimType:
    | "Research Papers"
    | "Patents"
    | "Conference Presentations"
    | "Books"
    | "Membership of Professional Bodies"
    | "Seed Money for APC"
  status: "Pending" | "Accepted" | "Rejected"
  submissionDate: string
  faculty: string
  institute: string

  // Common fields
  paperTitle?: string
  authorType?: string
  benefitMode?: string
  totalAuthors?: number
  orcidId?: string

  // Research Paper specific
  journalName?: string
  journalWebsite?: string
  publicationType?: string
  indexType?: "wos" | "scopus"
  journalClassification?: string
  wosType?: string
  impactFactor?: number
  publicationPhase?: string
  relevantLink?: string

  // Patent specific
  patentTitle?: string
  patentSpecificationType?: string
  patentApplicationNumber?: string
  patentStatus?: string
  patentApplicantType?: string
  patentFiledInPuName?: boolean
  patentFiledFromIprCell?: boolean
  patentPermissionTaken?: boolean
  patentTotalStudents?: number
  patentStudentNames?: string
  patentApprovalProofUrl?: string
  patentForm1Url?: string
  patentGovtReceiptUrl?: string
  patentSelfDeclaration?: boolean

  // Conference specific
  conferencePaperTitle?: string
  conferenceName?: string
  organizerName?: string
  eventWebsite?: string
  conferenceDate?: string
  presentationDate?: string
  conferenceType?: string
  presentationType?: string
  conferenceMode?: string
  conferenceVenue?: string
  registrationFee?: number
  onlinePresentationOrder?: string
  travelPlaceVisited?: string
  travelMode?: string
  travelFare?: number
  wasPresentingAuthor?: boolean
  isPuNamePresent?: boolean
  wonPrize?: boolean
  prizeDetails?: string
  attendedOtherConference?: boolean
  conferenceSelfDeclaration?: boolean
  abstractUrl?: string
  registrationFeeProofUrl?: string
  participationCertificateUrl?: string
  prizeProofUrl?: string
  travelReceiptsUrl?: string
  govtFundingRequestProofUrl?: string

  // Book specific
  bookApplicationType?: string
  publicationTitle?: string
  bookTitleForChapter?: string
  bookAuthors?: string
  bookEditor?: string
  publisherName?: string
  publisherType?: string
  publisherWebsite?: string
  isbn?: string
  publicationOrderInYear?: number
  totalPuAuthors?: number
  totalPuStudents?: number
  puStudentNames?: string
  bookChapterPages?: string
  bookTotalPages?: number
  isSelfPublished?: boolean
  isScopusIndexed?: boolean
  bookType?: string
  authorRole?: string
  bookProofUrl?: string
  scopusProofUrl?: string
  bookSelfDeclaration?: boolean

  // Membership specific
  professionalBodyName?: string
  membershipFee?: number
  membershipProofUrl?: string
  membershipSelfDeclaration?: boolean

  // APC specific
  apcTypeOfArticle?: string
  apcOtherArticleType?: string
  apcPaperTitle?: string
  apcAuthors?: string
  apcTotalStudentAuthors?: number
  apcStudentNames?: string
  apcJournalDetails?: string
  apcQRating?: string
  apcNationalInternational?: string
  apcJournalWebsite?: string
  apcIssnNo?: string
  apcIndexingStatus?: string[]
  apcOtherIndexingStatus?: string
  apcSciImpactFactor?: number
  apcApcWaiverRequested?: boolean
  apcApcWaiverProofUrl?: string
  apcPuNameInPublication?: boolean
  apcTotalAmount?: number
  apcAmountClaimed?: number
  apcSelfDeclaration?: boolean
  apcPublicationProofUrl?: string
  apcInvoiceProofUrl?: string

  // Bank details
  bankDetails?: {
    beneficiaryName: string
    accountNumber: string
    bankName: string
    branchName: string
    city: string
    ifscCode: string
  }

  createdAt?: string
  updatedAt?: string
}

export interface FundingCall {
  id: string
  title: string
  agency: string
  callIdentifier?: string
  description: string
  eligibility: string
  fundingAmount: string
  applicationDeadline: string
  interestDeadline: string
  websiteUrl?: string
  documentUrl?: string
  status: "Open" | "Closed" | "Meeting Scheduled"
  meetingDetails?: {
    scheduledDate?: string
    meetingLink?: string
    assignedEvaluators?: string[]
  }
  createdAt: string
  updatedAt?: string
}

export interface EmrInterest {
  id: string
  callId: string
  userId: string
  userName: string
  userEmail: string
  faculty: string
  status: "Registered" | "PPT Uploaded" | "Evaluated" | "Submitted to Agency"
  registeredAt: string
  pptUrl?: string
  pptUploadedAt?: string
  agencyReferenceNumber?: string
  agencyAcknowledgementUrl?: string
  submittedToAgencyAt?: string
  updatedAt?: string
}

export interface EmrEvaluation {
  evaluatorUid: string
  evaluatorName: string
  recommendation: "Recommended" | "Not Recommended" | "Revision is needed"
  comments: string
  evaluationDate: string
}
