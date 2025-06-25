import { SubmissionForm } from '@/components/projects/submission-form';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function NewSubmissionPage() {
  return (
    <div className="container mx-auto max-w-4xl py-10">
      <Link href="/dashboard">
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
      </Link>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Project Submission</h1>
          <p className="text-muted-foreground">Please fill out the form below to submit your research project.</p>
        </div>
        <SubmissionForm />
      </div>
    </div>
  );
}
