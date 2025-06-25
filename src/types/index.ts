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
  status: 'Under Review' | 'Approved' | 'Rejected' | 'In Progress' | 'Completed';
  teamInfo: string;
  timelineAndOutcomes: string;
  submissionDate: string;
};
