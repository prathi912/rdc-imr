import { PageHeader } from '@/components/page-header';
import { PatentForm } from '@/components/incentives/patent-form';

export default function PatentClaimPage() {
  return (
    <div className="container mx-auto max-w-5xl py-10">
      <PageHeader
        title="Incentive Claim for Patents"
        description="Fill out the form below to apply for an incentive for your filed, published, or granted patent."
        backButtonHref="/dashboard/incentive-claim"
        backButtonText="Back to Claim Types"
      />
      <div className="mt-8">
        <PatentForm />
      </div>
    </div>
  );
}
