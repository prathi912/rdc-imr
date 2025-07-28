
// src/app/dashboard/emr-management/page.tsx
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { db } from '@/lib/config';
import { collection, query, orderBy, onSnapshot, where, getDocs } from 'firebase/firestore';
import type { FundingCall, EmrInterest, User } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { format, isAfter, parseISO } from 'date-fns';
import { Eye, Download } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';

function EmrLogsTab({ user }: { user: User | null }) {
    const [logs, setLogs] = useState<EmrInterest[]>([]);
    const [calls, setCalls] = useState<Map<string, FundingCall>>(new Map());
    const [users, setUsers] = useState<Map<string, User>>(new Map());
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const { toast } = useToast();

    const fetchData = useCallback(async () => {
        if (!user) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            let logsQuery;
            const baseQuery = query(collection(db, 'emrInterests'), where('status', '==', 'Submitted to Agency'), orderBy('submittedToAgencyAt', 'desc'));

            const isSuperAdminOrAdmin = user.role === 'Super-admin' || user.role === 'admin';
            const isCro = user.role === 'CRO';
            const isPrincipal = user.designation === 'Principal';
            const isHod = user.designation === 'HOD';

            if (isSuperAdminOrAdmin) {
                logsQuery = baseQuery;
            } else if (isCro && user.faculties && user.faculties.length > 0) {
                logsQuery = query(baseQuery, where('faculty', 'in', user.faculties));
            } else if (isPrincipal && user.institute) {
                logsQuery = query(baseQuery, where('faculty', 'in', user.faculties || [])); // Assuming Principals are tied to a faculty that contains their institute
            } else if (isHod && user.department && user.institute) {
                logsQuery = query(baseQuery, where('department', '==', user.department), where('faculty', '==', user.faculty));
            } else {
                setLogs([]);
                setLoading(false);
                return;
            }

            const logsSnapshot = await getDocs(logsQuery);
            const fetchedLogs = logsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));
            setLogs(fetchedLogs);

            const callIds = [...new Set(fetchedLogs.map(log => log.callId))];
            if (callIds.length > 0) {
                const callsQuery = query(collection(db, 'fundingCalls'), where('__name__', 'in', callIds));
                const callsSnapshot = await getDocs(callsQuery);
                setCalls(new Map(callsSnapshot.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() } as FundingCall])));
            }

            const userIds = [...new Set(fetchedLogs.map(log => log.userId))];
            if (userIds.length > 0) {
                const usersQuery = query(collection(db, 'users'), where('__name__', 'in', userIds));
                const usersSnapshot = await getDocs(usersQuery);
                setUsers(new Map(usersSnapshot.docs.map(doc => [doc.id, { uid: doc.id, ...doc.data() } as User])));
            }
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch EMR logs.' });
        } finally {
            setLoading(false);
        }
    }, [toast, user]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filteredLogs = useMemo(() => {
        if (!searchTerm) return logs;
        const lowercasedFilter = searchTerm.toLowerCase();
        return logs.filter(log => {
            const user = users.get(log.userId);
            const call = calls.get(log.callId);
            return (
                log.userName.toLowerCase().includes(lowercasedFilter) ||
                (call?.title && call.title.toLowerCase().includes(lowercasedFilter)) ||
                (log.agencyReferenceNumber && log.agencyReferenceNumber.toLowerCase().includes(lowercasedFilter))
            );
        });
    }, [logs, searchTerm, users, calls]);

    const handleExport = () => {
        const dataToExport = filteredLogs.map(log => {
            const call = calls.get(log.callId);
            const user = users.get(log.userId);
            return {
                'PI': log.userName,
                'Institute': user?.institute || 'N/A',
                'Funding Call': call?.title || 'Unknown',
                'Agency Name': call?.agency || 'Unknown',
                'Reference No.': log.agencyReferenceNumber || 'N/A',
                'Logged Date': log.submittedToAgencyAt ? format(new Date(log.submittedToAgencyAt), 'PPp') : 'N/A',
                'Acknowledgement': log.agencyAcknowledgementUrl || 'Not Provided',
            };
        });
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'EMR_Submission_Logs');
        XLSX.writeFile(workbook, `emr_submission_logs_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const canViewFullDetails = user?.role === 'Super-admin' || user?.role === 'admin';

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <Input placeholder="Search logs..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="max-w-sm" />
                <Button onClick={handleExport} disabled={loading || filteredLogs.length === 0}><Download className="mr-2 h-4 w-4" /> Export Logs</Button>
            </div>
            <Card>
                <CardContent className="pt-6">
                     {loading ? ( <Skeleton className="h-48 w-full" /> ) : 
                     filteredLogs.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader><TableRow>
                                    <TableHead>PI</TableHead>
                                    <TableHead className="hidden md:table-cell">Funding Call</TableHead>
                                    <TableHead className="hidden sm:table-cell">Reference No.</TableHead>
                                    <TableHead>Logged On</TableHead>
                                    <TableHead>Acknowledgement</TableHead>
                                </TableRow></TableHeader>
                                <TableBody>{filteredLogs.map(log => (
                                    <TableRow key={log.id}>
                                        <TableCell className="whitespace-nowrap">{users.get(log.userId)?.name || log.userName}</TableCell>
                                        <TableCell className="hidden md:table-cell">{calls.get(log.callId)?.title || 'Loading...'}</TableCell>
                                        <TableCell className="hidden sm:table-cell">{log.agencyReferenceNumber || 'N/A'}</TableCell>
                                        <TableCell className="whitespace-nowrap">{log.submittedToAgencyAt ? format(new Date(log.submittedToAgencyAt), 'PP') : 'N/A'}</TableCell>
                                        <TableCell>
                                            {log.agencyAcknowledgementUrl ? (
                                                <Button asChild variant="link" className="p-0 h-auto">
                                                    <a href={log.agencyAcknowledgementUrl} target="_blank" rel="noopener noreferrer">View</a>
                                                </Button>
                                            ) : (
                                                "Not Provided"
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}</TableBody>
                            </Table>
                        </div>
                    ) : ( <div className="text-center text-muted-foreground py-8">No submissions have been logged.</div> )}
                </CardContent>
            </Card>
        </div>
    )
}

export default function EmrManagementOverviewPage() {
    const [calls, setCalls] = useState<FundingCall[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
    }, []);

    useEffect(() => {
        const callsQuery = query(collection(db, 'fundingCalls'), orderBy('interestDeadline', 'desc'));
        const unsubscribe = onSnapshot(callsQuery, 
            (snapshot) => {
                setCalls(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingCall)));
                setLoading(false);
            },
            (error) => {
                console.error("Error fetching funding calls:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch funding calls.' });
                setLoading(false);
            }
        );
        return () => unsubscribe();
    }, [toast]);

    const getStatusBadge = (call: FundingCall) => {
        const now = new Date();
        if (call.status === 'Meeting Scheduled') {
            return <Badge variant="default">Meeting Scheduled</Badge>;
        }
        if (isAfter(now, parseISO(call.interestDeadline))) {
            return <Badge variant="secondary">Closed</Badge>;
        }
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/50 dark:text-green-200 dark:border-green-700">Open</Badge>;
    }

    return (
        <div className="container mx-auto py-10">
            <PageHeader title="EMR Management" description="Manage funding calls and view submission logs." />
            <div className="mt-8">
                <Tabs defaultValue="calls">
                    <TabsList>
                        <TabsTrigger value="calls">Manage Calls</TabsTrigger>
                        <TabsTrigger value="logs">Submission Logs</TabsTrigger>
                    </TabsList>
                    <TabsContent value="calls" className="mt-4">
                        <Card>
                            <CardContent className="pt-6">
                                {loading ? (
                                    <div className="space-y-2">
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                    </div>
                                ) : calls.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader><TableRow>
                                                <TableHead>Call Title</TableHead>
                                                <TableHead>Agency</TableHead>
                                                <TableHead>Interest Deadline</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow></TableHeader>
                                            <TableBody>{calls.map(call => (
                                                <TableRow key={call.id}>
                                                    <TableCell className="font-medium whitespace-nowrap">{call.title}</TableCell>
                                                    <TableCell className="whitespace-nowrap">{call.agency}</TableCell>
                                                    <TableCell className="whitespace-nowrap">{format(parseISO(call.interestDeadline), 'PPp')}</TableCell>
                                                    <TableCell>{getStatusBadge(call)}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button asChild variant="outline" size="sm">
                                                            <Link href={`/dashboard/emr-management/${call.id}`}><Eye className="mr-2 h-4 w-4" /> Manage</Link>
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}</TableBody>
                                        </Table>
                                    </div>
                                ) : (
                                    <div className="text-center text-muted-foreground py-8">No funding calls have been created.</div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="logs" className="mt-4">
                        <EmrLogsTab user={user} />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
