
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { MoreHorizontal, Download, ArrowUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { db } from '@/lib/config';
import { collection, getDocs, doc, updateDoc, orderBy, query, where } from 'firebase/firestore';
import type { IncentiveClaim, User } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

const STATUSES: IncentiveClaim['status'][] = ['Pending', 'Accepted', 'Rejected'];
type SortableKeys = keyof Pick<IncentiveClaim, 'userName' | 'paperTitle' | 'submissionDate' | 'status'>;


function ClaimDetailsDialog({ claim, open, onOpenChange }: { claim: IncentiveClaim | null, open: boolean, onOpenChange: (open: boolean) => void }) {
    if (!claim) return null;

    const renderDetail = (label: string, value?: string | number) => {
        if (!value) return null;
        return (
            <div className="grid grid-cols-3 gap-2 py-1">
                <dt className="font-semibold text-muted-foreground col-span-1">{label}</dt>
                <dd className="col-span-2">{value}</dd>
            </div>
        );
    };
    
    const renderLinkDetail = (label: string, value?: string) => {
      if (!value) return null;
      return (
        <div className="grid grid-cols-3 gap-2 py-1">
          <dt className="font-semibold text-muted-foreground col-span-1">{label}</dt>
          <dd className="col-span-2">
            <a href={value} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
              {value}
            </a>
          </dd>
        </div>
      );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Incentive Claim Details</DialogTitle>
                    <DialogDescription>Full submission details for claimant: {claim.userName}.</DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto pr-4 space-y-2 text-sm">
                    {renderDetail("Claimant Name", claim.userName)}
                    {renderDetail("Claimant Email", claim.userEmail)}
                    {renderDetail("Claim Type", claim.claimType)}
                    {renderDetail("Status", claim.status)}
                    {renderDetail("Submission Date", new Date(claim.submissionDate).toLocaleString())}
                    
                    {claim.claimType === 'Research Papers' && (
                        <>
                            <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Research Paper Details</h4>
                            {renderDetail("Paper Title", claim.paperTitle)}
                            {renderLinkDetail("Relevant Link", claim.relevantLink)}
                            {renderDetail("Journal Name", claim.journalName)}
                            {renderLinkDetail("Journal Website", claim.journalWebsite)}
                            {renderDetail("Publication Type", claim.publicationType)}
                            {renderDetail("Index Type", claim.indexType?.toUpperCase())}
                            {renderDetail("Journal Classification", claim.journalClassification)}
                            {renderDetail("WoS Type", claim.wosType)}
                            {renderDetail("Impact Factor", claim.impactFactor)}
                            {renderDetail("Publication Phase", claim.publicationPhase)}
                        </>
                    )}

                    {claim.claimType === 'Patents' && (
                         <>
                            <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Patent Details</h4>
                            {renderDetail("Patent Title", claim.patentTitle)}
                            {renderDetail("Patent Status", claim.patentStatus)}
                            {renderDetail("Applicant Type", claim.patentApplicantType === 'Sole' ? 'Parul University as Sole Applicant' : 'Parul University as Joint Applicant')}
                        </>
                    )}

                    <hr className="my-2" />
                    <h4 className="font-semibold text-base mt-2">Author & Benefit Details</h4>
                    {renderDetail("Author Type", claim.authorType)}
                    {renderDetail("Benefit Mode", claim.benefitMode)}
                    {renderDetail("Total Authors", claim.totalAuthors)}
                    {renderDetail("Total Internal Authors", claim.totalInternalAuthors)}
                    {renderDetail("Total Internal Co-Authors", claim.totalInternalCoAuthors)}
                    
                    {claim.bankDetails && (
                        <>
                            <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Bank Account Details</h4>
                            {renderDetail("Beneficiary Name", claim.bankDetails.beneficiaryName)}
                            {renderDetail("Account Number", claim.bankDetails.accountNumber)}
                            {renderDetail("Bank Name", claim.bankDetails.bankName)}
                            {renderDetail("Branch Name", claim.bankDetails.branchName)}
                            {renderDetail("City", claim.bankDetails.city)}
                            {renderDetail("IFSC Code", claim.bankDetails.ifscCode)}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default function ManageIncentiveClaimsPage() {
  const [allClaims, setAllClaims] = useState<IncentiveClaim[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedClaim, setSelectedClaim] = useState<IncentiveClaim | null>(null);
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' }>({ key: 'submissionDate', direction: 'descending' });

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser) as User;
      if (parsedUser.role !== 'Super-admin' && parsedUser.role !== 'CRO') {
        toast({ variant: 'destructive', title: 'Access Denied', description: 'You do not have permission to view this page.' });
        router.replace('/dashboard');
        return;
      }
      setCurrentUser(parsedUser);
    } else {
        router.replace('/login');
    }
  }, [router, toast]);


  const fetchClaimsAndUsers = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const usersCollection = collection(db, 'users');
      const userSnapshot = await getDocs(usersCollection);
      const userList = userSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as User));
      setUsers(userList);

      const claimsCollection = collection(db, 'incentiveClaims');
      let q;
      if (currentUser.role === 'Super-admin') {
          q = query(claimsCollection, orderBy('submissionDate', 'desc'));
      } else if (currentUser.role === 'CRO') {
          q = query(claimsCollection, where('faculty', '==', currentUser.faculty), orderBy('submissionDate', 'desc'));
      } else {
          setAllClaims([]);
          setLoading(false);
          return;
      }

      const claimSnapshot = await getDocs(q);
      const claimList = claimSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as IncentiveClaim));
      setAllClaims(claimList);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ variant: 'destructive', title: "Error", description: "Could not fetch incentive claims or user data." });
    } finally {
      setLoading(false);
    }
  }, [toast, currentUser]);

  useEffect(() => {
    fetchClaimsAndUsers();
  }, [fetchClaimsAndUsers]);
  
  const sortedAndFilteredClaims = useMemo(() => {
    let filtered = [...allClaims];

    if (activeTab !== 'all') {
      const status = activeTab.charAt(0).toUpperCase() + activeTab.slice(1) as IncentiveClaim['status'];
      filtered = filtered.filter(claim => claim.status === status);
    }

    if (searchTerm) {
      const lowerCaseSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(claim =>
        claim.userName.toLowerCase().includes(lowerCaseSearch) ||
        (claim.paperTitle && claim.paperTitle.toLowerCase().includes(lowerCaseSearch)) ||
        (claim.patentTitle && claim.patentTitle.toLowerCase().includes(lowerCaseSearch))
      );
    }

    filtered.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
            return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
            return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
    });

    return filtered;
  }, [allClaims, activeTab, searchTerm, sortConfig]);

  const requestSort = (key: SortableKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
        direction = 'descending';
    }
    setSortConfig({ key, direction });
  };


  const handleStatusChange = useCallback(async (id: string, newStatus: IncentiveClaim['status']) => {
    try {
      const claimDoc = doc(db, 'incentiveClaims', id);
      await updateDoc(claimDoc, { status: newStatus });
      toast({ title: 'Status Updated', description: "The claim's status has been changed." });
      fetchClaimsAndUsers(); 
    } catch (error) {
       console.error("Error updating status:", error);
       toast({ variant: 'destructive', title: "Error", description: "Could not update status." });
    }
  }, [fetchClaimsAndUsers, toast]);

  const handleExport = () => {
    if (sortedAndFilteredClaims.length === 0) {
      toast({ variant: 'destructive', title: "No Data", description: "There are no claims to export in the current view." });
      return;
    }

    const userDetailsMap = new Map(users.map(u => [u.uid, { misId: u.misId || '', designation: u.designation || '' }]));
    
    const dataToExport = sortedAndFilteredClaims.map(claim => {
      const { bankDetails, id, uid, ...rest } = claim;
      const userDetails = userDetailsMap.get(uid);
      return {
        ...rest,
        misId: userDetails?.misId || '',
        designation: userDetails?.designation || '',
        beneficiaryName: bankDetails?.beneficiaryName || '',
        accountNumber: bankDetails?.accountNumber || '',
        bankName: bankDetails?.bankName || '',
        branchName: bankDetails?.branchName || '',
        city: bankDetails?.city || '',
        ifscCode: bankDetails?.ifscCode || '',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Claims");
    XLSX.writeFile(workbook, `incentive_claims_${activeTab}_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: "Export Started", description: `Downloading ${sortedAndFilteredClaims.length} claims.` });
  };
  
  const renderTable = () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
             <Button variant="ghost" onClick={() => requestSort('userName')}>
                Claimant <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          </TableHead>
          <TableHead className="hidden md:table-cell">
             <Button variant="ghost" onClick={() => requestSort('paperTitle')}>
                Title <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          </TableHead>
          <TableHead>
             <Button variant="ghost" onClick={() => requestSort('submissionDate')}>
                Date <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          </TableHead>
          <TableHead>
             <Button variant="ghost" onClick={() => requestSort('status')}>
                Status <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          </TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedAndFilteredClaims.map((claim) => (
            <TableRow key={claim.id}>
              <TableCell className="font-medium">{claim.userName}</TableCell>
              <TableCell className="hidden md:table-cell max-w-sm truncate">{claim.paperTitle || claim.patentTitle}</TableCell>
              <TableCell>{new Date(claim.submissionDate).toLocaleDateString()}</TableCell>
              <TableCell>
                <Badge variant={claim.status === 'Accepted' ? 'default' : claim.status === 'Rejected' ? 'destructive' : 'secondary'}>{claim.status}</Badge>
              </TableCell>
              <TableCell className="text-right">
                  <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button aria-haspopup="true" size="icon" variant="ghost">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Toggle menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setSelectedClaim(claim)}>View Details</DropdownMenuItem>
                    <DropdownMenuLabel>Change Status</DropdownMenuLabel>
                      {STATUSES.map(status => (
                        <DropdownMenuItem 
                            key={status} 
                            onClick={() => handleStatusChange(claim.id, status)}
                            disabled={claim.status === status}
                        >
                            {status}
                        </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );

  const pageTitle = currentUser?.role === 'CRO' 
    ? `Incentive Claims from ${currentUser.faculty}`
    : "Manage Incentive Claims";

  const pageDescription = currentUser?.role === 'CRO' 
    ? `Review claims submitted from your faculty.` 
    : "Review and manage all submitted incentive claims.";

  return (
    <div className="container mx-auto py-10">
      <PageHeader title={pageTitle} description={pageDescription}>
         <Button onClick={handleExport} disabled={loading}>
            <Download className="mr-2 h-4 w-4" />
            Export XLSX
         </Button>
      </PageHeader>
      <div className="mt-8">
        <div className="flex items-center py-4">
            <Input
                placeholder="Filter by claimant or title..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="max-w-sm"
            />
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all">All ({allClaims.length})</TabsTrigger>
                <TabsTrigger value="pending">Pending ({allClaims.filter(c => c.status === 'Pending').length})</TabsTrigger>
                <TabsTrigger value="accepted">Accepted ({allClaims.filter(c => c.status === 'Accepted').length})</TabsTrigger>
                <TabsTrigger value="rejected">Rejected ({allClaims.filter(c => c.status === 'Rejected').length})</TabsTrigger>
            </TabsList>
            <Card className="mt-4">
              <CardContent className="pt-6">
                 {loading ? (
                    <div className="space-y-4">
                        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                 ) : sortedAndFilteredClaims.length > 0 ? (
                    renderTable()
                 ) : (
                    <div className="text-center py-10 text-muted-foreground">
                        <p>No claims found for this category or search term.</p>
                    </div>
                 )}
              </CardContent>
            </Card>
        </Tabs>
      </div>
      <ClaimDetailsDialog claim={selectedClaim} open={!!selectedClaim} onOpenChange={() => setSelectedClaim(null)} />
    </div>
  );
}
