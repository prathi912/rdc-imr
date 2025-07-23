import { PageHeader } from '@/components/page-header';
import { ConferenceForm } from '@/components/incentives/conference-form';

export default function ConferenceClaimPage() {
  return (
    <div className="container mx-auto max-w-5xl py-10">
      <PageHeader
        title="Incentive Claim for Conference Presentations"
        description="Fill out the form below to apply for assistance for paper presentations, workshops, etc."
        backButtonHref="/dashboard/incentive-claim"
        backButtonText="Back to Claim Types"
      />
      <div className="mt-8">
        <ConferenceForm />
      </div>
    </div>
  );
}
