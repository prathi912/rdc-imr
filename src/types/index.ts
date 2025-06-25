export type User = {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'faculty';
};

export type Project = {
  id: string;
  title: string;
  abstract: string;
  type: string;
  department: string;
  pi: string;
  pi_uid: string;
  status: 'Under Review' | 'Approved' | 'Rejected' | 'In Progress' | 'Completed';
  teamInfo: string;
  timelineAndOutcomes: string;
  submissionDate: string; // Should be ISO string
};

export type Notification = {
  id: string;
  uid: string; // The user this notification is for
  projectId: string;
  title: string;
  createdAt: string; // ISO String
  isRead: boolean;
};
