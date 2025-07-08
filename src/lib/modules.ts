
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
  { id: 'manage-incentive-claims', label: 'Manage Incentive Claims' },
  { id: 'bulk-upload', label: 'Bulk Upload' },
  { id: 'module-management', label: 'Module Management' },
  { id: 'system-health', label: 'System Health' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'settings', label: 'Settings' },
];

// Define module sets for clarity and to avoid unintended inheritance issues.
const coreModules = ['dashboard', 'notifications', 'settings'];

const basicFacultyModules = [...coreModules, 'new-submission', 'my-projects'];
const fullFacultyModules = [...basicFacultyModules, 'incentive-claim', 'evaluator-dashboard', 'my-evaluations'];

const croAdminModules = ['schedule-meeting', 'pending-reviews', 'completed-reviews', 'all-projects', 'analytics', 'manage-users', 'manage-incentive-claims'];
const generalAdminModules = ['system-health', 'bulk-upload'];
const superAdminOnlyModules = ['module-management'];


// Define default permissions for each role.
// New sign-ups get the basic 'faculty' set. Admins/CROs get a comprehensive set.
const facultyDefaults = basicFacultyModules;
const croDefaults = [...new Set([...fullFacultyModules, ...croAdminModules])];
const adminDefaults = [...new Set([...croDefaults, ...generalAdminModules])];
const superAdminDefaults = [...new Set([...adminDefaults, ...superAdminOnlyModules])];

export function getDefaultModulesForRole(role: User['role']): string[] {
  switch (role) {
    case 'faculty':
      return facultyDefaults;
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
