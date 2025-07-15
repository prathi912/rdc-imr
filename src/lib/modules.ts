
import type { User } from '@/types';

export const ALL_MODULES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'new-submission', label: 'New Submission' },
  { id: 'my-projects', label: 'My Projects' },
  { id: 'incentive-claim', label: 'Incentive Claims' },
  { id: 'evaluator-dashboard', label: 'Evaluation Queue' },
  { id: 'my-evaluations', label: 'My Evaluations' },
  { id: 'schedule-meeting', label: 'Schedule Meeting' },
  { id: 'pending-reviews', label: 'Pending Reviews' },
  { id: 'completed-reviews', label: 'Completed Reviews' },
  { id: 'all-projects', label: 'All Projects' },
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

const coreModules = ['dashboard', 'notifications', 'settings'];
const facultyCoreModules = ['new-submission', 'my-projects'];
const hierarchyCoreModules = ['analytics'];

const facultyDefaults = [...coreModules, ...facultyCoreModules];
const croDefaults = [...coreModules, ...facultyCoreModules, 'all-projects'];
const adminDefaults = [...croDefaults, 'schedule-meeting', 'pending-reviews', 'completed-reviews', 'analytics', 'manage-users', 'system-health', 'bulk-upload'];
const superAdminDefaults = [...adminDefaults, 'module-management', 'manage-institutes'];

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
