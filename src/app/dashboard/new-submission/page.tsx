import { PageHeader } from '@/components/page-header';
import { SubmissionForm } from '@/components/projects/submission-form';

export default function NewSubmissionPage() {
  return (
    <div className="container mx-auto max-w-4xl py-10">
       <PageHeader
        title="New Project Submission"
        description="Please fill out the form below to submit your research project."
      />
      <div className="mt-8">
        <SubmissionForm />
      </div>
    </div>
  );
}
