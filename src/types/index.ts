

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
  role: 'admin' | 'faculty' | 'Evaluator' | 'CRO' | 'Super-admin';
  designation?: string;
  faculty?: string;
  institute?: string;
  department?: string;
  misId?: string;
  phoneNumber?: string;
  profileComplete?: boolean;
  photoURL?: string;
  allowedModules?: string[];
  bankDetails?: UserBankDetails;
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
  id: string;
  dateOfTransaction: string; // ISO String
  amount: number;
  vendorName: string;
  isGstRegistered: boolean;
  gstNumber?: string;
  invoiceUrl?: string; // URL to the uploaded invoice in Firebase Storage
  description: string;
};

export type GrantDetails = {
    amount: number;
    sanctionNumber?: string;
    status: 'Pending Bank Details' | 'Bank Details Submitted' | 'Disbursed' | 'Utilization Submitted' | 'Completed';
    disbursementDate?: string; // ISO String
    bankDetails?: BankDetails;
    transactions?: Transaction[];
    utilizationSubmissionDate?: string; // ISO String
};

export type Evaluation = {
  evaluatorUid: string;
  evaluatorName: string;
  evaluationDate: string; // ISO String
  scores: {
    relevance: number;
    methodology: number;

    feasibility: number;
    innovation: number;
  };
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
  status: 'Draft' | 'Submitted' | 'Under Review' | 'Approved' | 'Rejected' | 'In Progress' | 'Completed' | 'Pending Completion Approval';
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
  };
  revisedProposalUrl?: string;
  revisionSubmissionDate?: string;
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
    totalInternalAuthors?: string;
    totalInternalCoAuthors?: string;
    authorType?: string;
    benefitMode: string;
    
    // Research Paper Fields
    publicationType?: string;
    indexType?: 'wos' | 'scopus' | 'both' | 'esci';
    journalClassification?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
    wosType?: 'sci' | 'scie' | 'ahi';
    impactFactor?: number;
    journalName?: string;
    journalWebsite?: string;
    paperTitle?: string;
    publicationPhase?: string;
    relevantLink?: string;

    // Patent Fields
    patentTitle?: string;
    patentStatus?: 'Application Published' | 'Granted';
    patentApplicantType?: 'Sole' | 'Joint';

    // Conference Fields
    conferenceName?: string;
    conferencePaperTitle?: string;
    conferenceType?: 'International' | 'National' | 'Regional/State';
    conferenceVenue?: 'India' | 'Indian Subcontinent' | 'South Korea, Japan, Australia and Middle East' | 'Europe' | 'African/South American/North American';
    presentationType?: 'Oral' | 'Poster';
    govtFundingRequestProofUrl?: string;
    registrationFee?: number;
    travelExpenses?: number;
};
