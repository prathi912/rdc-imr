
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { db } from '@/lib/config';
import { collection, getDocs, doc, orderBy, query, where } from 'firebase/firestore';
import type { IncentiveClaim, User } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateIncentiveClaimStatus, exportClaimToExcel } from '@/app/actions';
import { generateBookIncentiveForm } from '@/app/incentive-actions';

const STATUSES: IncentiveClaim['status'][] = ['Pending', 'Accepted', 'Rejected'];
const CLAIM_TYPES = ['Research Papers', 'Patents', 'Conference Presentations', 'Books', 'Membership of Professional Bodies', 'Seed Money for APC'];
type SortableKeys = keyof Pick<IncentiveClaim, 'userName' | 'paperTitle' | 'submissionDate' | 'status' | 'claimType'>;


function ClaimDetailsDialog({ claim, open, onOpenChange, currentUser }: { claim: IncentiveClaim | null, open: boolean, onOpenChange: (open: boolean) => void, currentUser: User | null }) {
    const { toast } = useToast();
    const [isPrinting, setIsPrinting] = useState(false);

    if (!claim) return null;

    const handlePrint = async () => {
        if (!claim) return;
        setIsPrinting(true);
        try {
            const result = await exportClaimToExcel(claim.id);
            if (result.success && result.fileData) {
                const byteCharacters = atob(result.fileData);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `claim_${claim.userName.replace(/\s/g, '_')}_${claim.id.substring(0,5)}.xlsx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
                toast({ title: "Export Successful", description: "Claim details have been exported." });
            } else {
                throw new Error(result.error || "Failed to export data.");
            }
        } catch (error: any) {
            console.error("Print error:", error);
            toast({ variant: 'destructive', title: "Export Failed", description: error.message });
        } finally {
            setIsPrinting(false);
        }
    };

    const renderDetail = (label: string, value?: string | number | boolean | string[] | { name: string, email: string, role: string }[]) => {
        if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return null;
        let displayValue: React.ReactNode = String(value);
        if (typeof value === 'boolean') {
            displayValue = value ? 'Yes' : 'No';
        }
        if (Array.isArray(value)) {
             if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null && 'name' in value[0]) {
                displayValue = (
                    <ul className="list-disc pl-5">
                        {(value as { name: string, email: string, role: string }[]).map((author, idx) => (
                            <li key={idx}><strong>{author.name}</strong> ({author.role}) - {author.email}</li>
                        ))}
                    </ul>
                );
            } else {
                 displayValue = (value as string[]).join(', ');
            }
        }
        return (
            <div className="grid grid-cols-3 gap-2 py-1">
                <dt className="font-semibold text-muted-foreground col-span-1">{label}</dt>
                <dd className="col-span-2">{displayValue}</dd>
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
              View Document
            </a>
          </dd>
        </div>
      );
    }

    const canViewBankDetails = currentUser?.role === 'Super-admin' || currentUser?.role === 'admin';


    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Incentive Claim Details</DialogTitle>
                    <DialogDescription>Full submission details for claimant: {claim.userName}.</DialogDescription>
                </DialogHeader>
                <div className="max-h-[70vh] overflow-y-auto pr-4 space-y-2 text-sm">
                    {renderDetail("Claimant Name", claim.userName)}
                    {renderDetail("Claimant Email", claim.userEmail)}
                    {renderDetail("MIS ID", claim.misId)}
                    {renderDetail("ORCID ID", claim.orcidId)}
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
                            {renderDetail("Specification Type", claim.patentSpecificationType)}
                            {renderDetail("Application/Ref No.", claim.patentApplicationNumber)}
                            {renderDetail("Patent Status", claim.patentStatus)}
                            {renderDetail("Applicant Type", claim.patentApplicantType === 'Sole' ? 'Parul University as Sole Applicant' : 'Parul University as Joint Applicant')}
                            {renderDetail("PU as Applicant?", claim.patentFiledInPuName)}
                            {renderDetail("Filed from IPR Cell?", claim.patentFiledFromIprCell)}
                            {renderDetail("Permission Taken (if not from IPR Cell)", claim.patentPermissionTaken)}
                            {renderDetail("Total Students", claim.patentTotalStudents)}
                            {renderDetail("Student Names", claim.patentStudentNames)}
                            {renderLinkDetail("Approval Proof", claim.patentApprovalProofUrl)}
                            {renderLinkDetail("Form 1 Proof", claim.patentForm1Url)}
                            {renderLinkDetail("Govt. Receipt Proof", claim.patentGovtReceiptUrl)}
                            {renderDetail("Self Declaration", claim.patentSelfDeclaration)}
                        </>
                    )}
                    
                    {claim.claimType === 'Conference Presentations' && (
                         <>
                            <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Conference & Event Details</h4>
                            {renderDetail("Paper Title", claim.conferencePaperTitle)}
                            {renderDetail("Conference Name", claim.conferenceName)}
                            {renderDetail("Organizer", claim.organizerName)}
                            {renderLinkDetail("Event Website", claim.eventWebsite)}
                            {renderDetail("Conference Date", claim.conferenceDate ? new Date(claim.conferenceDate).toLocaleDateString() : '')}
                            {renderDetail("Presentation Date", claim.presentationDate ? new Date(claim.presentationDate).toLocaleDateString() : '')}
                            {renderDetail("Conference Type", claim.conferenceType)}
                            {renderDetail("Presentation Type", claim.presentationType)}
                            {renderDetail("Presentation Mode", claim.conferenceMode)}
                            {renderDetail("Online Presentation Order", claim.onlinePresentationOrder)}
                            
                            <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Expense & Travel Details</h4>
                            {renderDetail("Registration Fee", claim.registrationFee?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }))}
                            {renderDetail("Venue/Location", claim.conferenceVenue)}
                            {claim.conferenceMode === 'Offline' && (
                                <>
                                {renderDetail("Place Visited", claim.travelPlaceVisited)}
                                {renderDetail("Travel Mode", claim.travelMode)}
                                {renderDetail("Travel Fare", claim.travelFare?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }))}
                                </>
                            )}
                            
                            <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Declarations & Proofs</h4>
                            {renderDetail("Presenting Author?", claim.wasPresentingAuthor)}
                            {renderDetail("PU Name in Paper?", claim.isPuNamePresent)}
                            {renderDetail("Won a Prize?", claim.wonPrize)}
                            {renderDetail("Prize Details", claim.prizeDetails)}
                            {renderDetail("Attended Other Conference?", claim.attendedOtherConference)}
                            {renderDetail("Self-Declaration Agreed?", claim.conferenceSelfDeclaration)}

                             <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Uploaded Documents</h4>
                            {renderLinkDetail("Abstract", claim.abstractUrl)}
                            {renderLinkDetail("Registration Fee Proof", claim.registrationFeeProofUrl)}
                            {renderLinkDetail("Participation Certificate", claim.participationCertificateUrl)}
                            {renderLinkDetail("Prize Proof", claim.prizeProofUrl)}
                            {renderLinkDetail("Travel Receipts", claim.travelReceiptsUrl)}
                            {renderLinkDetail("Proof of Govt. Funding Request", claim.govtFundingRequestProofUrl)}
                        </>
                    )}

                    {claim.claimType === 'Books' && (
                        <>
                            <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Book/Chapter Details</h4>
                            {renderDetail("Application Type", claim.bookApplicationType)}
                            {renderDetail("Title", claim.publicationTitle)}
                            {claim.bookApplicationType === 'Book Chapter' && renderDetail("Book Title", claim.bookTitleForChapter)}
                            {renderDetail("Author(s)", claim.bookCoAuthors)}
                            {claim.bookApplicationType === 'Book Chapter' && renderDetail("Editor(s)", claim.bookEditor)}
                            {renderDetail("Publisher", claim.publisherName)}
                            {renderDetail("Publisher Type", claim.publisherType)}
                            {renderDetail("Publisher Website", claim.publisherWebsite)}
                            {claim.publicationMode === 'Print Only' && renderDetail("ISBN (Print)", claim.isbnPrint)}
                            {claim.publicationMode === 'Electronic Only' && renderDetail("ISBN (Electronic)", claim.isbnElectronic)}
                            {claim.publicationMode === 'Print & Electronic' && (
                                <>
                                {renderDetail("ISBN (Print)", claim.isbnPrint)}
                                {renderDetail("ISBN (Electronic)", claim.isbnElectronic)}
                                </>
                            )}
                            {renderDetail("Publication Year Order", claim.publicationOrderInYear)}
                            {renderDetail("Total PU Authors", claim.bookCoAuthors?.filter(a => !a.isExternal).length)}
                            {renderDetail("Total PU Students", claim.totalPuStudents)}
                            {renderDetail("Student Names", claim.puStudentNames)}
                            {claim.bookApplicationType === 'Book Chapter' ? renderDetail("Chapter Pages", claim.bookChapterPages) : renderDetail("Total Book Pages", claim.bookTotalPages)}
                            {renderDetail("Scopus Indexed", claim.isScopusIndexed)}
                            {renderDetail("Author/Editor Role", claim.authorRole)}
                            {renderLinkDetail("Publication Proof", claim.bookProofUrl)}
                            {renderLinkDetail("Scopus Proof", claim.scopusProofUrl)}
                            {renderDetail("Self Declaration", claim.bookSelfDeclaration)}
                        </>
                    )}

                    {claim.claimType === 'Membership of Professional Bodies' && (
                        <>
                            <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Professional Body Membership Details</h4>
                            {renderDetail("Professional Body Name", claim.professionalBodyName)}
                            {renderDetail("Membership Fee (INR)", claim.membershipFee?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }))}
                            {renderLinkDetail("Proof of Membership", claim.membershipProofUrl)}
                            {renderDetail("Self Declaration", claim.membershipSelfDeclaration)}
                        </>
                    )}

                    {claim.claimType === 'Seed Money for APC' && (
                         <>
                            <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">APC Claim Details</h4>
                            {renderDetail("Article Type", claim.apcTypeOfArticle === 'Other' ? claim.apcOtherArticleType : claim.apcTypeOfArticle)}
                            {renderDetail("Paper Title", claim.apcPaperTitle)}
                            {renderDetail("Authors", claim.apcAuthors)}
                            {renderDetail("Total Student Authors", claim.apcTotalStudentAuthors)}
                            {renderDetail("Student Names", claim.apcStudentNames)}
                            {renderDetail("Journal Details", claim.apcJournalDetails)}
                            {renderDetail("Journal Q-Rating", claim.apcQRating)}
                            {renderDetail("Journal Type", claim.apcNationalInternational)}
                            {renderLinkDetail("Journal Website", claim.apcJournalWebsite)}
                            {renderDetail("ISSN", claim.apcIssnNo)}
                            {renderDetail("Indexing Status", claim.apcIndexingStatus)}
                            {claim.apcIndexingStatus?.includes('Other') && renderDetail("Other Indexing", claim.apcOtherIndexingStatus)}
                            {renderDetail("SCI Impact Factor", claim.apcSciImpactFactor)}
                            {renderDetail("APC Waiver Requested?", claim.apcApcWaiverRequested)}
                            {renderLinkDetail("Waiver Request Proof", claim.apcApcWaiverProofUrl)}
                            {renderDetail("PU Name in Publication?", claim.apcPuNameInPublication)}
                            {renderDetail("Total APC Amount", claim.apcTotalAmount?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }))}
                            {renderDetail("Amount Claimed", claim.apcAmountClaimed?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }))}
                            {renderDetail("Self Declaration", claim.apcSelfDeclaration)}
                            <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Uploaded APC Documents</h4>
                            {renderLinkDetail("Publication Proof", claim.apcPublicationProofUrl)}
                            {renderLinkDetail("Invoice/Payment Proof", claim.apcInvoiceProofUrl)}
                        </>
                    )}

                    <hr className="my-2" />
                    <h4 className="font-semibold text-base mt-2">Author & Benefit Details</h4>
                    {renderDetail("Author Type", claim.authorType)}
                    {renderDetail("Benefit Mode", claim.benefitMode)}
                    {renderDetail("Total Authors", claim.totalAuthors)}
                     {claim.claimType === 'Books' && renderDetail("Calculated Incentive", claim.calculatedIncentive?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }))}
                    
                    {canViewBankDetails && claim.bankDetails && (
                        <>
                            <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Bank Account Details (Visible to Admins only)</h4>
                            {renderDetail("Beneficiary Name", claim.bankDetails.beneficiaryName)}
                            {renderDetail("Account Number", claim.bankDetails.accountNumber)}
                            {renderDetail("Bank Name", claim.bankDetails.bankName)}
                            {renderDetail("Branch Name", claim.bankDetails.branchName)}
                            {renderDetail("City", claim.bankDetails.city)}
                            {renderDetail("IFSC Code", claim.bankDetails.ifscCode)}
                        </>
                    )}
                </div>
                <DialogFooter className="gap-2">
                    <Button onClick={handlePrint} disabled={isPrinting}>
                        {isPrinting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                        Export to Excel
                    </Button>
                </DialogFooter>
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
  const [claimTypeFilter, setClaimTypeFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' }>({ key: 'submissionDate', direction: 'descending' });
  const [isPrintingBookForm, setIsPrintingBookForm] = useState<string | null>(null);

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
               <Button variant="ghost" onClick={() => requestSort('paperTitle')}>
                  Title <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead className="hidden lg:table-cell">
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
                <TableCell className="hidden md:table-cell max-w-sm truncate">{claim.paperTitle || claim.patentTitle || claim.conferencePaperTitle || claim.publicationTitle || claim.professionalBodyName || claim.apcPaperTitle}</TableCell>
                <TableCell className="hidden lg:table-cell"><Badge variant="outline">{claim.claimType}</Badge></TableCell>
                <TableCell>{new Date(claim.submissionDate).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Badge variant={claim.status === 'Accepted' ? 'default' : claim.status === 'Rejected' ? 'destructive' : 'secondary'}>{claim.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                        {(claim.claimType === 'Books' || claim.claimType === 'Book Chapter') && claim.status === 'Pending' && (
                            <Button onClick={() => handlePrintBookForm(claim)} disabled={isPrintingBookForm === claim.id} size="sm" variant="outline">
                                {isPrintingBookForm === claim.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
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
