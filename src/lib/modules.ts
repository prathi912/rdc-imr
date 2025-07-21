

import type { User } from '@/types';

export const ALL_MODULES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'new-submission', label: 'New Submission' },
  { id: 'my-projects', label: 'My Projects' },
  { id: 'emr-calendar', label: 'EMR Calendar' },
  { id: 'incentive-claim', label: 'Incentive Claims' },
  { id: 'evaluator-dashboard', label: 'IMR Evaluation Queue' },
  { id: 'my-evaluations', label: 'My IMR Evaluations' },
  { id: 'emr-evaluations', label: 'EMR Evaluations' },
  { id: 'schedule-meeting', label: 'Schedule Meeting' },
  { id: 'pending-reviews', label: 'Pending Reviews' },
  { id: 'completed-reviews', label: 'Completed Reviews' },
  { id: 'all-projects', label: 'All Projects' },
  { id: 'emr-management', label: 'EMR Management' },
  { id: 'emr-logs', label: 'EMR Logs'},
  { id: 'analytics', label: 'Analytics' },
  { id: 'manage-users', label: 'Manage Users' },
  { id: 'manage-institutes', label: 'Manage Institutes' },
  { id: 'manage-incentive-claims', label: 'Manage Incentive Claims' },
  { id: 'bulk-upload', label: 'Bulk Upload' },
  { id: 'module-management', label: 'Module Management' },
  { id: 'system-health', label: 'System Health' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'settings', label: 'Settings' },
];

const coreModules = ['dashboard', 'notifications', 'settings', 'emr-calendar'];
const facultyCoreModules = ['new-submission', 'my-projects'];
const hierarchyCoreModules = ['analytics'];

const facultyDefaults = [...coreModules, ...facultyCoreModules];
const croDefaults = [...coreModules, ...facultyCoreModules, 'all-projects', 'emr-evaluations'];
const adminDefaults = [...croDefaults, 'schedule-meeting', 'pending-reviews', 'completed-reviews', 'analytics', 'manage-users', 'system-health', 'bulk-upload', 'emr-logs', 'emr-management'];
const superAdminDefaults = [...adminDefaults, 'module-management', 'manage-institutes'];

// Default modules for special designations who are otherwise 'faculty' role
const principalDefaults = [...coreModules, ...hierarchyCoreModules, 'all-projects', 'emr-logs'];
const hodDefaults = [...coreModules, ...hierarchyCoreModules, 'all-projects','emr-logs'];

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
    return [...coreModules, 'evaluator-dashboard', 'my-evaluations', 'emr-evaluations'];
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
