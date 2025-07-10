
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AdminDashboard } from '@/components/dashboard/admin-dashboard';
import { FacultyDashboard } from '@/components/dashboard/faculty-dashboard';
import type { User } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { PRINCIPAL_EMAILS } from '@/lib/constants';

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
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
  }, [router]);
  
  if (!user || user.role === 'Evaluator') {
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

  const adminRoles: User['role'][] = ['admin', 'CRO', 'Super-admin'];
  // A user is a standard faculty if their role is 'faculty' AND their designation is NOT 'Principal' or 'HOD'.
  const isStandardFaculty = user.role === 'faculty' && user.designation !== 'Principal' && user.designation !== 'HOD';
  // An admin view is for admin roles OR for Principals/HODs.
  const showAdminView = adminRoles.includes(user.role) || user.designation === 'Principal' || user.designation === 'HOD';


  return (
    <div className="animate-in fade-in-0 duration-500">
      {showAdminView && <AdminDashboard />}
      {isStandardFaculty && <FacultyDashboard user={user} />}
    </div>
  );
}
