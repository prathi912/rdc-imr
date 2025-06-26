import { PageHeader } from '@/components/page-header';
import { ScheduleMeetingForm } from '@/components/projects/schedule-meeting-form';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function ScheduleMeetingPage() {
  return (
    <div className="container mx-auto py-10">
      <PageHeader
        title="Schedule IMR Evaluation Meeting"
        description="Select projects and set a date, time, and venue for the presentation."
        showBackButton={false}
      />
      <div className="mt-8">
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <ScheduleMeetingForm />
        </Suspense>
      </div>
    </div>
  );
}
