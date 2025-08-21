
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { User, IncentiveClaim, Author, ApprovalStage } from '@/types';
import { Loader2, Printer, Check, X } from 'lucide-react';
import Link from 'next/link';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../ui/tooltip';


function getVerificationMark(approval: ApprovalStage | null | undefined, fieldId: string) {
    if (!approval) return null;
    const verifiedStatus = approval.verifiedFields?.[fieldId];
    if (verifiedStatus === true) return <Check className="h-4 w-4 text-green-600" />;
    if (verifiedStatus === false) return <X className="h-4 w-4 text-red-600" />;
    return null;
}

export function ClaimDetailsDialog({ claim, open, onOpenChange, currentUser, claimant, onTakeAction }: { claim: IncentiveClaim | null, open: boolean, onOpenChange: (open: boolean) => void, currentUser: User | null, claimant: User | null, onTakeAction?: () => void }) {
    const { toast } = useToast();
    const [isPrinting, setIsPrinting] = useState(false);

    if (!claim) return null;

    const renderDetail = (label: string, value?: string | number | boolean | string[] | Author[] | React.ReactNode) => {
        if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return null;
        
        let displayValue: React.ReactNode = String(value);
        if (typeof value === 'boolean') {
            displayValue = value ? 'Yes' : 'No';
        }
        if (Array.isArray(value)) {
             if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null && 'name' in value[0]) {
                displayValue = (
                    <ul className="list-disc pl-5">
                        {(value as Author[]).map((author, idx) => (
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
    
    const renderLinkDetail = (label: string, value?: string | string[]) => {
      if (!value || value.length === 0) return null;
      const urls = Array.isArray(value) ? value : [value];
      return (
        <div className="grid grid-cols-3 gap-2 py-1">
          <dt className="font-semibold text-muted-foreground col-span-1">{label}</dt>
          <dd className="col-span-2">
            <div className="flex flex-col gap-1">
                {urls.map((url, index) => (
                    <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
                        View Document {urls.length > 1 ? index + 1 : ''}
                    </a>
                ))}
            </div>
          </dd>
        </div>
      );
    }

    const isViewerAdmin = currentUser?.role === 'Super-admin' || currentUser?.role === 'admin' || currentUser?.allowedModules?.some(m => m.startsWith('incentive-approver-'));
    const canViewBankDetails = currentUser?.role === 'Super-admin' || currentUser?.role === 'admin';
    const canTakeAction = currentUser?.allowedModules?.some(m => m.startsWith('incentive-approver-')) && onTakeAction;
    const isFullyApproved = claim.status === 'Submitted to Accounts';

    const profileLink = claimant?.campus === 'Goa' ? `/goa/${claimant.misId}` : `/profile/${claimant.misId}`;
    const hasProfileLink = claimant && claimant.misId;

    const approval1 = claim.approvals?.find(a => a?.stage === 1);
    const approval2 = claim.approvals?.find(a => a?.stage === 2);
    
    const renderVerificationDetail = (fieldId: string, label: string, value?: string | number | null | boolean | string[]) => {
        if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return null;
        let displayValue = String(value);
        if (typeof value === 'boolean') {
            displayValue = value ? 'Yes' : 'No';
        }
        if (Array.isArray(value)) {
            displayValue = value.join(', ');
        }
        return (
            <div className="grid grid-cols-12 gap-2 text-sm items-center py-1">
                <span className="text-muted-foreground col-span-6">{label}</span>
                <span className="col-span-4">{displayValue}</span>
                <div className="col-span-2 flex justify-end gap-1">
                    <div className="w-7 h-7 flex items-center justify-center">
                        <TooltipProvider><Tooltip><TooltipTrigger>{getVerificationMark(approval1, fieldId)}</TooltipTrigger><TooltipContent><p>Approver 1 Verification</p></TooltipContent></Tooltip></TooltipProvider>
                    </div>
                     <div className="w-7 h-7 flex items-center justify-center">
                         <TooltipProvider><Tooltip><TooltipTrigger>{getVerificationMark(approval2, fieldId)}</TooltipTrigger><TooltipContent><p>Approver 2 Verification</p></TooltipContent></Tooltip></TooltipProvider>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Incentive Claim Details</DialogTitle>
                    <DialogDescription>Full submission details for claimant: {claim.userName}.</DialogDescription>
                </DialogHeader>
                <div className="max-h-[70vh] overflow-y-auto pr-4 space-y-2 text-sm">
                    {renderDetail("Claimant Name", hasProfileLink ? <Link href={profileLink} target="_blank" className="text-primary hover:underline">{claim.userName}</Link> : claim.userName)}
                    {renderDetail("Email", claim.userEmail)}
                    {renderDetail("Designation", claimant?.designation)}
                    {renderDetail("Department", claimant?.department)}
                    {renderDetail("Institute", claimant?.institute)}
                    {renderDetail("Faculty", claimant?.faculty)}
                    {renderDetail("Campus", claimant?.campus)}
                    {renderDetail("MIS ID", claim.misId)}
                    {renderDetail("ORCID ID", claim.orcidId)}
                    {renderDetail("Claim Type", claim.claimType)}
                    {renderDetail("Status", claim.status)}
                    {renderDetail("Submission Date", new Date(claim.submissionDate).toLocaleString())}
                    
                    {claim.claimType === 'Research Papers' && isViewerAdmin && (
                        <>
                            <hr className="my-2" />
                            <div className="space-y-4 rounded-lg border bg-muted/50 p-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-semibold">Research Paper Details (Verified)</h4>
                                    <div className="grid grid-cols-2 gap-1 text-xs font-semibold text-center">
                                        <span>Appr. 1</span>
                                        <span>Appr. 2</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    {renderVerificationDetail('name', 'Name of the Applicant', claimant?.name)}
                                    {renderVerificationDetail('designation', 'Designation and Dept.', `${claimant?.designation || 'N/A'}, ${claimant?.department || 'N/A'}`)}
                                    {renderVerificationDetail('publicationType', 'Type of publication', claim.publicationType)}
                                    {renderVerificationDetail('journalName', 'Name of Journal', claim.journalName)}
                                    {renderVerificationDetail('locale', 'Whether National/International', claim.locale)}
                                    {renderVerificationDetail('indexType', 'Indexed In', claim.indexType?.toUpperCase())}
                                    {renderVerificationDetail('wosType', 'WoS Type', claim.wosType)}
                                    {renderVerificationDetail('journalClassification', 'Q Rating of the Journal', claim.journalClassification)}
                                    {renderVerificationDetail('authorType', 'Role of the Author', claim.authorType)}
                                    {renderVerificationDetail('totalPuAuthors', 'No. of Authors from PU', claim.totalPuAuthors)}
                                    {renderVerificationDetail('printIssn', 'ISSN', `${claim.printIssn || 'N/A'} (Print), ${claim.electronicIssn || 'N/A'} (Electronic)`)}
                                    {renderVerificationDetail('publicationProofUrls', 'PROOF OF PUBLICATION ATTACHED', !!claim.publicationProofUrls && claim.publicationProofUrls.length > 0)}
                                    {renderVerificationDetail('isPuNameInPublication', 'Whether “PU” name exists', claim.isPuNameInPublication)}
                                    {renderVerificationDetail('publicationMonth', 'Published Month & Year', `${claim.publicationMonth}, ${claim.publicationYear}`)}
                                    {renderVerificationDetail('authorPosition', 'Author Position', claim.authorPosition)}
                                </div>
                            </div>
                        </>
                    )} 
                    
                    {claim.claimType === 'Research Papers' && !isViewerAdmin && (
                        <>
                           <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Research Paper Details</h4>
                            {renderDetail("Paper Title", claim.paperTitle)}
                            {renderDetail("Role of the Author", claim.authorType)}
                            {renderDetail("No. of Authors from PU", claim.totalPuAuthors)}
                            {renderDetail("Author Position", claim.authorPosition)}
                            {renderLinkDetail("DOI Link", claim.relevantLink)}
                            {renderLinkDetail("Scopus Link", claim.scopusLink)}
                            {renderDetail("Journal Name", claim.journalName)}
                            {renderLinkDetail("Journal Website", claim.journalWebsite)}
                            {renderDetail("Publication Type", claim.publicationType)}
                            {renderDetail("Index Type", claim.indexType?.toUpperCase())}
                            {renderDetail("Journal Classification", claim.journalClassification)}
                            {renderDetail("WoS Type", claim.wosType)}
                            {renderDetail("Locale", claim.locale)}
                            {renderDetail("Print ISSN", claim.printIssn)}
                            {renderDetail("Electronic ISSN", claim.electronicIssn)}
                            {renderDetail("Publication Month", claim.publicationMonth)}
                            {renderDetail("Publication Year", claim.publicationYear)}
                            {renderDetail("SDGs", claim.sdgGoals)}
                            {renderLinkDetail("Publication Proofs", claim.publicationProofUrls)}
                            {renderDetail("PU Name in Publication", claim.isPuNameInPublication)}
                            {renderDetail("Total Corresponding Authors", claim.totalCorrespondingAuthors)}
                            {renderDetail("Corresponding Author(s)", claim.correspondingAuthorNames)}
                            {renderDetail("Authors from PU", claim.bookCoAuthors)}
                            {renderDetail("Total PU Student Authors", claim.totalPuStudentAuthors)}
                            {renderDetail("PU Student Names", claim.puStudentNames)}
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
                            {renderDetail("Membership Type", claim.membershipType)}
                            {renderDetail("Locale", claim.membershipLocale)}
                            {renderDetail("Membership Number", claim.membershipNumber)}
                            {renderDetail("Amount Paid (INR)", claim.membershipAmountPaid?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }))}
                            {renderDetail("Payment Date", claim.membershipPaymentDate ? new Date(claim.membershipPaymentDate).toLocaleDateString() : 'N/A')}
                            {renderLinkDetail("Proof", claim.membershipProofUrl)}
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
                    <h4 className="font-semibold text-base mt-2">Benefit & Approval Details</h4>
                    {renderDetail("Benefit Mode", claim.benefitMode)}
                    {renderDetail("Calculated Incentive", claim.calculatedIncentive?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }))}
                    {(isViewerAdmin || isFullyApproved) && renderDetail("Final Approved Amount", claim.finalApprovedAmount?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }))}
                    
                    {claim.approvals && claim.approvals.length > 0 && (
                        <div className="space-y-2 pt-2">
                           <h4 className="font-semibold text-base">Approval History</h4>
                           {claim.approvals.filter(a => a !== null).map(approval => (
                               <div key={approval.stage} className="p-3 border rounded-md bg-muted/50">
                                   {isViewerAdmin ? (
                                    <>
                                       <p><strong>Stage {approval.stage}:</strong> {approval.status} by {approval.approverName}</p>
                                       <p className="text-xs text-muted-foreground">{new Date(approval.timestamp).toLocaleString()}</p>
                                       <p className="mt-1"><strong>Amount:</strong> ₹{approval.approvedAmount.toLocaleString('en-IN')}</p>
                                       <p className="mt-1"><strong>Comments:</strong> {approval.comments}</p>
                                    </>
                                   ) : (
                                    <>
                                      <p><strong>Stage {approval.stage}:</strong> {approval.status}</p>
                                      <p className="text-xs text-muted-foreground">{new Date(approval.timestamp).toLocaleDateString()}</p>
                                    </>
                                   )}
                               </div>
                           ))}
                        </div>
                    )}
                    
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
                    {canTakeAction && (
                        <Button onClick={onTakeAction}>Take Action</Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
