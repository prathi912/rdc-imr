'use client';

import { PageHeader } from '@/components/page-header';
import { ScheduleMeetingForm } from '@/components/projects/schedule-meeting-form';

export default function ScheduleMeetingPage() {
  return (
    <div className="container mx-auto py-10">
      <PageHeader
        title="Schedule IMR Meeting"
        description="Select projects awaiting a meeting and assign a date, time, and evaluators."
      />
      <div className="mt-8">
        <ScheduleMeetingForm />
      </div>
    </div>
  );
}
