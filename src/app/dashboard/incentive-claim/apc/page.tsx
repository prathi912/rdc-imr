import { PageHeader } from '@/components/page-header';
import { ApcForm } from '@/components/incentives/apc-form';

export default function ApcClaimPage() {
  return (
    <div className="container mx-auto max-w-5xl py-10">
      <PageHeader
        title="Incentive Claim for Seed Money (APC)"
        description="Fill out the form below to apply for reimbursement for Article Processing Charges."
        backButtonHref="/dashboard/incentive-claim"
        backButtonText="Back to Claim Types"
      />
      <div className="mt-8">
        <ApcForm />
      </div>
    </div>
  );
}
