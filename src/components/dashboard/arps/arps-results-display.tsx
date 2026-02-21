
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { IncentiveClaim, EmrInterest } from '@/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

export function ArpsResultsDisplay({ results }: ArpsResultsDisplayProps) {

    const getGradeVariant = (grade: string) => {
        switch (grade) {
            case 'SEE': return 'default';
            case 'EE': return 'default';
            case 'ME': return 'secondary';
            case 'DME': return 'destructive';
            default: return 'outline';
        }
    };
    
    const getClaimTitle = (claim: IncentiveClaim): string => {
        return claim.paperTitle || claim.publicationTitle || claim.patentTitle || claim.conferencePaperTitle || 'N/A';
    };

    return (
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <div className="lg:col-span-2 space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>ARPS Calculation Summary</CardTitle>
                        <CardDescription>Overall scores based on the policy.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Criterion</TableHead>
                                    <TableHead className="text-right">Raw Score</TableHead>
                                    <TableHead className="text-right">Weighted Score</TableHead>
                                    <TableHead className="text-right">Final Score (Capped)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell className="font-medium">Publications</TableCell>
                                    <TableCell className="text-right">{results.publications.raw.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">{results.publications.weighted.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-bold">{results.publications.final.toFixed(2)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="font-medium">Patents</TableCell>
                                    <TableCell className="text-right">{results.patents.raw.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">{results.patents.weighted.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-bold">{results.patents.final.toFixed(2)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="font-medium">EMR Projects</TableCell>
                                    <TableCell className="text-right">{results.emr.raw.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">{results.emr.weighted.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-bold">{results.emr.final.toFixed(2)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Detailed Report: Publications</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                             <TableHeader>
                                <TableRow>
                                    <TableHead>Title</TableHead>
                                    <TableHead className="text-right">Calculation</TableHead>
                                    <TableHead className="text-right">Raw Score</TableHead>
                                </TableRow>
                             </TableHeader>
                             <TableBody>
                                {results.publications.contributingClaims.map(({ claim, score, calculation }) => (
                                    <TableRow key={claim.id}>
                                        <TableCell className="font-medium">{getClaimTitle(claim)}</TableCell>
                                        <TableCell className="text-right text-xs text-muted-foreground">
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <span>{calculation.base.toFixed(2)} &times; {(calculation.multiplier ?? calculation.quartileMultiplier ?? 1).toFixed(2)} &times; {calculation.authorMultiplier?.toFixed(2)}</span>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Base &times; Quartile/Type &times; Author</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </TableCell>
                                        <TableCell className="text-right font-semibold">{score.toFixed(2)}</TableCell>
                                    </TableRow>
                                ))}
                                {results.publications.contributingClaims.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No contributing publications found.</TableCell></TableRow>}
                             </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                
                 <Card>
                    <CardHeader>
                        <CardTitle>Detailed Report: Patents</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                             <TableHeader>
                                <TableRow>
                                    <TableHead>Title</TableHead>
                                    <TableHead className="text-right">Calculation</TableHead>
                                    <TableHead className="text-right">Raw Score</TableHead>
                                </TableRow>
                             </TableHeader>
                             <TableBody>
                                {results.patents.contributingClaims.map(({ claim, score, calculation }) => (
                                    <TableRow key={claim.id}>
                                        <TableCell className="font-medium">{getClaimTitle(claim)}</TableCell>
                                        <TableCell className="text-right text-xs text-muted-foreground">
                                             <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <span>{calculation.base.toFixed(2)} &times; {calculation.applicantMultiplier?.toFixed(2)}</span>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Base Points &times; Applicant Multiplier</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </TableCell>
                                        <TableCell className="text-right font-semibold">{score.toFixed(2)}</TableCell>
                                    </TableRow>
                                ))}
                                {results.patents.contributingClaims.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No contributing patents found.</TableCell></TableRow>}
                             </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                
                 <Card>
                    <CardHeader>
                        <CardTitle>Detailed Report: EMR Projects</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                             <TableHeader><TableRow><TableHead>Project Title</TableHead><TableHead>Role</TableHead><TableHead className="text-right">Raw Score (Role Points)</TableHead></TableRow></TableHeader>
                             <TableBody>
                                {results.emr.contributingProjects.map(({ project, score }) => (
                                    <TableRow key={project.id}>
                                        <TableCell className="font-medium">{project.callTitle}</TableCell>
                                        <TableCell>{project.userId === project.userId ? 'PI' : 'Co-PI'}</TableCell>
                                        <TableCell className="text-right font-semibold">{score.toFixed(2)}</TableCell>
                                    </TableRow>
                                ))}
                                {results.emr.contributingProjects.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No contributing EMR projects found.</TableCell></TableRow>}
                             </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            <div className="lg:col-span-1">
                <Card className="sticky top-24">
                    <CardHeader className="text-center">
                        <CardDescription>Final Annual Research Performance Score (ARPS)</CardDescription>
                        <CardTitle className="text-6xl">{results.totalArps.toFixed(2)}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center">
                        <p className="text-muted-foreground">Performance Grade</p>
                        <Badge variant={getGradeVariant(results.grade)} className="text-2xl px-4 py-1 mt-2">{results.grade}</Badge>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
