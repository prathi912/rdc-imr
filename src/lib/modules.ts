import type { User } from '@/types';

export const ALL_MODULES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'ai-chat', label: 'AI Chat Agent'},
  { id: 'new-submission', label: 'New Submission' },
  { id: 'my-projects', label: 'My Projects' },
  { id: 'emr-calendar', label: 'EMR Calendar' },
  { id: 'incentive-claim', label: 'Incentive Claims' },
  { id: 'evaluator-dashboard', label: 'Evaluation Queue' },
  { id: 'my-evaluations', label: 'My IMR Evaluations' },
  { id: 'schedule-meeting', label: 'Schedule Meeting' },
  { id: 'pending-reviews', label: 'Pending Reviews' },
  { id: 'completed-reviews', label: 'Completed Reviews' },
  { id: 'all-projects', label: 'All Projects' },
  { id: 'emr-management', label: 'EMR Management' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'manage-users', label: 'Manage Users' },
  { id: 'manage-incentive-claims', label: 'Manage Incentive Claims' },
  { id: 'bulk-upload', label: 'Bulk Upload Projects' },
  { id: 'bulk-upload-papers', label: 'Bulk Upload Papers' },
  { id: 'bulk-upload-emr', label: 'Bulk Upload EMR Projects' },
  { id: 'module-management', label: 'Module Management' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'settings', label: 'Settings' },
];

const coreModules = ['dashboard', 'notifications', 'settings', 'emr-calendar'];
const facultyCoreModules = ['new-submission', 'my-projects'];
const hierarchyCoreModules = ['analytics'];

const facultyDefaults = [...coreModules, ...facultyCoreModules];
const croDefaults = [...coreModules, ...facultyCoreModules, 'all-projects'];
const adminDefaults = [...croDefaults, 'schedule-meeting', 'analytics', 'manage-users'];
const superAdminDefaults = [...adminDefaults, 'module-management', 'bulk-upload-papers', 'bulk-upload-emr'];

// Default modules for special designations who are otherwise 'faculty' role
const principalDefaults = [...coreModules, ...hierarchyCoreModules, 'all-projects'];
const hodDefaults = [...coreModules, ...hierarchyCoreModules, 'all-projects'];

export function getDefaultModulesForRole(role: User['role'], designation?: User['designation']): string[] {
  if (role === 'faculty') {
    if (designation === 'Principal') {
      return principalDefaults;
    }
    if (designation === 'HOD') {
      return hodDefaults;
    }
    return facultyDefaults;
  }
  
  if (role === 'Evaluator') {
    return [...coreModules, 'evaluator-dashboard', 'my-evaluations'];
  }
  
  switch (role) {
    case 'CRO':
      return croDefaults;
    case 'admin':
      return adminDefaults;
    case 'Super-admin':
      return superAdminDefaults;
    default:
      return coreModules;
  }
}
