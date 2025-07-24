'use client';

import { PageHeader } from '@/components/page-header';
import { EmrCalendar } from '@/components/emr/emr-calendar';
import type { User } from '@/types';
import { useState, useEffect } from 'react';

export default function EmrCalendarPage() {
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
    }, []);

    if (!user) {
        return null; // or a loading spinner
    }

    return (
        <div className="container mx-auto py-10">
            <PageHeader
                title="EMR Funding Opportunities"
                description="Browse and register for externally funded research calls."
            />
            <div className="mt-8">
                <EmrCalendar user={user} />
            </div>
        </div>
    );
}
