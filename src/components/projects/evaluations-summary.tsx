'use client';

import type { Project, Evaluation } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UserCheck, UserX } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

interface EvaluationsSummaryProps {
  project: Project;
  evaluations: Evaluation[];
}

const getOverallScore = (scores: Evaluation['scores']) => {
    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    return (total / (Object.keys(scores).length * 10)) * 100; // As percentage
}

export function EvaluationsSummary({ project, evaluations }: EvaluationsSummaryProps) {
  return (
    <Card className="mt-8">
      <CardHeader>
        <div className="flex items-center gap-2">
            <UserCheck className="h-6 w-6" />
            <CardTitle>Evaluations Summary</CardTitle>
        </div>
        <CardDescription>
          {evaluations.length} evaluations submitted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {evaluations.length > 0 ? (
             <div className="space-y-4">
                {evaluations.map((evaluation) => (
                    <div key={evaluation.evaluatorUid} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start">
                           <div>
                             <p className="font-semibold">{evaluation.evaluatorName}</p>
                             <p className="text-xs text-muted-foreground">{new Date(evaluation.evaluationDate).toLocaleDateString()}</p>
                           </div>
                           <Badge variant="secondary">Score: {getOverallScore(evaluation.scores).toFixed(0)}%</Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-center">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger><div className="font-semibold text-sm">Relevance<p>{evaluation.scores.relevance}/10</p></div></TooltipTrigger>
                                    <TooltipContent>Relevance Score</TooltipContent>
                                </Tooltip>
                                 <Tooltip>
                                    <TooltipTrigger><div className="font-semibold text-sm">Methodology<p>{evaluation.scores.methodology}/10</p></div></TooltipTrigger>
                                    <TooltipContent>Methodology Score</TooltipContent>
                                </Tooltip>
                                 <Tooltip>
                                    <TooltipTrigger><div className="font-semibold text-sm">Feasibility<p>{evaluation.scores.feasibility}/10</p></div></TooltipTrigger>
                                    <TooltipContent>Feasibility Score</TooltipContent>
                                </Tooltip>
                                 <Tooltip>
                                    <TooltipTrigger><div className="font-semibold text-sm">Innovation<p>{evaluation.scores.innovation}/10</p></div></TooltipTrigger>
                                    <TooltipContent>Innovation Score</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                        <p className="text-sm mt-4 text-muted-foreground border-t pt-3">
                            <span className="font-semibold text-foreground">Comments:</span> {evaluation.comments}
                        </p>
                    </div>
                ))}
             </div>
        ) : (
             <div className="text-center py-8 text-muted-foreground">
                <UserX className="mx-auto h-12 w-12" />
                <p className="mt-4">No evaluations have been submitted yet.</p>
             </div>
        )}
      </CardContent>
    </Card>
  );
}
