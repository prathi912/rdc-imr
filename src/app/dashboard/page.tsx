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
      setUser(JSON.parse(storedUser));
    } else {
      router.replace('/');
    }
  }, [router]);
  
  if (!user) {
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

  return (
    <div className="transition-all duration-300">
      {user.role === 'admin' && <AdminDashboard />}
      {user.role === 'faculty' && <FacultyDashboard user={user} />}
    </div>
  );
}
