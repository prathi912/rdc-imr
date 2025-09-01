
'use client';

import { PageHeader } from '@/components/page-header';
import { MembershipForm } from '@/components/incentives/membership-form';

export default function MembershipClaimPage() {
  return (
    <div className="container mx-auto max-w-5xl py-10">
      <PageHeader
        title="Incentive Claim for Professional Body Membership"
        description="Fill out the form below to apply for an incentive for your professional body membership fee."
        backButtonHref="/dashboard/incentive-claim"
        backButtonText="Back to Claim Types"
      />
      <div className="mt-8">
        <MembershipForm />
      </div>
    </div>
  );
}
