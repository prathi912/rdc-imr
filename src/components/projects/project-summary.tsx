'use client';

import { useState } from 'react';
import { Bot, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getProjectSummary } from '@/app/actions';
import { type Project } from '@/types';
import { useToast } from '@/hooks/use-toast';

interface ProjectSummaryProps {
  project: Project;
}

export function ProjectSummary({ project }: ProjectSummaryProps) {
  const [summary, setSummary] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  const handleGenerateSummary = async () => {
    setIsLoading(true);
    setError('');
    setSummary('');

    const input = {
      title: project.title,
      abstract: project.abstract,
      type: project.type,
      faculty: project.faculty,
      institute: project.institute,
      departmentName: project.departmentName,
      teamInfo: project.teamInfo,
      timelineAndOutcomes: project.timelineAndOutcomes,
      sdgGoals: project.sdgGoals,
    };

    const result = await getProjectSummary(input);

    if (result.success) {
      setSummary(result.summary);
    } else {
      setError(result.error || 'An unknown error occurred.');
       toast({
        variant: "destructive",
        title: "Error",
        description: result.error || 'An unknown error occurred.',
      })
    }
    setIsLoading(false);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" title="Generate AI Summary">
          <Bot className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI Project Summary</DialogTitle>
          <DialogDescription>
            AI-generated summary for: <span className="font-semibold">{project.title}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="my-4 space-y-4">
          {!summary && !isLoading && !error && (
            <div className="text-center p-8">
              <Button onClick={handleGenerateSummary}>
                <Bot className="mr-2 h-4 w-4" />
                Generate Summary
              </Button>
            </div>
          )}
          {isLoading && (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-4 text-muted-foreground">Generating summary...</p>
            </div>
          )}
          {error && (
             <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {summary && (
            <div className="prose prose-sm dark:prose-invert max-w-none rounded-md border bg-muted/50 p-4 text-sm">
                {summary}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setSummary('')} disabled={isLoading || !summary}>
            Clear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
