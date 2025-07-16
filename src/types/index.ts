export type UserBankDetails = {
  bankName: string;
  accountNumber: string;
  beneficiaryName: string;
  city: string;
  branchName: string;
  ifscCode: string;
};

export type User = {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'faculty' | 'CRO' | 'Super-admin' | 'Evaluator';
  designation?: 'Principal' | 'HOD' | 'Super-admin' | 'faculty' | string;
  faculties?: string[]; // A user can be associated with multiple faculties, especially CROs
  faculty?: string; // Primary faculty
  institute?: string;
  department?: string | null;
  misId?: string;
  orcidId?: string;
  scopusId?: string;
  vidwanId?: string;
  googleScholarId?: string;
  phoneNumber?: string;
  profileComplete?: boolean;
  photoURL?: string;
  allowedModules?: string[];
  bankDetails?: UserBankDetails;
  hasCompletedTutorial?: boolean;
};

export type BankDetails = {
  accountHolderName: string;
  accountNumber: string;
  bankName: string;
  ifscCode: string;
  branchName: string;
  city: string;
};

export type Transaction = {
  id: string; // Can be a timestamp + random string
  phaseId: string; // Link transaction to a phase
  dateOfTransaction: string; // ISO String
  amount: number;
  vendorName: string;
  isGstRegistered: boolean;
  gstNumber?: string;
  invoiceUrl?: string; // URL to the uploaded invoice in Firebase Storage
  description: string;
};

export type GrantPhase = {
  id: string; // Can be a timestamp + random string
  name: string;
  amount: number;
  status: 'Pending Disbursement' | 'Disbursed' | 'Utilization Submitted' | 'Completed';
  disbursementDate?: string;
  transactions?: Transaction[];
  utilizationSubmissionDate?: string;
};

export type GrantDetails = {
    totalAmount: number;
    sanctionNumber?: string;
    status: 'Awarded' | 'In Progress' | 'Completed';
    bankDetails?: BankDetails;
    phases: GrantPhase[];
};

export type Evaluation = {
  evaluatorUid: string;
  evaluatorName: string;
  evaluationDate: string; // ISO String
  recommendation: 'Recommended' | 'Not Recommended' | 'Revision Is Needed';
  comments: string;
};

export type Project = {
  id: string;
  title: string;
  abstract: string;
  type: string;
  faculty: string;
  institute: string;
  departmentName: string;
  pi: string;
  pi_uid: string;
  pi_email?: string;
  pi_phoneNumber?: string;
  coPiUids?: string[];
  status: 'Draft' | 'Submitted' | 'Under Review' | 'Revision Needed' | 'Recommended' | 'Not Recommended' | 'In Progress' | 'Completed' | 'Pending Completion Approval' | 'Sanctioned';
  teamInfo: string;
  timelineAndOutcomes: string;
  submissionDate: string; // Should be ISO string
  proposalUrl?: string;
  cvUrl?: string;
  ethicsUrl?: string;
  grant?: GrantDetails;
  completionReportUrl?: string;
  utilizationCertificateUrl?: string;
  completionSubmissionDate?: string; // ISO String
  evaluatedBy?: string[];
  meetingDetails?: {
    date: string;
    time: string;
    venue: string;
    assignedEvaluators?: string[];
  };
  revisedProposalUrl?: string;
  revisionSubmissionDate?: string;
  revisionComments?: string;
  isBulkUploaded?: boolean;
  projectStartDate?: string;
  projectEndDate?: string;
  sdgGoals?: string[];
};

export type Notification = {
  id: string;
  uid: string; // The user this notification is for
  projectId: string;
  title: string;
  createdAt: string; // ISO String
  isRead: boolean;
};

