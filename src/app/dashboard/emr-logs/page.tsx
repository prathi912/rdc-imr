
'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/config';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import type { EmrInterest, FundingCall } from '@/types';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { format } from 'date-fns';

export default function EmrLogsPage() {
    const [logs, setLogs] = useState<EmrInterest[]>([]);
    const [calls, setCalls] = useState<Map<string, FundingCall>>(new Map());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const logsQuery = query(collection(db, 'emrInterests'), where('status', '==', 'Submitted to Agency'), orderBy('submittedToAgencyAt', 'desc'));
                const logsSnapshot = await getDocs(logsQuery);
                const fetchedLogs = logsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));
                setLogs(fetchedLogs);

                const callIds = [...new Set(fetchedLogs.map(log => log.callId))];
                if (callIds.length > 0) {
                    const callsQuery = query(collection(db, 'fundingCalls'), where('__name__', 'in', callIds));
                    const callsSnapshot = await getDocs(callsQuery);
                    const callsMap = new Map(callsSnapshot.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() } as FundingCall]));
                    setCalls(callsMap);
                }
            } catch (error) {
                console.error("Error fetching EMR logs:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const getCallTitle = (callId: string) => calls.get(callId)?.title || 'Loading...';

    return (
        <div className="container mx-auto py-10">
            <PageHeader title="EMR Submission Logs" description="Records of all EMR applications that have been submitted to the funding agency." />
            <div className="mt-8">
                <Card>
                    <CardContent className="pt-6">
                        {loading ? (
                            <div className="space-y-2">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                        ) : logs.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Applicant</TableHead>
                                        <TableHead>Funding Call</TableHead>
                                        <TableHead>Reference No.</TableHead>
                                        <TableHead>Submission Date</TableHead>
                                        <TableHead>Acknowledgement</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {logs.map(log => (
                                        <TableRow key={log.id}>
                                            <TableCell className="font-medium">{log.userName}</TableCell>
                                            <TableCell>{getCallTitle(log.callId)}</TableCell>
                                            <TableCell>{log.agencyReferenceNumber || 'N/A'}</TableCell>
                                            <TableCell>{log.submittedToAgencyAt ? format(new Date(log.submittedToAgencyAt), 'PP') : 'N/A'}</TableCell>
                                            <TableCell>
                                                {log.agencyAcknowledgementUrl ? (
                                                    <Button asChild variant="link" className="p-0 h-auto">
                                                        <Link href={log.agencyAcknowledgementUrl} target="_blank" rel="noopener noreferrer">View PDF</Link>
                                                    </Button>
                                                ) : 'Not Provided'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <div className="text-center text-muted-foreground py-8">
                                No submissions have been logged yet.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
