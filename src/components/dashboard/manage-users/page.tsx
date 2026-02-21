'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This file has been deprecated. The functionality has been moved to src/app/dashboard/manage-users/page.tsx
export default function DeprecatedPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/dashboard/manage-users');
    }, [router]);
    return null;
}
