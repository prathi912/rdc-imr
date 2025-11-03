
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import type { User, IncentiveClaim } from '@/types';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, ArrowUpDown } from 'lucide-react';
import { ClaimDetailsDialog } from '@/components/incentives/claim-details-dialog';
import { ApprovalDialog } from './approval-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const CLAIM_TYPES = ['Research Papers', 'Patents', 'Conference Presentations', 'Books', 'Membership of Professional Bodies', 'Seed Money for APC'];
type SortableKeys = 'userName' | 'claimType' | 'submissionDate' | 'status';

export default function IncentiveApprovalsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [pendingClaims, setPendingClaims] = useState<IncentiveClaim[]>([]);
    const [historyClaims, setHistoryClaims] = useState<IncentiveClaim[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const [approvalStage, setApprovalStage] = useState<number | null>(null);
    const [selectedClaim, setSelectedClaim] = useState<IncentiveClaim | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isApprovalOpen, setIsApprovalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [claimTypeFilter, setClaimTypeFilter] = useState('all');
    const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' }>({ key: 'submissionDate', direction: 'descending' });

    const fetchClaimsAndUsers = useCallback(async (currentUser: User, stage: number) => {
        setLoading(true);
        try {
            const claimsCollection = collection(db, 'incentiveClaims');
            const usersQuery = query(collection(db, 'users'));
            
            const statusToFetch = stage === 0 ? 'Pending' : `Pending Stage ${stage + 1} Approval`;
            
            const pendingClaimsQuery = query(
                claimsCollection, 
                where('status', '==', statusToFetch), 
                orderBy('submissionDate', 'desc')
            );

            const allClaimsQuery = query(claimsCollection, orderBy('submissionDate', 'desc'));
            
            const [pendingSnapshot, allClaimsSnapshot, usersSnapshot] = await Promise.all([
                getDocs(pendingClaimsQuery),
                getDocs(allClaimsQuery),
                getDocs(usersSnapshot)
            ]);

            setPendingClaims(pendingSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as IncentiveClaim)));
            
            const allClaims = allClaimsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as IncentiveClaim));
            const userHistory = allClaims.filter(claim => 
                claim.approvals?.some(approval => approval?.approverUid === currentUser.uid && approval.stage === stage + 1)
            );
            setHistoryClaims(userHistory);

            setAllUsers(usersSnapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as User)));

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

    const getClaimTitle = (claim: IncentiveClaim) => {
        return claim.paperTitle || claim.patentTitle || claim.conferencePaperTitle || claim.publicationTitle || claim.professionalBodyName || claim.apcPaperTitle || 'N/A';
    };
    
    const applyFiltersAndSort = useCallback((claims: IncentiveClaim[]) => {
        let filteredClaims = claims.filter(claim => {
            if (claimTypeFilter !== 'all' && claim.claimType !== claimTypeFilter) return false;
            if (!searchTerm) return true;
            const lowerCaseSearch = searchTerm.toLowerCase();
            return claim.userName.toLowerCase().includes(lowerCaseSearch) || 
                   getClaimTitle(claim).toLowerCase().includes(lowerCaseSearch) ||
                   (claim.claimId && claim.claimId.toLowerCase().includes(lowerCaseSearch));
        });

        filteredClaims.sort((a, b) => {
            const aValue = a[sortConfig.key] || '';
            const bValue = b[sortConfig.key] || '';
            if (aValue < bValue) {
                return sortConfig.direction === 'ascending' ? -1 : 1;
            }
            if (aValue > bValue) {
                return sortConfig.direction === 'ascending' ? 1 : -1;
            }
            return 0;
        });

        return filteredClaims;
    }, [claimTypeFilter, searchTerm, sortConfig]);

    const filteredPendingClaims = useMemo(() => applyFiltersAndSort(pendingClaims), [pendingClaims, applyFiltersAndSort]);
    const filteredHistoryClaims = useMemo(() => applyFiltersAndSort(historyClaims), [historyClaims, applyFiltersAndSort]);

    const requestSort = (key: SortableKeys) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
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

    const renderTable = (claimsList: IncentiveClaim[], isHistory = false) => (
      <div className="hidden md:block">
        <Table>
            <TableHeader><TableRow>
                <TableHead><Button variant="ghost" onClick={() => requestSort('userName')}>Claimant <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                <TableHead><Button variant="ghost" onClick={() => requestSort('claimType')}>Claim Type <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                <TableHead><Button variant="ghost" onClick={() => requestSort('submissionDate')}>Submitted On <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                {isHistory && <TableHead>Approved Amount</TableHead>}
                <TableHead><Button variant="ghost" onClick={() => requestSort('status')}>Status <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                <TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
                {claimsList.map(claim => {
                    const claimant = allUsers.find(u => u.uid === claim.uid);
                    const profileLink = claimant?.campus === 'Goa' ? `/goa/${claimant.misId}` : `/profile/${claimant.misId}`;
                    const hasProfileLink = claimant && claimant.misId;
                    const myApproval = isHistory ? claim.approvals?.find(a => a?.approverUid === user?.uid) : null;
                    return (
                        <TableRow key={claim.id}>
                            <TableCell>
                                {hasProfileLink ? (
                                    <Link href={profileLink} target="_blank" className="text-primary hover:underline">
                                        {claim.userName}
                                    </Link>
                                ) : (
                                    claim.userName
                                )}
                            </TableCell>
                            <TableCell><Badge variant="outline">{claim.claimType}</Badge></TableCell>
                            <TableCell>{new Date(claim.submissionDate).toLocaleDateString()}</TableCell>
                            {isHistory && <TableCell>₹{myApproval?.approvedAmount.toLocaleString('en-IN') || 'N/A'}</TableCell>}
                            <TableCell><Badge variant={claim.status === 'Accepted' || claim.status === 'Submitted to Accounts' ? 'default' : claim.status === 'Rejected' ? 'destructive' : 'secondary'}>{claim.status}</Badge></TableCell>
                            <TableCell className="text-right space-x-2">
                                <Button variant="outline" onClick={() => handleViewDetails(claim)}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Details
                                </Button>
                                {!isHistory && (
                                    <Button onClick={() => handleOpenApproval(claim)}>
                                        Take Action
                                    </Button>
                                )}
                            </TableCell>
                        </TableRow>
                    )
                })}
            </TableBody>
        </Table>
      </div>
    );

    const renderCards = (claimsList: IncentiveClaim[], isHistory = false) => (
      <div className="grid md:hidden grid-cols-1 sm:grid-cols-2 gap-4">
          {claimsList.map(claim => {
              const claimant = allUsers.find(u => u.uid === claim.uid);
              const profileLink = claimant?.campus === 'Goa' ? `/goa/${claimant.misId}` : `/profile/${claimant.misId}`;
              const hasProfileLink = claimant && claimant.misId;
              const myApproval = isHistory ? claim.approvals?.find(a => a?.approverUid === user?.uid) : null;
              
              return (
                  <Card key={claim.id}>
                      <CardHeader>
                          <CardTitle className="text-base break-words">
                              {hasProfileLink ? (
                                  <Link href={profileLink} target="_blank" className="text-primary hover:underline">{claim.userName}</Link>
                              ) : (
                                  claim.userName
                              )}
                          </CardTitle>
                          <CardDescription>{new Date(claim.submissionDate).toLocaleDateString()}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                          <div>
                              <p className="text-xs font-semibold text-muted-foreground">Claim Type</p>
                              <Badge variant="outline">{claim.claimType}</Badge>
                          </div>
                          <div>
                              <p className="text-xs font-semibold text-muted-foreground">Status</p>
                              <Badge variant={claim.status === 'Accepted' || claim.status === 'Submitted to Accounts' ? 'default' : claim.status === 'Rejected' ? 'destructive' : 'secondary'}>{claim.status}</Badge>
                          </div>
                          {isHistory && myApproval && (
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground">Approved Amount</p>
                                <p>₹{myApproval.approvedAmount.toLocaleString('en-IN') || 'N/A'}</p>
                            </div>
                          )}
                      </CardContent>
                      <CardContent className="flex flex-col gap-2">
                          <Button variant="outline" onClick={() => handleViewDetails(claim)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                          </Button>
                          {!isHistory && (
                              <Button onClick={() => handleOpenApproval(claim)}>
                                  Take Action
                              </Button>
                          )}
                      </CardContent>
                  </Card>
              )
          })}
      </div>
    );

    return (
        <>
            <div className="container mx-auto py-10">
                <PageHeader title={`Incentive Approvals (Stage ${approvalStage + 1})`} description="Claims awaiting your review and approval." />
                 <div className="flex flex-col sm:flex-row items-center py-4 gap-4">
                    <Input
                        placeholder="Filter by claimant, title, or Claim ID..."
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        className="w-full sm:max-w-sm"
                    />
                    <Select value={claimTypeFilter} onValueChange={setClaimTypeFilter}>
                        <SelectTrigger className="w-full sm:w-[240px]">
                            <SelectValue placeholder="Filter by claim type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Claim Types</SelectItem>
                            {CLAIM_TYPES.map(type => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="mt-4">
                     <Tabs defaultValue="pending">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="pending">Pending ({filteredPendingClaims.length})</TabsTrigger>
                            <TabsTrigger value="history">History ({filteredHistoryClaims.length})</TabsTrigger>
                        </TabsList>
                        <TabsContent value="pending" className="mt-4">
                            <Card>
                                <CardContent className="pt-6">
                                    {filteredPendingClaims.length > 0 ? (
                                      <>
                                        {renderTable(filteredPendingClaims)}
                                        {renderCards(filteredPendingClaims)}
                                      </>
                                    ) : (
                                        <div className="text-center py-12 text-muted-foreground">
                                            <p>There are no claims awaiting your approval at this stage.</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                        <TabsContent value="history" className="mt-4">
                            <Card>
                                <CardContent className="pt-6">
                                    {filteredHistoryClaims.length > 0 ? (
                                      <>
                                        {renderTable(filteredHistoryClaims, true)}
                                        {renderCards(filteredHistoryClaims, true)}
                                      </>
                                    ) : (
                                        <div className="text-center py-12 text-muted-foreground">
                                            <p>You have not processed any claims yet.</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
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
                            if (selectedClaim.status === `Pending Stage ${approvalStage + 1} Approval` || (approvalStage === 0 && selectedClaim.status === 'Pending')) {
                                setIsDetailsOpen(false);
                                handleOpenApproval(selectedClaim);
                            } else {
                                toast({ variant: 'default', title: 'Action Not Available', description: 'This claim is not at your current approval stage.' });
                            }
                        }}
                    />
                    <ApprovalDialog 
                        claim={selectedClaim} 
                        approver={user}
                        claimant={allUsers.find(u => u.uid === selectedClaim.uid) || null}
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

