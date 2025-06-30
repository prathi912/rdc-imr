'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { initialLoadComplete } = useAuth();

  // This component doesn't really need to do anything beyond what AuthProvider already does
  // with its onAuthStateChanged listener.
  // It can act as a gate to show a loading screen until Firebase auth is initialized.
  // Or, we can rely on `loading` and `initialLoadComplete` from useAuth() directly in pages/layouts.

  // If you want a full-screen loader until Firebase auth is checked:
  if (!initialLoadComplete) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background z-[9999]">
        <LoadingSpinner size={48} />
      </div>
    );
  }

  return <>{children}</>;
}