
'use client';

import { useMemo } from 'react';
import type { Project, Evaluation, User } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UserCheck, UserX, ThumbsUp, ThumbsDown, History } from 'lucide-react';
import { Badge } from '../ui/badge';

interface EvaluationsSummaryProps {
  project: Project;
  evaluations: Evaluation[];
  currentUser: User;
}

const getRecommendationBadge = (recommendation: Evaluation['recommendation']) => {
    switch (recommendation) {
        case 'Recommended':
            return <Badge variant="default" className="bg-green-600 hover:bg-green-700"><ThumbsUp className="h-4 w-4 mr-1"/> Recommended</Badge>;
        case 'Not Recommended':
            return <Badge variant="destructive"><ThumbsDown className="h-4 w-4 mr-1"/> Not Recommended</Badge>;
        case 'Revision Is Needed':
            return <Badge variant="secondary" className="bg-yellow-500 text-black hover:bg-yellow-600"><History className="h-4 w-4 mr-1"/> Revision Is Needed</Badge>;
        default:
            return <Badge variant="outline">No Recommendation</Badge>;
    }
}

export function EvaluationsSummary({ project, evaluations, currentUser }: EvaluationsSummaryProps) {
    const isAdmin = ['Super-admin', 'admin', 'CRO'].includes(currentUser.role);
    const isEvaluator = currentUser.role === 'Evaluator';

    const evaluationsToShow = useMemo(() => {
        if (isAdmin) {
            return evaluations; // Admins see all
        }
        if (isEvaluator) {
            // Evaluators only see their own
            return evaluations.filter(e => e.evaluatorUid === currentUser.uid);
        }
        return []; // Applicants see none
    }, [evaluations, currentUser, isAdmin, isEvaluator]);

    const recommendationCounts = useMemo(() => {
        // Admins see a summary of all evaluations
        const source = isAdmin ? evaluations : evaluationsToShow;
        return source.reduce((acc, evaluation) => {
            acc[evaluation.recommendation] = (acc[evaluation.recommendation] || 0) + 1;
            return acc;
        }, {} as Record<Evaluation['recommendation'], number>);
    }, [evaluations, evaluationsToShow, isAdmin]);

    const summaryText = Object.entries(recommendationCounts)
        .map(([key, value]) => `${value} ${key}`)
        .join(', ');

  return (
    <Card className="mt-8">
      <CardHeader>
        <div className="flex items-center gap-2">
            <UserCheck className="h-6 w-6" />
            <CardTitle>Evaluations Summary</CardTitle>
        </div>
        <CardDescription>
          {isAdmin 
            ? `${evaluations.length} total evaluations submitted.`
            : 'Your submitted evaluation for this project.'
          }
          {isAdmin && summaryText && <span className="font-semibold text-primary"> | {summaryText}</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {evaluationsToShow.length > 0 ? (
             <div className="space-y-4">
                {evaluationsToShow.map((evaluation) => (
                    <div key={evaluation.evaluatorUid} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start">
                           <div>
                             <p className="font-semibold">{evaluation.evaluatorName}</p>
                             <p className="text-xs text-muted-foreground">{new Date(evaluation.evaluationDate).toLocaleDateString()}</p>
                           </div>
                           {getRecommendationBadge(evaluation.recommendation)}
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
                <p className="mt-4">
                  {isAdmin ? 'No evaluations have been submitted yet.' : 'Your evaluation has not been submitted yet.'}
                </p>
             </div>
        )}
      </CardContent>
    </Card>
  );
}
