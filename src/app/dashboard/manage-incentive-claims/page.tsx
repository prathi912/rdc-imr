
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
import { MoreHorizontal, Download, ArrowUpDown, Printer, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { db } from '@/lib/config';
import { collection, getDocs, doc, orderBy, query, where } from 'firebase/firestore';
import type { IncentiveClaim, User } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateIncentiveClaimStatus } from '@/app/actions';
import { generateBookIncentiveForm } from '@/app/incentive-actions';
import { generateMembershipIncentiveForm } from '@/app/membership-actions';
import { generateResearchPaperIncentiveForm } from '@/app/research-paper-actions';
import { ClaimDetailsDialog } from '@/components/incentives/claim-details-dialog';

const STATUSES: IncentiveClaim['status'][] = ['Pending', 'Accepted', 'Rejected'];
const CLAIM_TYPES = ['Research Papers', 'Patents', 'Conference Presentations', 'Books', 'Membership of Professional Bodies', 'Seed Money for APC'];
type SortableKeys = keyof Pick<IncentiveClaim, 'userName' | 'submissionDate' | 'status' | 'claimType'>;


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
  const [claimTypeFilter, setClaimTypeFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' }>({ key: 'submissionDate', direction: 'descending' });
  const [isPrintingBookForm, setIsPrintingBookForm] = useState<string | null>(null);
  const [isPrintingMembershipForm, setIsPrintingMembershipForm] = useState<string | null>(null);
  const [isPrintingResearchPaperForm, setIsPrintingResearchPaperForm] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser) as User;
      if (parsedUser.role !== 'Super-admin' && parsedUser.role !== 'admin' && parsedUser.role !== 'CRO') {
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
      if (currentUser.role === 'Super-admin' || currentUser.role === 'admin') {
          q = query(claimsCollection, orderBy('submissionDate', 'desc'));
      } else if (currentUser.role === 'CRO') {
          q = query(claimsCollection, where('faculty', 'in', currentUser.faculties || []), orderBy('submissionDate', 'desc'));
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

    if (claimTypeFilter !== 'all') {
      filtered = filtered.filter(claim => claim.claimType === claimTypeFilter);
    }

    if (searchTerm) {
      const lowerCaseSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(claim =>
        claim.userName.toLowerCase().includes(lowerCaseSearch) ||
        (claim.paperTitle && claim.paperTitle.toLowerCase().includes(lowerCaseSearch)) ||
        (claim.patentTitle && claim.patentTitle.toLowerCase().includes(lowerCaseSearch)) ||
        (claim.conferencePaperTitle && claim.conferencePaperTitle.toLowerCase().includes(lowerCaseSearch)) ||
        (claim.publicationTitle && claim.publicationTitle.toLowerCase().includes(lowerCaseSearch)) ||
        (claim.professionalBodyName && claim.professionalBodyName.toLowerCase().includes(lowerCaseSearch)) ||
        (claim.apcPaperTitle && claim.apcPaperTitle.toLowerCase().includes(lowerCaseSearch))
      );
    }

    filtered.sort((a, b) => {
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

    return filtered;
  }, [allClaims, activeTab, searchTerm, sortConfig, claimTypeFilter]);

  const requestSort = (key: SortableKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
        direction = 'descending';
    }
    setSortConfig({ key, direction });
  };


  const handleStatusChange = useCallback(async (id: string, newStatus: IncentiveClaim['status']) => {
    const result = await updateIncentiveClaimStatus(id, newStatus);
    if (result.success) {
      toast({ title: 'Status Updated', description: "The claim's status has been changed and the user has been notified." });
      fetchClaimsAndUsers(); 
    } else {
       toast({ variant: 'destructive', title: "Error", description: result.error || "Could not update status." });
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
  
  const handlePrintBookForm = async (claim: IncentiveClaim) => {
      if (!claim) return;
      setIsPrintingBookForm(claim.id);
      try {
        const result = await generateBookIncentiveForm(claim.id);
        if (result.success && result.fileData) {
          const byteCharacters = atob(result.fileData);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Office_Noting_Book_Claim_${claim.userName.replace(/\s/g, '_')}.docx`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);
          toast({ title: "Download Started", description: "Office Notings form is being downloaded." });
        } else {
          throw new Error(result.error || "Failed to generate form.");
        }
      } catch (error: any) {
        console.error("Book form generation error:", error);
        toast({ variant: 'destructive', title: "Generation Failed", description: error.message });
      } finally {
        setIsPrintingBookForm(null);
      }
    };

    const handlePrintMembershipForm = async (claim: IncentiveClaim) => {
        if (!claim) return;
        setIsPrintingMembershipForm(claim.id);
        try {
            const result = await generateMembershipIncentiveForm(claim.id);
            if (result.success && result.fileData) {
                const byteCharacters = atob(result.fileData);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Office_Noting_Membership_Claim_${claim.userName.replace(/\s/g, '_')}.docx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
                toast({ title: "Download Started", description: "Office Notings form is being downloaded." });
            } else {
                throw new Error(result.error || "Failed to generate form.");
            }
        } catch (error: any) {
            console.error("Membership form generation error:", error);
            toast({ variant: 'destructive', title: "Generation Failed", description: error.message });
        } finally {
            setIsPrintingMembershipForm(null);
        }
    };

    const handlePrintResearchPaperForm = async (claim: IncentiveClaim) => {
        if (!claim) return;
        setIsPrintingResearchPaperForm(claim.id);
        try {
            const result = await generateResearchPaperIncentiveForm(claim.id);
            if (result.success && result.fileData) {
                const byteCharacters = atob(result.fileData);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Office_Noting_Research_Paper_Claim_${claim.userName.replace(/\s/g, '_')}.docx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
                toast({ title: "Download Started", description: "Office Notings form is being downloaded." });
            } else {
                throw new Error(result.error || "Failed to generate form.");
            }
        } catch (error: any) {
            console.error("Research Paper form generation error:", error);
            toast({ variant: 'destructive', title: "Generation Failed", description: error.message });
        } finally {
            setIsPrintingResearchPaperForm(null);
        }
    };
  
  const renderTable = () => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
               <Button variant="ghost" onClick={() => requestSort('userName')}>
                  Claimant <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead className="hidden md:table-cell">
               <Button variant="ghost" onClick={() => requestSort('claimType')}>
                  Claim Type <ArrowUpDown className="ml-2 h-4 w-4" />
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
                <TableCell className="font-medium whitespace-nowrap">{claim.userName}</TableCell>
                <TableCell className="hidden md:table-cell"><Badge variant="outline">{claim.claimType}</Badge></TableCell>
                <TableCell>{new Date(claim.submissionDate).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Badge variant={claim.status === 'Accepted' ? 'default' : claim.status === 'Rejected' ? 'destructive' : 'secondary'}>{claim.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                        {claim.claimType === 'Books' && claim.status === 'Pending' && (
                            <Button onClick={() => handlePrintBookForm(claim)} disabled={isPrintingBookForm === claim.id} size="sm" variant="outline">
                                {isPrintingBookForm === claim.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                                Notings
                            </Button>
                        )}
                        {claim.claimType === 'Membership of Professional Bodies' && claim.status === 'Pending' && (
                          <Button onClick={() => handlePrintMembershipForm(claim)} disabled={isPrintingMembershipForm === claim.id} size="sm" variant="outline">
                            {isPrintingMembershipForm === claim.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                            Notings
                          </Button>
                        )}
                         {claim.claimType === 'Research Papers' && claim.status === 'Pending' && (
                          <Button onClick={() => handlePrintResearchPaperForm(claim)} disabled={isPrintingResearchPaperForm === claim.id} size="sm" variant="outline">
                            {isPrintingResearchPaperForm === claim.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                            Notings
                          </Button>
                        )}
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
                    </div>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );

  const pageTitle = currentUser?.role === 'CRO' 
    ? `Incentive Claims from Your Faculties`
    : "Manage Incentive Claims";

  const pageDescription = currentUser?.role === 'CRO' 
    ? `Review claims submitted from your assigned faculties.` 
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
        <div className="flex items-center py-4 gap-4">
            <Input
                placeholder="Filter by claimant or title..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="max-w-sm"
            />
            <Select value={claimTypeFilter} onValueChange={setClaimTypeFilter}>
                <SelectTrigger className="w-[240px]">
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all">All ({allClaims.filter(c => claimTypeFilter === 'all' || c.claimType === claimTypeFilter).length})</TabsTrigger>
                <TabsTrigger value="pending">Pending ({allClaims.filter(c => c.status === 'Pending' && (claimTypeFilter === 'all' || c.claimType === claimTypeFilter)).length})</TabsTrigger>
                <TabsTrigger value="accepted">Accepted ({allClaims.filter(c => c.status === 'Accepted' && (claimTypeFilter === 'all' || c.claimType === claimTypeFilter)).length})</TabsTrigger>
                <TabsTrigger value="rejected">Rejected ({allClaims.filter(c => c.status === 'Rejected' && (claimTypeFilter === 'all' || c.claimType === claimTypeFilter)).length})</TabsTrigger>
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
      <ClaimDetailsDialog claim={selectedClaim} open={!!selectedClaim} onOpenChange={() => setSelectedClaim(null)} currentUser={currentUser} />
    </div>
  );
}
