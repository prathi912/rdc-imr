
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This page has been merged into the Manage Users page.
// This component now just redirects any old links to the new location.
export default function DeprecatedModuleManagementPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/dashboard/manage-users');
    }, [router]);

    return null; // Render nothing while redirecting
}
