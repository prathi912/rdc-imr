export type User = {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'faculty' | 'Evaluator' | 'CRO' | 'Super-admin';
  faculty?: string;
  institute?: string;
  department?: string;
  misId?: string;
  phoneNumber?: string;
  profileComplete?: boolean;
};

export type BankDetails = {
  accountHolderName: string;
  accountNumber: string;
  bankName: string;
  ifscCode: string;
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
  status: 'Submitted' | 'Under Review' | 'Approved' | 'Rejected' | 'In Progress' | 'Completed' | 'Pending Completion Approval';
  teamInfo: string;
  timelineAndOutcomes: string;
  submissionDate: string; // Should be ISO string
  grant?: GrantDetails;
  completionReportUrl?: string;
  completionSubmissionDate?: string; // ISO String
  evaluatedBy?: string[];
  meetingDetails?: {
    date: string;
    time: string;
    venue: string;
  };
};

export type Notification = {
  id: string;
  uid: string; // The user this notification is for
  projectId: string;
  title: string;
  createdAt: string; // ISO String
  isRead: boolean;
};
