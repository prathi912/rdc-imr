
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This page is deprecated. The profile setup is now at /profile-setup.
// This component just redirects any old links to the new location.
export default function DeprecatedProfileSetupPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/profile-setup');
    }, [router]);

    return null; // Render nothing while redirecting
}
