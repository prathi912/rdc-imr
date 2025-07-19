
'use client';

import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { db } from '@/lib/config';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import type { EmrInterest, FundingCall, User } from '@/types';
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
    const [users, setUsers] = useState<Map<string, User>>(new Map());
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setCurrentUser(JSON.parse(storedUser));
        }
    }, []);

    useEffect(() => {
        if (!currentUser) return;
        
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch logs
                const logsQuery = query(collection(db, 'emrInterests'), where('status', '==', 'Submitted to Agency'), orderBy('submittedToAgencyAt', 'desc'));
                const logsSnapshot = await getDocs(logsQuery);
                let fetchedLogs = logsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));

                // Get unique call and user IDs from logs
                const callIds = [...new Set(fetchedLogs.map(log => log.callId))];
                const userIds = [...new Set(fetchedLogs.map(log => log.userId))];

                // Fetch related calls
                if (callIds.length > 0) {
                    const callsQuery = query(collection(db, 'fundingCalls'), where('__name__', 'in', callIds));
                    const callsSnapshot = await getDocs(callsQuery);
                    const callsMap = new Map(callsSnapshot.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() } as FundingCall]));
                    setCalls(callsMap);
                }

                // Fetch related users
                const usersMap = new Map<string, User>();
                if (userIds.length > 0) {
                    const usersQuery = query(collection(db, 'users'), where('__name__', 'in', userIds));
                    const usersSnapshot = await getDocs(usersQuery);
                    usersSnapshot.forEach(doc => {
                        usersMap.set(doc.id, { id: doc.id, ...doc.data() } as User);
                    });
                    setUsers(usersMap);
                }

                // Filter logs for CROs
                if (currentUser.role === 'CRO' && currentUser.faculties && currentUser.faculties.length > 0) {
                    fetchedLogs = fetchedLogs.filter(log => currentUser.faculties!.includes(log.faculty));
                } 
                // Filter logs for Principals
                else if (currentUser.designation === 'Principal' && currentUser.institute) {
                    fetchedLogs = fetchedLogs.filter(log => {
                        const applicant = usersMap.get(log.userId);
                        return applicant?.institute === currentUser.institute;
                    });
                }
                
                setLogs(fetchedLogs);


            } catch (error) {
                console.error("Error fetching EMR logs:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch EMR logs and user data.'});
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [toast, currentUser]);

    const getCall = (callId: string) => calls.get(callId);
    
    const handleExport = () => {
        if (logs.length === 0) {
            toast({ variant: 'destructive', title: 'No Data', description: 'There are no logs to export.' });
            return;
        }

        const dataToExport = logs.map(log => {
            const call = getCall(log.callId);
            const user = users.get(log.userId);
            return {
                'PI': log.userName,
                'PI Email': log.userEmail,
                'Institute': user?.institute || 'N/A',
                'Department': user?.department || 'N/A',
                'Faculty': user?.faculty || 'N/A',
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

    let pageTitle = "EMR Submission Logs";
    let pageDescription = "Records of all EMR applications that have been submitted to the funding agency.";
    
    if (currentUser?.role === 'CRO') {
        pageTitle = `EMR Logs for Your Faculties`;
        pageDescription = "Records of EMR applications submitted to the funding agency from your faculties.";
    } else if (currentUser?.designation === 'Principal' && currentUser.institute) {
        pageTitle = `EMR Logs for ${currentUser.institute}`;
        pageDescription = "Records of EMR applications submitted to the funding agency from your institute.";
    }


    return (
        <div className="container mx-auto py-10">
            <PageHeader title={pageTitle} description={pageDescription}>
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
                                No submissions have been logged yet for your scope.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
