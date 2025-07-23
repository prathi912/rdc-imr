import { PageHeader } from '@/components/page-header';
import { SubmissionForm } from '@/components/projects/submission-form';
import { Guidelines } from '@/components/projects/guidelines';

export default function NewSubmissionPage() {
  return (
    <div className="container mx-auto max-w-4xl py-10">
       <PageHeader
        title="New Project Submission"
        description="Please fill out the form below to submit your research project. You can save your progress as a draft at any time."
      />
      <div className="mt-8 space-y-8">
        <Guidelines />
        <SubmissionForm />
      </div>
    </div>
  );
}
