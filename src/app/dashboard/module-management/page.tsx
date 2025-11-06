
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import type { User } from '@/types';

export default function ModuleManagementPage() {
    const router = useRouter();
    const { toast } = useToast();

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const parsedUser: User = JSON.parse(storedUser);
            if (!parsedUser.allowedModules?.includes('module-management')) {
                toast({
                    title: 'Access Denied',
                    description: "You don't have permission to view this page.",
                    variant: 'destructive',
                });
                router.replace('/dashboard');
                return;
            }
             // The functionality is now in manage-users, so we redirect.
            router.replace('/dashboard/manage-users');
        } else {
            router.replace('/login');
        }
    }, [router, toast]);

    return null; // Render nothing while checking permissions and redirecting
}
