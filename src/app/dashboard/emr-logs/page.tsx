
'use client';

import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { db } from '@/lib/config';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import type { EmrInterest, FundingCall } from '@/types';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { format } from 'date-fns';
import { Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function EmrLogsPage() {
    const [logs, setLogs] = useState<EmrInterest[]>([]);
    const [calls, setCalls] = useState<Map<string, FundingCall>>(new Map());
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

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

    const getCall = (callId: string) => calls.get(callId);
    
    const handleExport = () => {
        if (logs.length === 0) {
            toast({ variant: 'destructive', title: 'No Data', description: 'There are no logs to export.' });
            return;
        }

        const dataToExport = logs.map(log => {
            const call = getCall(log.callId);
            return {
                'PI': log.userName,
                'PI Email': log.userEmail,
                'Funding Call': call?.title || 'Unknown',
                'Agency Name': call?.agency || 'Unknown',
                'Reference No.': log.agencyReferenceNumber || 'N/A',
                'Submission Logged Date': log.submittedToAgencyAt ? format(new Date(log.submittedToAgencyAt), 'PPp') : 'N/A',
                'Acknowledgement File': log.agencyAcknowledgementUrl || 'Not Provided',
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'EMR Submission Logs');
        XLSX.writeFile(workbook, `emr_submission_logs_${new Date().toISOString().split('T')[0]}.xlsx`);
        toast({ title: "Export Started", description: `Downloading ${logs.length} log entries.` });
    };


    return (
        <div className="container mx-auto py-10">
            <PageHeader title="EMR Submission Logs" description="Records of all EMR applications that have been submitted to the funding agency.">
                <Button onClick={handleExport} disabled={loading || logs.length === 0}>
                    <Download className="mr-2 h-4 w-4" />
                    Export XLSX
                </Button>
            </PageHeader>
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
                                        <TableHead>PI</TableHead>
                                        <TableHead>Funding Call</TableHead>
                                        <TableHead>Reference No.</TableHead>
                                        <TableHead>Submission Logged On</TableHead>
                                        <TableHead>Acknowledgement</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {logs.map(log => (
                                        <TableRow key={log.id}>
                                            <TableCell className="font-medium">
                                                <div>{log.userName}</div>
                                                <div className="text-xs text-muted-foreground">{log.userEmail}</div>
                                            </TableCell>
                                            <TableCell>{getCall(log.callId)?.title || 'Loading...'}</TableCell>
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
