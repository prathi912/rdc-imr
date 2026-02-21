'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { IncentiveClaim, EmrInterest, Author } from '@/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CircleHelp, Sigma, Percent, Waypoints, Target, Trophy, GraduationCap, FileText, Star } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

type CalculationDetails = {
    base: number;
    multiplier?: number;
    quartileMultiplier?: number;
    authorMultiplier?: number;
    applicantMultiplier?: number;
    rolePoints?: number;
};

export interface ArpsData {
    publications: { 
        raw: number; 
        weighted: number; 
        final: number; 
        contributingClaims: { 
            claim: IncentiveClaim, 
            score: number,
            calculation: CalculationDetails
        }[] 
    };
    patents: { 
        raw: number; 
        weighted: number; 
        final: number; 
        contributingClaims: { 
            claim: IncentiveClaim, 
            score: number,
            calculation: CalculationDetails
        }[] 
    };
    emr: { 
        raw: number; 
        weighted: number; 
        final: number; 
        contributingProjects: { 
            project: EmrInterest, 
            score: number,
            calculation: CalculationDetails
        }[] 
    };
    totalArps: number;
    grade: string;
}

interface ArpsResultsDisplayProps {
    results: ArpsData;
}

const FormulaCard = ({ title, steps, result, icon: Icon }: { title: string, steps: { label: string, value: string }[], result: { label: string, value: string }, icon: React.ElementType }) => (
    <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5"/> {title}</CardTitle>
        </CardHeader>
        <CardContent>
            <Table>
                <TableBody>
                    {steps.map((step, i) => (
                        <TableRow key={i}>
                            <TableCell>{step.label}</TableCell>
                            <TableCell className="text-right font-mono">{step.value}</TableCell>
                        </TableRow>
                    ))}
                    <TableRow className="text-base font-bold bg-muted/50">
                        <TableCell>{result.label}</TableCell>
                        <TableCell className="text-right font-mono">{result.value}</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </CardContent>
    </Card>
);

const getClaimant = (claim: IncentiveClaim): Author | undefined => {
    return claim.authors?.find(a => a.uid === claim.uid);
};

