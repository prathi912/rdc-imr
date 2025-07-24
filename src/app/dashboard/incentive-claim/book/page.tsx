
import { PageHeader } from '@/components/page-header';
import { BookForm } from '@/components/incentives/book-form';

export default function BookClaimPage() {
  return (
    <div className="container mx-auto max-w-5xl py-10">
      <PageHeader
        title="Incentive Claim for Books & Chapters"
        description="Fill out the form below to apply for an incentive for your published book or book chapter."
        backButtonHref="/dashboard/incentive-claim"
        backButtonText="Back to Claim Types"
      />
      <div className="mt-8">
        <BookForm />
      </div>
    </div>
  );
}
