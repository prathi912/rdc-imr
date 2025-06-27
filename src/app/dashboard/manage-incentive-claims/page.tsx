
'use client';

import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Download } from "lucide-react";
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
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc, orderBy, query } from 'firebase/firestore';
import type { IncentiveClaim } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

const STATUSES: IncentiveClaim['status'][] = ['Pending', 'Accepted', 'Rejected'];

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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Incentive Claim Details</DialogTitle>
                    <DialogDescription>Full submission details for {claim.paperTitle}.</DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto pr-4 space-y-2 text-sm">
                    {renderDetail("Claimant Name", claim.userName)}
                    {renderDetail("Claimant Email", claim.userEmail)}
                    {renderDetail("Status", claim.status)}
                    {renderDetail("Submission Date", new Date(claim.submissionDate).toLocaleString())}
                    <hr className="my-2" />
                    {renderDetail("Paper Title", claim.paperTitle)}
                    {renderDetail("Journal Name", claim.journalName)}
                    {renderDetail("Claim Type", claim.claimType)}
                    {renderDetail("Publication Type", claim.publicationType)}
                    {renderDetail("Index Type", claim.indexType.toUpperCase())}
                    {renderDetail("WoS Type", claim.wosType)}
                    {renderDetail("Impact Factor", claim.impactFactor)}
                    {renderDetail("Publication Phase", claim.publicationPhase)}
                    {renderDetail("Author Type", claim.authorType)}
                    {renderDetail("Benefit Mode", claim.benefitMode)}
                    {renderDetail("Total Authors", claim.totalAuthors)}
                    {renderDetail("Total Internal Authors", claim.totalInternalAuthors)}
                    {renderDetail("Total Internal Co-Authors", claim.totalInternalCoAuthors)}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default function ManageIncentiveClaimsPage() {
  const [allClaims, setAllClaims] = useState<IncentiveClaim[]>([]);
  const [filteredClaims, setFilteredClaims] = useState<IncentiveClaim[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedClaim, setSelectedClaim] = useState<IncentiveClaim | null>(null);
  const { toast } = useToast();

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    try {
      const claimsCollection = collection(db, 'incentiveClaims');
      const q = query(claimsCollection, orderBy('submissionDate', 'desc'));
      const claimSnapshot = await getDocs(q);
      const claimList = claimSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as IncentiveClaim));
      setAllClaims(claimList);
    } catch (error) {
      console.error("Error fetching claims:", error);
      toast({ variant: 'destructive', title: "Error", description: "Could not fetch incentive claims." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  useEffect(() => {
    if (activeTab === 'all') {
      setFilteredClaims(allClaims);
    } else {
      const status = activeTab.charAt(0).toUpperCase() + activeTab.slice(1) as IncentiveClaim['status'];
      setFilteredClaims(allClaims.filter(claim => claim.status === status));
    }
  }, [activeTab, allClaims]);

  const handleStatusChange = useCallback(async (id: string, newStatus: IncentiveClaim['status']) => {
    try {
      const claimDoc = doc(db, 'incentiveClaims', id);
      await updateDoc(claimDoc, { status: newStatus });
      toast({ title: 'Status Updated', description: "The claim's status has been changed." });
      fetchClaims(); 
    } catch (error) {
       console.error("Error updating status:", error);
       toast({ variant: 'destructive', title: "Error", description: "Could not update status." });
    }
  }, [fetchClaims, toast]);

  const handleExport = () => {
    if (filteredClaims.length === 0) {
      toast({ variant: 'destructive', title: "No Data", description: "There are no claims to export in the current view." });
      return;
    }
    const worksheet = XLSX.utils.json_to_sheet(filteredClaims);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Claims");
    XLSX.writeFile(workbook, `incentive_claims_${activeTab}.xlsx`);
    toast({ title: "Export Started", description: `Downloading ${filteredClaims.length} claims.` });
  };
  
  const renderTable = () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Claimant</TableHead>
          <TableHead className="hidden md:table-cell">Paper Title</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filteredClaims.map((claim) => (
            <TableRow key={claim.id}>
              <TableCell className="font-medium">{claim.userName}</TableCell>
              <TableCell className="hidden md:table-cell max-w-sm truncate">{claim.paperTitle}</TableCell>
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

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Manage Incentive Claims" description="Review and manage all submitted incentive claims.">
         <Button onClick={handleExport} disabled={loading}>
            <Download className="mr-2 h-4 w-4" />
            Export XLSX
         </Button>
      </PageHeader>
      <div className="mt-8">
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
                 ) : filteredClaims.length > 0 ? (
                    renderTable()
                 ) : (
                    <div className="text-center py-10 text-muted-foreground">
                        <p>No claims found for this category.</p>
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