export function ArpsResultsDisplay({ results }: ArpsResultsDisplayProps) {
    const { publications, patents, emr, totalArps, grade } = results;

    const getGradeInfo = (g: string) => {
        if (g.startsWith('SEE')) return { label: 'Significantly Exceeds Expectations', variant: 'default' as const, className: 'bg-green-600 hover:bg-green-700' };
        if (g.startsWith('EE')) return { label: 'Exceeds Expectations', variant: 'default' as const, className: 'bg-blue-600 hover:bg-blue-700' };
        if (g.startsWith('ME')) return { label: 'Meets Expectations', variant: 'secondary' as const };
        if (g.startsWith('DME')) return { label: 'Does Not Meet Expectations', variant: 'destructive' as const };
        return { label: 'N/A', variant: 'outline' as const };
    };
    const gradeInfo = getGradeInfo(grade);
    const gradeMessage = grade.includes('(') ? grade.substring(grade.indexOf('(')) : '';
    
    const totalRawScore = publications.raw + patents.raw + emr.raw;
    const totalWeightedScore = publications.weighted + patents.weighted + emr.weighted;

    return (
        <div className="mt-8 space-y-12">
            {/* --- Publications Section --- */}
            <div className="space-y-6">
                <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FileText className="h-6 w-6"/> I. Publications Scoring Breakdown</h2>
                <Card>
                    <CardHeader>
                        <CardTitle>Step 1: Individual Publication Raw Scores</CardTitle>
                        <CardDescription>Each approved publication is scored based on its type, journal quality, and your role as an author. The formula is: <br/> <code className="font-mono text-sm bg-muted p-1 rounded-sm">Raw Score = Base Points × Quartile Multiplier × Author Multiplier</code></CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {publications.contributingClaims.length > 0 ? publications.contributingClaims.map(({ claim, score, calculation }) => (
                            <div key={claim.id} className="p-4 border rounded-lg bg-background/50">
                                <h4 className="font-semibold">{claim.paperTitle || claim.publicationTitle}</h4>
                                <div className="overflow-x-auto">
                                    <Table className="mt-2 text-sm whitespace-nowrap">
                                        <TableBody>
                                            <TableRow><TableCell className="w-[70%]">Base Points for article type '{claim.publicationType}'</TableCell><TableCell className="text-right font-mono">{calculation.base.toFixed(2)}</TableCell></TableRow>
                                            <TableRow><TableCell>× Quartile Multiplier for <strong>{claim.journalClassification}</strong></TableCell><TableCell className="text-right font-mono">{(calculation.multiplier ?? calculation.quartileMultiplier ?? 1).toFixed(2)}</TableCell></TableRow>
                                            <TableRow><TableCell>× Your Role Multiplier as <strong>{getClaimant(claim)?.role}</strong> (Position: {claim.authorPosition})</TableCell><TableCell className="text-right font-mono">{calculation.authorMultiplier?.toFixed(2)}</TableCell></TableRow>
                                            <TableRow className="font-bold border-t-2 border-primary/20"><TableCell>= Raw Score for this Publication</TableCell><TableCell className="text-right font-mono">{score.toFixed(2)}</TableCell></TableRow>
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        )) : <p className="text-muted-foreground text-center py-4">No contributing publications found in this period.</p>}
                    </CardContent>
                </Card>

                <FormulaCard
                    title="Step 2: Final Publication Score P(pub)"
                    icon={Target}
                    steps={[
                        { label: 'Sum of all Publication Raw Scores', value: publications.raw.toFixed(2) },
                        { label: '× Weightage (as per policy)', value: '× 0.50' },
                        { label: '= Weighted Score', value: `= ${publications.weighted.toFixed(2)}` },
                        { label: 'Maximum Score (Cap)', value: '50.00' },
                    ]}
                    result={{ label: 'Final Score P(pub) = min(Weighted Score, Cap)', value: publications.final.toFixed(2) }}
                />
            </div>

            {/* --- Patents Section --- */}
            <div className="space-y-6">
                <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Trophy className="h-6 w-6"/> II. Patent Scoring Breakdown</h2>
                <Card>
                    <CardHeader>
                        <CardTitle>Step 1: Individual Patent Raw Scores</CardTitle>
                        <CardDescription>Each patent is scored based on its status and the University's applicant role. The formula is: <br/> <code className="font-mono text-sm bg-muted p-1 rounded-sm">Raw Score = Base Points × Applicant Multiplier</code></CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {patents.contributingClaims.length > 0 ? patents.contributingClaims.map(({ claim, score, calculation }) => (
                            <div key={claim.id} className="p-4 border rounded-lg bg-background/50">
                                <h4 className="font-semibold">{claim.patentTitle}</h4>
                                <Table className="mt-2 text-sm"><TableBody>
                                    <TableRow><TableCell className="w-[70%]">Base Points for status '<strong>{claim.currentStatus} ({claim.patentLocale})</strong>'</TableCell><TableCell className="text-right font-mono">{calculation.base.toFixed(2)}</TableCell></TableRow>
                                    <TableRow><TableCell>× PU Applicant Multiplier (<strong>{claim.isPuSoleApplicant ? 'Sole' : 'Joint'} Applicant</strong>)</TableCell><TableCell className="text-right font-mono">{calculation.applicantMultiplier?.toFixed(2)}</TableCell></TableRow>
                                    <TableRow className="font-bold border-t-2 border-primary/20"><TableCell>= Raw Score for this Patent</TableCell><TableCell className="text-right font-mono">{score.toFixed(2)}</TableCell></TableRow>
                                </TableBody></Table>
                            </div>
                        )) : <p className="text-muted-foreground text-center py-4">No contributing patents found in this period.</p>}
                    </CardContent>
                </Card>
                <FormulaCard
                    title="Step 2: Final Patent Score P(patent)"
                    icon={Target}
                    steps={[
                        { label: 'Sum of all Patent Raw Scores', value: patents.raw.toFixed(2) },
                        { label: '× Weightage (as per policy)', value: '× 0.15' },
                        { label: '= Weighted Score', value: `= ${patents.weighted.toFixed(2)}` },
                        { label: 'Maximum Score (Cap)', value: '15.00' },
                    ]}
                    result={{ label: 'Final Score P(patent) = min(Weighted Score, Cap)', value: patents.final.toFixed(2) }}
                />
            </div>

            {/* --- EMR Section --- */}
            <div className="space-y-6">
                <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Star className="h-6 w-6"/> III. EMR Project Scoring Breakdown</h2>
                <Card>
                    <CardHeader>
                        <CardTitle>Step 1: Individual EMR Project Raw Scores</CardTitle>
                        <CardDescription>Each sanctioned project is awarded points based on the funding amount and your role. The formula is: <br/> <code className="font-mono text-sm bg-muted p-1 rounded-sm">Raw Score = Role Points</code></CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {emr.contributingProjects.length > 0 ? emr.contributingProjects.map(({ project, score }) => (
                            <div key={project.id} className="p-4 border rounded-lg bg-background/50">
                                <h4 className="font-semibold">{project.callTitle}</h4>
                                <Table className="mt-2 text-sm"><TableBody>
                                    <TableRow><TableCell className="w-[70%]">Points for role as <strong>{project.userId === project.userId ? 'PI' : 'Co-PI'}</strong> with sanctioned {project.durationAmount}</TableCell><TableCell className="text-right font-mono">{score.toFixed(2)}</TableCell></TableRow>
                                    <TableRow className="font-bold border-t-2 border-primary/20"><TableCell>= Raw Score for this Project</TableCell><TableCell className="text-right font-mono">{score.toFixed(2)}</TableCell></TableRow>
                                </TableBody></Table>
                            </div>
                        )) : <p className="text-muted-foreground text-center py-4">No contributing EMR projects found in this period.</p>}
                    </CardContent>
                </Card>
                <FormulaCard
                    title="Step 2: Final EMR Score P(EMR)"
                    icon={Target}
                    steps={[
                        { label: 'Sum of all EMR Raw Scores', value: emr.raw.toFixed(2) },
                        { label: '× Weightage (as per policy)', value: '× 0.15' },
                        { label: '= Weighted Score', value: `= ${emr.weighted.toFixed(2)}` },
                        { label: 'Maximum Score (Cap)', value: '15.00' },
                    ]}
                    result={{ label: 'Final Score P(EMR) = min(Weighted Score, Cap)', value: emr.final.toFixed(2) }}
                />
            </div>

            {/* Grade Assignment */}
            <div className="space-y-6">
                <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2"><GraduationCap className="h-6 w-6"/> IV. Grade Assignment</h2>
                <Card>
                    <CardHeader>
                        <CardTitle>Final ARPS Score & Grade</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-center gap-8">
                            <div className="text-center">
                                <p className="text-6xl font-bold">{totalArps.toFixed(2)}</p>
                                <p className="text-muted-foreground">Total ARPS</p>
                            </div>
                            <div className="text-center">
                                <Badge variant={gradeInfo.variant} className={cn("text-4xl font-bold px-6 py-2", gradeInfo.className)}>{gradeInfo.label}</Badge>
                                {gradeMessage && <p className="text-sm text-muted-foreground mt-2">{gradeMessage}</p>}
                            </div>
                        </div>
                        <Separator className="my-6" />
                        <p className="text-sm text-muted-foreground">The final ARPS score is used to determine the performance grade based on the following thresholds:</p>
                        <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-muted-foreground">
                            <li><strong>&gt;= 80:</strong> SEE (Significantly Exceeds Expectations)</li>
                            <li><strong>50 - 79.99:</strong> EE (Exceeds Expectations)</li>
                            <li><strong>30 - 49.99:</strong> ME (Meets Expectations)</li>
                            <li><strong>&lt; 30:</strong> DME (Does Not Meet Expectations)</li>
                        </ul>
                    </CardContent>
                </Card>
            </div>
            
            {/* How ARPS is Formed - Moved to the end */}
            <div className="space-y-6">
                <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Sigma className="h-6 w-6"/> V. Final ARPS Calculation Summary</h2>
                <FormulaCard
                    title="Final ARPS Calculation"
                    icon={Sigma}
                    steps={[
                        { label: 'Total Raw Score (Publications + Patents + EMR)', value: totalRawScore.toFixed(2) },
                        { label: 'Total Weighted Score (Before Capping)', value: totalWeightedScore.toFixed(2) },
                        { label: 'Capped Publication Score: P(pub)', value: publications.final.toFixed(2) },
                        { label: '+ Capped Patent Score: P(patent)', value: `+ ${patents.final.toFixed(2)}` },
                        { label: '+ Capped EMR Project Score: P(EMR)', value: `+ ${emr.final.toFixed(2)}` },
                    ]}
                    result={{ label: '= Final ARPS', value: totalArps.toFixed(2) }}
                />
            </div>

        </div>
    );
}
