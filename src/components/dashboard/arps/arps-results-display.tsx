
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export interface ArpsData {
    publications: { raw: number; weighted: number; final: number; };
    patents: { raw: number; weighted: number; final: number; };
    emr: { raw: number; weighted: number; final: number; };
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

    return (
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <Card>
                <CardHeader>
                    <CardTitle>ARPS Calculation Breakdown</CardTitle>
                    <CardDescription>Detailed scores based on the new policy.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Criterion</TableHead>
                                <TableHead className="text-right">Raw Score</TableHead>
                                <TableHead className="text-right">Weighted</TableHead>
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
    );
}
