
'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/page-header';
import type { User, IncentiveClaim } from '@/types';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import { ClaimDetailsDialog } from '@/components/incentives/claim-details-dialog';
import { ApprovalDialog } from './approval-dialog';

export default function IncentiveApprovalsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [claims, setClaims] = useState<IncentiveClaim[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const [approvalStage, setApprovalStage] = useState<number | null>(null);
    const [selectedClaim, setSelectedClaim] = useState<IncentiveClaim | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isApprovalOpen, setIsApprovalOpen] = useState(false);

    const fetchClaimsAndUsers = useCallback(async (currentUser: User, stage: number) => {
        setLoading(true);
        try {
            const claimsCollection = collection(db, 'incentiveClaims');
            const statusToFetch = stage === 0 ? 'Pending' : `Pending Stage ${stage + 1} Approval`;
            
            const claimsQuery = query(
                claimsCollection, 
                where('status', '==', statusToFetch), 
                orderBy('submissionDate', 'desc')
            );

            const usersQuery = query(collection(db, 'users'));
            
            const [claimsSnapshot, usersSnapshot] = await Promise.all([
                getDocs(claimsQuery),
                getDocs(usersQuery)
            ]);

            const claimsList = claimsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as IncentiveClaim));
            setClaims(claimsList);
            const usersList = usersSnapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as User));
            setAllUsers(usersList);

        } catch (error) {
            console.error('Error fetching data:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch claims or user data.' });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const parsedUser = JSON.parse(storedUser) as User;
            setUser(parsedUser);
            const stage = parsedUser.allowedModules?.find(m => m.startsWith('incentive-approver-'))
                ? parseInt(parsedUser.allowedModules.find(m => m.startsWith('incentive-approver-'))!.split('-')[2], 10) - 1
                : null;
            
            setApprovalStage(stage);

            if (stage !== null) {
                fetchClaimsAndUsers(parsedUser, stage);
            } else {
                setLoading(false);
            }
        } else {
            setLoading(false);
        }
    }, [fetchClaimsAndUsers]);

    const handleViewDetails = (claim: IncentiveClaim) => {
        setSelectedClaim(claim);
        setIsDetailsOpen(true);
    };

    const handleOpenApproval = (claim: IncentiveClaim) => {
        setSelectedClaim(claim);
        setIsApprovalOpen(true);
    };

    const handleActionComplete = () => {
        if (user && approvalStage !== null) {
            fetchClaimsAndUsers(user, approvalStage);
        }
    };
    
    if (loading) {
        return (
            <div className="container mx-auto py-10">
                <PageHeader title="Incentive Approvals" description="Loading claims awaiting your review..." />
                <Skeleton className="mt-8 h-64 w-full" />
            </div>
        )
    }

    if (approvalStage === null) {
        return (
            <div className="container mx-auto py-10">
                <PageHeader title="Access Denied" description="You do not have permission to view this page." />
            </div>
        )
    }

    return (
        <>
            <div className="container mx-auto py-10">
                <PageHeader title={`Incentive Approvals (Stage ${approvalStage + 1})`} description="Claims awaiting your review and approval." />
                <div className="mt-8">
                    <Card>
                        <CardContent className="pt-6">
                            {claims.length > 0 ? (
                                <Table>
                                    <TableHeader><TableRow>
                                        <TableHead>Claimant</TableHead>
                                        <TableHead>Claim Type</TableHead>
                                        <TableHead>Submitted On</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow></TableHeader>
                                    <TableBody>
                                        {claims.map(claim => (
                                            <TableRow key={claim.id}>
                                                <TableCell>{claim.userName}</TableCell>
                                                <TableCell><Badge variant="outline">{claim.claimType}</Badge></TableCell>
                                                <TableCell>{new Date(claim.submissionDate).toLocaleDateString()}</TableCell>
                                                <TableCell><Badge variant="secondary">{claim.status}</Badge></TableCell>
                                                <TableCell className="text-right space-x-2">
                                                    <Button variant="outline" onClick={() => handleViewDetails(claim)}>
                                                        <Eye className="h-4 w-4 mr-2" />
                                                        View &amp; Approve
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <div className="text-center py-12 text-muted-foreground">
                                    <p>There are no claims awaiting your approval at this stage.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
            {selectedClaim && user && (
                <>
                    <ClaimDetailsDialog 
                        claim={selectedClaim} 
                        open={isDetailsOpen} 
                        onOpenChange={setIsDetailsOpen} 
                        currentUser={user}
                        claimant={allUsers.find(u => u.uid === selectedClaim.uid) || null}
                        onTakeAction={() => {
                            setIsDetailsOpen(false);
                            handleOpenApproval(selectedClaim);
                        }}
                    />
                    <ApprovalDialog 
                        claim={selectedClaim} 
                        approver={user}
                        stageIndex={approvalStage}
                        isOpen={isApprovalOpen} 
                        onOpenChange={setIsApprovalOpen} 
                        onActionComplete={handleActionComplete}
                    />
                </>
            )}
        </>
    );
}
