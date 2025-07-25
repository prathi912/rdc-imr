
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AdminDashboard } from '@/components/dashboard/admin-dashboard';
import { FacultyDashboard } from '@/components/dashboard/faculty-dashboard';
import { WelcomeTutorial } from '@/components/dashboard/welcome-tutorial';
import type { User } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser) as User;
      setUser(parsedUser);

      // Redirect Evaluators to their specific dashboard
      if (parsedUser.role === 'Evaluator') {
        router.replace('/dashboard/evaluator-dashboard');
      }
    } else {
      router.replace('/');
    }
    setLoading(false);
  }, [router]);
  
  if (loading || !user || user.role === 'Evaluator') {
      return (
          <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
              </div>
              <Skeleton className="h-96" />
          </div>
      )
  }

  const adminRoles: User['role'][] = ['admin', 'Super-admin'];
  // A user is a standard faculty if their role is 'faculty' AND their designation is NOT 'Principal' or 'HOD'.
  const isStandardFaculty = user.role === 'faculty' && user.designation !== 'Principal' && user.designation !== 'HOD';
  // An admin view is for admin roles OR for Principals/HODs.
  const showAdminView = adminRoles.includes(user.role) || user.designation === 'Principal' || user.designation === 'HOD' || user.role === 'CRO';
  // A faculty view is for standard faculty OR for CROs (who are also faculty).
  const showFacultyView = isStandardFaculty || user.role === 'CRO';


  return (
    <div className="animate-in fade-in-0 duration-500">
      {user && user.hasCompletedTutorial === false && <WelcomeTutorial user={user} />}
      {showAdminView && <AdminDashboard />}
      {showFacultyView && <FacultyDashboard user={user} />}
    </div>
  );
}
