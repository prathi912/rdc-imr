import { type Project, type User } from '@/types';

export const users: User[] = [
    { uid: 'admin-id', name: 'Pranav Rathi', email: 'rathipranav07@gmail.com', role: 'admin' },
    { uid: 'faculty-1', name: 'Dr. Alice Johnson', email: 'alice.j@paruluniversity.ac.in', role: 'faculty' },
    { uid: 'faculty-2', name: 'Dr. Charlie Brown', email: 'charlie.b@paruluniversity.ac.in', role: 'faculty' },
    { uid: 'faculty-3', name: 'Dr. Eve Davis', email: 'eve.d@paruluniversity.ac.in', role: 'faculty' },
    { uid: 'faculty-4', name: 'Dr. Frank Miller', email: 'frank.m@paruluniversity.ac.in', role: 'faculty' },
    { uid: 'faculty-5', name: 'Dr. Grace Lee', email: 'grace.l@paruluniversity.ac.in', role: 'faculty' },
    { uid: 'faculty-6', name: 'Dr. Henry Wilson', email: 'henry.w@paruluniversity.ac.in', role: 'faculty' },
    { uid: 'faculty-7', name: 'Dr. Ivy Green', email: 'ivy.g@paruluniversity.ac.in', role: 'faculty' },
];

export const projects: Project[] = [
    {
      id: 'proj-001',
      title: 'AI in Sustainable Agriculture',
      abstract: 'This project explores the application of machine learning models to optimize irrigation and reduce water consumption in large-scale farming.',
      department: 'Computer Science',
      pi: 'Dr. Alice Johnson',
      status: 'Under Review',
      type: 'Research',
      teamInfo: 'PI: Dr. Alice Johnson, Co-PI: Dr. Bob Williams, Students: Carol White, Dave Green',
      timelineAndOutcomes: '6-month project with expected publication in a top journal.',
      submissionDate: '2024-06-15'
    },
    {
      id: 'proj-002',
      title: 'Advanced Materials for Solar Cells',
      abstract: 'Development of new perovskite materials to enhance the efficiency and stability of next-generation solar panels.',
      department: 'Physics',
      pi: 'Dr. Charlie Brown',
      status: 'Approved',
      type: 'Development',
      teamInfo: 'PI: Dr. Charlie Brown',
      timelineAndOutcomes: '1-year project, aiming for a patent and a prototype.',
      submissionDate: '2024-05-20'
    },
    {
      id: 'proj-003',
      title: 'Biomarkers for Early Cancer Detection',
      abstract: 'Identifying novel protein biomarkers in blood samples for the early diagnosis of pancreatic cancer using proteomics.',
      department: 'Medical Research',
      pi: 'Dr. Eve Davis',
      status: 'Rejected',
      type: 'Clinical Trial',
      teamInfo: 'PI: Dr. Eve Davis',
      timelineAndOutcomes: '2-year clinical study with three phases.',
      submissionDate: '2024-05-10'
    },
    {
      id: 'proj-004',
      title: 'Quantum Computing Algorithms',
      department: 'Physics',
      pi: 'Dr. Frank Miller',
      status: 'Under Review',
      abstract: 'Developing new quantum algorithms for optimization problems.',
      type: 'Theoretical',
      teamInfo: 'PI: Dr. Frank Miller',
      timelineAndOutcomes: 'Aiming for a publication in Physical Review Letters.',
      submissionDate: '2024-06-01'
    },
    {
      id: 'proj-005',
      title: 'Urban Mobility Study',
      department: 'Civil Engineering',
      pi: 'Dr. Grace Lee',
      status: 'Completed',
      abstract: 'A study on traffic flow in metropolitan areas using sensor data.',
      type: 'Research',
      teamInfo: 'PI: Dr. Grace Lee',
      timelineAndOutcomes: 'Project completed and report submitted.',
      submissionDate: '2024-01-30'
    },
    {
      id: 'proj-006',
      title: 'Graphene-Based Water Filtration',
      department: 'Engineering',
      pi: 'Dr. Henry Wilson',
      status: 'Approved',
      type: 'Development',
      teamInfo: 'PI: Dr. Henry Wilson',
      timelineAndOutcomes: 'Prototype expected in 9 months.',
      submissionDate: '2024-04-22'
    },
    {
      id: 'proj-007',
      title: 'Natural Language Processing for Ancient Texts',
      department: 'Arts & Humanities',
      pi: 'Dr. Ivy Green',
      status: 'Approved',
      type: 'Research',
      teamInfo: 'PI: Dr. Ivy Green',
      timelineAndOutcomes: 'Digital archive and two papers.',
      submissionDate: '2024-03-15'
    },
    {
      id: 'proj-008',
      title: 'Machine Learning for Financial Forecasting',
      department: 'Computer Science',
      pi: 'Dr. Alice Johnson',
      status: 'Completed',
      type: 'Research',
      teamInfo: 'PI: Dr. Alice Johnson',
      timelineAndOutcomes: 'Model developed and back-tested.',
      submissionDate: '2023-12-10'
    },
    {
      id: 'proj-009',
      title: 'Study of Dark Matter',
      department: 'Physics',
      pi: 'Dr. Charlie Brown',
      status: 'In Progress',
      type: 'Theoretical',
      teamInfo: 'PI: Dr. Charlie Brown',
      timelineAndOutcomes: 'Ongoing analysis of telescope data.',
      submissionDate: '2024-02-18'
    },
    {
      id: 'proj-010',
      title: 'Gene Therapy for Cystic Fibrosis',
      department: 'Medical Research',
      pi: 'Dr. Eve Davis',
      status: 'Under Review',
      type: 'Clinical Trial',
      teamInfo: 'PI: Dr. Eve Davis',
      timelineAndOutcomes: 'Awaiting ethics board approval.',
      submissionDate: '2024-06-25'
    },
     {
      id: 'proj-011',
      title: 'Robotics in Manufacturing',
      department: 'Engineering',
      pi: 'Dr. Henry Wilson',
      status: 'In Progress',
      type: 'Development',
      teamInfo: 'PI: Dr. Henry Wilson, Students: Leo, Mia',
      timelineAndOutcomes: 'Developing a new robotic arm.',
      submissionDate: '2024-04-05'
    },
    {
      id: 'proj-012',
      title: 'The Philosophy of Artificial Intelligence',
      department: 'Arts & Humanities',
      pi: 'Dr. Ivy Green',
      status: 'Under Review',
      type: 'Research',
      teamInfo: 'PI: Dr. Ivy Green',
      timelineAndOutcomes: 'Book chapter submission.',
      submissionDate: '2024-06-28'
    },
];
