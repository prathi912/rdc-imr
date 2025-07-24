// src/app/dashboard/emr-management/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/config';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import type { FundingCall } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { format, isAfter, parseISO } from 'date-fns';
import { Eye } from 'lucide-react';

export default function EmrManagementOverviewPage() {
    const [calls, setCalls] = useState<FundingCall[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

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
            <PageHeader title="EMR Management" description="Select a funding call to manage registrations, schedule meetings, and view details." />
            <div className="mt-8">
                <Card>
                    <CardContent className="pt-6">
                        {loading ? (
                             <div className="space-y-2">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                        ) : calls.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Call ID</TableHead>
                                        <TableHead>Call Title</TableHead>
                                        <TableHead>Agency</TableHead>
                                        <TableHead>Interest Deadline</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {calls.map(call => (
                                        <TableRow key={call.id}>
                                            <TableCell className="font-mono text-xs">{call.callIdentifier || 'N/A'}</TableCell>
                                            <TableCell className="font-medium">{call.title}</TableCell>
                                            <TableCell>{call.agency}</TableCell>
                                            <TableCell>{format(parseISO(call.interestDeadline), 'PPp')}</TableCell>
                                            <TableCell>{getStatusBadge(call)}</TableCell>
                                            <TableCell className="text-right">
                                                <Button asChild variant="outline" size="sm">
                                                    <Link href={`/dashboard/emr-management/${call.id}`}>
                                                        <Eye className="mr-2 h-4 w-4" />
                                                        Manage
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <div className="text-center text-muted-foreground py-8">
                                No funding calls have been created yet.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
