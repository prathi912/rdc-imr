


export type CoPiDetails = {
    uid?: string | null; // Will exist for registered users
    name: string;
    email: string;
    cvUrl?: string; // URL to the uploaded CV
    cvFileName?: string; // Original filename for display
};


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
  sidebarOrder?: string[];
  researchDomain?: string;
};

export type Author = {
  uid?: string | null; // Present for internal authors who are registered on the portal
  email: string;
  name: string;
  role: 'First Author' | 'Corresponding Author' | 'Co-Author' | 'First & Corresponding Author';
  isExternal: boolean;
};

export type ResearchPaper = {
  id: string;
  title: string;
  url: string;
  mainAuthorUid?: string;
  authors: Author[];
  authorUids: string[]; // For efficient querying by UID
  authorEmails: string[]; // For efficient querying by email before sign-up
  domain?: string;
  createdAt: string; // ISO String
  updatedAt: string; // ISO String
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
  projectId?: string; // Standardized, sequential ID like RDC/IMR/APPL/0001
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
  coPiDetails?: CoPiDetails[];
  coPiUids?: string[];
  status: 'Draft' | 'Submitted' | 'Under Review' | 'Revision Needed' | 'Sanctioned' | 'Not Recommended' | 'In Progress' | 'Completed' | 'Pending Completion Approval';
  teamInfo: string;
  timelineAndOutcomes: string;
  submissionDate: string; // Should be ISO string
  proposalUrl?: string;
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
  projectDuration?: string;
  phases?: { name: string, amount: number }[];
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

export type BookCoAuthor = {
    name: string;
    email: string;
    uid?: string | null;
    role: 'First Author' | 'Corresponding Author' | 'Co-Author' | 'First & Corresponding Author';
    status?: 'Pending' | 'Applied';
    isExternal: boolean;
};

export type IncentiveClaim = {
    id: string;
    uid: string;
    userName: string;
    userEmail: string;
    status: 'Pending' | 'Accepted' | 'Rejected' | 'Draft';
    submissionDate: string; // ISO String
    faculty: string;
    bankDetails?: UserBankDetails;
    originalClaimId?: string; // Link to the primary author's claim
    misId?: string;
    orcidId?: string;
    calculatedIncentive?: number;
    
    // Main selector
    claimType: string;

    // Common fields
    benefitMode: string;
    
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
    authorType?: string;
    totalAuthors?: string;

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
    bookCoAuthors?: BookCoAuthor[];
    coAuthorUids?: string[]; // For efficient querying
    bookTitleForChapter?: string; // Title of the Book (for Book Chapter)
    bookEditor?: string; // Name Of the Editor (for Book Chapter)
    bookChapterPages?: number;
    bookTotalPages?: number;
    bookTotalChapters?: number;
    chaptersInSameBook?: number;
    publicationYear?: number;
    authorRole?: 'Author' | 'Editor';
    totalPuStudents?: number;
    puStudentNames?: string;
    publisherName?: string;
    publisherCity?: string;
    publisherCountry?: string;
    publisherType?: 'National' | 'International';
    isScopusIndexed?: boolean;
    publicationMode?: 'Print Only' | 'Electronic Only' | 'Print & Electronic';
    isbnPrint?: string;
    isbnElectronic?: string;
    publisherWebsite?: string;
    bookProofUrl?: string;
    scopusProofUrl?: string;
    publicationOrderInYear?: 'First' | 'Second' | 'Third';
    bookSelfDeclaration?: boolean;
    bookType?: 'Textbook' | 'Reference Book';

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
  callIdentifier?: string; // Human-readable sequential ID
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
    time?: string; // HH:mm
    venue: string;
    assignedEvaluators?: string[];
  };
  isAnnounced?: boolean;
};

export type EmrInterest = {
    id: string; // Auto-generated Firestore ID
    interestId?: string; // Human-readable sequential ID
    callId: string;
    callTitle?: string; // For convenience, especially for bulk uploads
    userId: string;
    userName: string;
    userEmail: string;
    faculty?: string;
    department?: string;
    registeredAt: string; // ISO String
    pptUrl?: string;
    pptSubmissionDate?: string; // ISO String
    coPiDetails?: CoPiDetails[];
    coPiUids?: string[];
    coPiNames?: string[];
    status: 'Registered' | 'PPT Submitted' | 'Revision Submitted' | 'Evaluation Pending' | 'Evaluation Done' | 'Recommended' | 'Not Recommended' | 'Revision Needed' | 'Endorsement Submitted' | 'Endorsement Signed' | 'Submitted to Agency' | 'Sanctioned' | 'Not Sanctioned' | 'Process Complete';
    adminRemarks?: string;
    revisedPptUrl?: string;
    meetingSlot?: {
      date: string; // yyyy-MM-dd
      time: string; // HH:mm
    },
    endorsementFormUrl?: string;
    signedEndorsementUrl?: string;
    endorsementSignedAt?: string;
    agencyReferenceNumber?: string;
    agencyAcknowledgementUrl?: string;
    submittedToAgencyAt?: string;
    finalProofUrl?: string;
    isBulkUploaded?: boolean;
    agency?: string;
    durationAmount?: string;
    isOpenToPi?: boolean;
    proofUrl?: string;
    sanctionDate?: string; // ISO String
};

export type EmrEvaluation = {
  evaluatorUid: string;
  evaluatorName: string;
  evaluationDate: string; // ISO String
  recommendation: 'Recommended' | 'Not Recommended' | 'Revision is needed';
  comments: string;
};

export type SystemSettings = {
    is2faEnabled: boolean;
};

export type LoginOtp = {
    email: string;
    otp: string;
    expiresAt: number; // Store as timestamp
};