export type IncentiveClaim = {
    id: string;
    uid: string;
    userName: string;
    userEmail: string;
    status: 'Pending' | 'Accepted' | 'Rejected';
    submissionDate: string; // ISO String
    faculty: string;
    bankDetails?: UserBankDetails;
    
    // Main selector
    claimType: string;

    // Common fields
    totalAuthors?: string;
    authorType?: string;
    benefitMode: string;
    orcidId?: string;
    
    // Research Paper Fields
    publicationType?: string;
    indexType?: 'wos' | 'scopus' | 'both' | 'esci';
    journalClassification?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
    wosType?: 'SCIE' | 'SSCI' | 'A&HCI';
    impactFactor?: number;
    journalName?: string;
    journalWebsite?: string;
    paperTitle?: string;
    publicationPhase?: string;
    relevantLink?: string;

    // Patent Fields
    patentTitle?: string;
    patentStatus?: 'Filed' | 'Published' | 'Granted';
    patentApplicantType?: 'Sole' | 'Joint';
    patentSpecificationType?: 'Full' | 'Provisional';
    patentApplicationNumber?: string;
    patentTotalStudents?: number;
    patentStudentNames?: string;
    patentFiledInPuName?: boolean;
    patentFiledFromIprCell?: boolean;
    patentPermissionTaken?: boolean;
    patentApprovalProofUrl?: string;
    patentForm1Url?: string;
    patentGovtReceiptUrl?: string;
    patentSelfDeclaration?: boolean;

    // Conference Fields
    conferenceName?: string;
    conferencePaperTitle?: string;
    conferenceType?: 'International' | 'National' | 'Regional/State';
    conferenceVenue?: 'India' | 'Indian Subcontinent' | 'South Korea, Japan, Australia and Middle East' | 'Europe' | 'African/South American/North American';
    presentationType?: 'Oral' | 'Poster' | 'Other';
    govtFundingRequestProofUrl?: string;
    registrationFee?: number;
    travelFare?: number;
    conferenceMode?: 'Online' | 'Offline';
    onlinePresentationOrder?: 'First' | 'Second' | 'Third' | 'Additional';
    wasPresentingAuthor?: boolean;
    isPuNamePresent?: boolean;
    abstractUrl?: string;
    organizerName?: string;
    eventWebsite?: string;
    conferenceDate?: string; // ISO String
    presentationDate?: string; // ISO String
    registrationFeeProofUrl?: string;
    participationCertificateUrl?: string;
    wonPrize?: boolean;
    prizeDetails?: string;
    prizeProofUrl?: string;
    attendedOtherConference?: boolean;
    travelPlaceVisited?: string;
    travelMode?: 'Bus' | 'Train' | 'Air' | 'Other';
    travelReceiptsUrl?: string;
    conferenceSelfDeclaration?: boolean;

    // Book/Book Chapter Fields
    bookApplicationType?: 'Book Chapter' | 'Book';
    publicationTitle?: string; // Title of the book chapter/Book
    bookAuthors?: string;
    bookTitleForChapter?: string; // Title of the Book (for Book Chapter)
    bookEditor?: string; // Name Of the Editor (for Book Chapter)
    bookChapterPages?: number;
    bookTotalPages?: number;
    bookType?: 'Textbook' | 'Reference Book';
    authorRole?: 'Editor' | 'Author';
    totalPuAuthors?: number;
    totalPuStudents?: number;
    puStudentNames?: string;
    publisherName?: string;
    isSelfPublished?: boolean;
    publisherType?: 'National' | 'International';
    isScopusIndexed?: boolean;
    isbn?: string;
    publisherWebsite?: string;
    bookProofUrl?: string;
    scopusProofUrl?: string;
    publicationOrderInYear?: 'First' | 'Second' | 'Third';
    bookSelfDeclaration?: boolean;

    // Professional Body Membership fields
    professionalBodyName?: string;
    membershipFee?: number;
    membershipProofUrl?: string;
    membershipSelfDeclaration?: boolean;

    // Seed Money for APC Fields
    apcTypeOfArticle?: string;
    apcOtherArticleType?: string;
    apcPaperTitle?: string;
    apcAuthors?: string;
    apcTotalStudentAuthors?: number;
    apcStudentNames?: string;
    apcJournalDetails?: string;
    apcQRating?: string;
    apcNationalInternational?: 'National' | 'International';
    apcApcWaiverRequested?: boolean;
    apcApcWaiverProofUrl?: string;
    apcJournalWebsite?: string;
    apcIssnNo?: string;
    apcIndexingStatus?: string[];
    apcOtherIndexingStatus?: string;
    apcSciImpactFactor?: number;
    apcPublicationProofUrl?: string;
    apcInvoiceProofUrl?: string;
    apcPuNameInPublication?: boolean;
    apcAmountClaimed?: number;
    apcTotalAmount?: number;
    apcSelfDeclaration?: boolean;
};

export type FundingCall = {
  id: string;
  title: string;
  agency: string;
  description?: string;
  applyDeadline: string; // ISO String
  interestDeadline: string; // ISO String
  callType: 'Fellowship' | 'Grant' | 'Collaboration' | 'Other';
  detailsUrl?: string;
  attachments?: { name: string; url: string }[];
  createdAt: string; // ISO String
  createdBy: string; // UID of the admin who created it
  status: 'Open' | 'Closed' | 'Meeting Scheduled';
  meetingDetails?: {
    date: string; // yyyy-MM-dd
    venue: string;
    assignedEvaluators?: string[];
  };
};

export type EmrInterest = {
    id: string; // Combination of callId and userId
    callId: string;
    userId: string;
    userName: string;
    userEmail: string;
    faculty: string;
    department: string;
    registeredAt: string; // ISO String
    submittedToAgency: boolean;
    meetingSlot?: {
      date: string; // yyyy-MM-dd
      time: string; // HH:mm
    },
    pptUrl?: string;
    pptSubmissionDate?: string; // ISO String
    coPiUids?: string[];
    coPiNames?: string[];
    status: 'Registered' | 'Revision Submitted' | 'Recommended' | 'Not Recommended' | 'Revision Needed';
    adminRemarks?: string;
    revisedPptUrl?: string;
};

export type EmrEvaluation = {
  evaluatorUid: string;
  evaluatorName: string;
  evaluationDate: string; // ISO String
  recommendation: 'Recommended' | 'Not Recommended' | 'Revision is needed';
  comments: string;
};
