import type { User } from '@/types';

export const ALL_MODULES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'new-submission', label: 'New Submission' },
  { id: 'my-projects', label: 'My Projects' },
  { id: 'incentive-claim', label: 'Incentive Claims' },
  { id: 'evaluator-dashboard', label: 'Evaluation Queue' },
  { id: 'schedule-meeting', label: 'Schedule Meeting' },
  { id: 'pending-reviews', label: 'Pending Reviews' },
  { id: 'completed-reviews', label: 'Completed Reviews' },
  { id: 'all-projects', label: 'All Projects' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'manage-users', label: 'Manage Users' },
  { id: 'manage-incentive-claims', label: 'Manage Incentive Claims' },
  { id: 'module-management', label: 'Module Management' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'settings', label: 'Settings' },
];

const facultyModules = ['dashboard', 'new-submission', 'my-projects', 'incentive-claim', 'notifications', 'settings'];
const evaluatorModules = ['dashboard', 'evaluator-dashboard', 'notifications', 'settings'];
const croModules = [...new Set([...evaluatorModules, 'schedule-meeting', 'pending-reviews', 'completed-reviews', 'all-projects', 'analytics', 'manage-users', 'manage-incentive-claims'])];
const adminModules = [...croModules];
const superAdminModules = [...adminModules, 'module-management'];

export function getDefaultModulesForRole(role: User['role']): string[] {
  switch (role) {
    case 'faculty':
      return facultyModules;
    case 'Evaluator':
      return evaluatorModules;
    case 'CRO':
      return croModules;
    case 'admin':
      return adminModules;
    case 'Super-admin':
      return superAdminModules;
    default:
      return ['dashboard', 'notifications', 'settings'];
  }
}
