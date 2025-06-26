'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, runTransaction } from 'firebase/firestore';
import type { Project, User, Evaluation } from '@/types';
import { getEvaluationPrompts } from '@/app/actions';
import { Loader2, Wand2 } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';

interface EvaluationFormProps {
  project: Project;
  user: User;
  onUpdate: (updatedProject: Project) => void;
}

const evaluationSchema = z.object({
  relevance: z.number().min(1).max(10),
  methodology: z.number().min(1).max(10),
  feasibility: z.number().min(1).max(10),
  innovation: z.number().min(1).max(10),
  comments: z.string().min(20, 'Comments must be at least 20 characters.'),
});

type EvaluationFormData = z.infer<typeof evaluationSchema>;

export function EvaluationForm({ project, user, onUpdate }: EvaluationFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prompts, setPrompts] = useState<any>(null);
  const [loadingPrompts, setLoadingPrompts] = useState(true);

  const existingEvaluation = project.evaluations?.find(e => e.evaluatorUid === user.uid);

  const form = useForm<EvaluationFormData>({
    resolver: zodResolver(evaluationSchema),
    defaultValues: {
      relevance: existingEvaluation?.scores.relevance || 5,
      methodology: existingEvaluation?.scores.methodology || 5,
      feasibility: existingEvaluation?.scores.feasibility || 5,
      innovation: existingEvaluation?.scores.innovation || 5,
      comments: existingEvaluation?.comments || '',
    },
  });

  useEffect(() => {
    async function fetchPrompts() {
      setLoadingPrompts(true);
      const result = await getEvaluationPrompts({ title: project.title, abstract: project.abstract });
      if (result.success) {
        setPrompts(result.prompts);
      } else {
        toast({ variant: 'destructive', title: 'AI Error', description: 'Could not load AI evaluation prompts.' });
      }
      setLoadingPrompts(false);
    }
    fetchPrompts();
  }, [project.title, project.abstract, toast]);

  const handleSubmit = async (values: EvaluationFormData) => {
    setIsSubmitting(true);
    try {
      const projectRef = doc(db, 'projects', project.id);
      
      const newEvaluation: Evaluation = {
        evaluatorUid: user.uid,
        evaluatorName: user.name,
        evaluationDate: new Date().toISOString(),
        scores: {
          relevance: values.relevance,
          methodology: values.methodology,
          feasibility: values.feasibility,
          innovation: values.innovation,
        },
        comments: values.comments,
      };
      
      await runTransaction(db, async (transaction) => {
        const projectDoc = await transaction.get(projectRef);
        if (!projectDoc.exists()) {
          throw "Project document does not exist!";
        }
        
        const currentData = projectDoc.data();
        const currentEvaluations = currentData.evaluations || [];
        
        // Remove any previous evaluation from this user
        const updatedEvaluations = currentEvaluations.filter(
            (e: Evaluation) => e.evaluatorUid !== user.uid
        );
        
        // Add the new evaluation
        updatedEvaluations.push(newEvaluation);
        
        transaction.update(projectRef, { evaluations: updatedEvaluations });
      });

      // Manually update local state to reflect the change for the UI
      const updatedLocalEvaluations = [
          ...(project.evaluations?.filter(e => e.evaluatorUid !== user.uid) || []),
          newEvaluation
      ];

      onUpdate({ ...project, evaluations: updatedLocalEvaluations });
      toast({ title: 'Success', description: 'Your evaluation has been submitted.' });

    } catch (error) {
      console.error("Error submitting evaluation in transaction: ", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to submit evaluation. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const ScoreField = ({ name, label, prompt }: { name: keyof EvaluationFormData, label: string, prompt: string | null }) => (
    <FormField
      control={form.control}
      name={name as any}
      render={({ field }) => (
        <FormItem>
          <div className="flex justify-between items-center">
            <FormLabel>{label}</FormLabel>
            <span className="text-sm font-bold text-primary">{field.value} / 10</span>
          </div>
          {loadingPrompts ? <Skeleton className="h-5 w-3/4" /> : (prompt && <p className="text-xs text-muted-foreground italic">"{prompt}"</p>)}
          <FormControl>
            <Slider
              min={1}
              max={10}
              step={1}
              value={[field.value as number]}
              onValueChange={(vals) => field.onChange(vals[0])}
              disabled={isSubmitting}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Card className="mt-8 border-primary/50">
      <CardHeader>
        <div className="flex items-center gap-2">
            <Wand2 className="h-6 w-6" />
            <CardTitle>Submit Your Evaluation</CardTitle>
        </div>
        <CardDescription>{existingEvaluation ? 'You can update your previous evaluation below.' : 'Please provide your scores and comments for this project.'}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
            <ScoreField name="relevance" label="Relevance & Significance" prompt={prompts?.relevance} />
            <ScoreField name="methodology" label="Methodology & Research Design" prompt={prompts?.methodology} />
            <ScoreField name="feasibility" label="Feasibility (Timeline & Budget)" prompt={prompts?.feasibility} />
            <ScoreField name="innovation" label="Novelty & Innovation" prompt={prompts?.innovation} />
            
            <FormField
              control={form.control}
              name="comments"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Overall Comments</FormLabel>
                  <FormControl>
                    <Textarea rows={5} {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Submitting...' : (existingEvaluation ? 'Update Evaluation' : 'Submit Evaluation')}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
