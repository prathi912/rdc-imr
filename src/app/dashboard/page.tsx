'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AdminDashboard } from '@/components/dashboard/admin-dashboard';
import { FacultyDashboard } from '@/components/dashboard/faculty-dashboard';
import type { User } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';

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
  const isFaculty = user.role === 'faculty';

  return (
    <div className="transition-all duration-300">
      {adminRoles.includes(user.role) && <AdminDashboard />}
      {isFaculty && <FacultyDashboard user={user} />}
    </div>
  );
}
