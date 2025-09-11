

'use server';

import type { IncentiveClaim, CoAuthor, Author } from '@/types';

// --- Research Paper Calculation ---

const SPECIAL_POLICY_FACULTIES = [
    "Faculty of Applied Sciences",
    "Faculty of Medicine",
    "Faculty of Homoeopathy",
    "Faculty of Ayurved",
    "Faculty of Nursing",
    "Faculty of Pharmacy",
    "Faculty of Physiotherapy",
    "Faculty of Public Health",
    "Faculty of Engineering & Technology"
];

function getBaseIncentiveForPaper(claimData: Partial<IncentiveClaim>, faculty: string): number {
    const isSpecialFaculty = SPECIAL_POLICY_FACULTIES.includes(faculty);
    const { journalClassification, indexType, wosType, publicationType } = claimData;

    if (isSpecialFaculty) {
        // Category A rules
        switch (journalClassification) {
            case 'Nature/Science/Lancet': return 50000;
            case 'Top 1% Journals': return 25000;
            case 'Q1': return 15000;
            case 'Q2': return 10000;
            case 'Q3': return 6000;
            case 'Q4': return 4000;
            default: return 0;
        }
    } else {
        // Category B rules
        if (journalClassification && ['Q1', 'Q2', 'Q3', 'Q4', 'Top 1% Journals', 'Nature/Science/Lancet'].includes(journalClassification)) {
             switch (journalClassification) {
                case 'Nature/Science/Lancet': return 50000;
                case 'Top 1% Journals': return 25000;
                case 'Q1': return 15000;
                case 'Q2': return 10000;
                case 'Q3': return 6000; 
                case 'Q4': return 4000;
                default: return 0;
            }
        }
        if (indexType === 'esci') return 2000;
        if (wosType === 'Q3' || wosType === 'Q4') return 3000;
        if (publicationType === 'UGC listed journals (Journals found qualified through UGC-CARE Protocol, Group-I)') return 1000;

        return 0;
    }
}

function adjustForPublicationType(baseAmount: number, publicationType: string | undefined): number {
    if (!publicationType) return baseAmount;
    switch (publicationType) {
        case 'Research Articles/Short Communications':
            return baseAmount;
        case 'Case Reports/Short Surveys':
            return baseAmount * 0.9;
        case 'Review Articles':
            return baseAmount * 0.8;
        case 'Letter to the Editor/Editorial':
             return 2500; // Total amount to be distributed
        default:
            return baseAmount;
    }
}

export async function calculateResearchPaperIncentive(
    claimData: Partial<IncentiveClaim>,
    faculty: string
): Promise<{ success: boolean; amount?: number; error?: string }> {
    try {
        if (claimData.isPuNameInPublication === false) {
            return { success: true, amount: 0 };
        }
        
        const { authors = [], userEmail, publicationType } = claimData;
        const totalAuthors = authors.length || 1;
        
        // Find the claimant in the author list
        const claimant = authors.find(a => a.email.toLowerCase() === userEmail?.toLowerCase());
        if (!claimant) {
            return { success: false, error: "Claimant not found in the author list." };
        }
        
        const baseIncentive = getBaseIncentiveForPaper(claimData, faculty);
        const totalSpecifiedIncentive = adjustForPublicationType(baseIncentive, publicationType);

        // Special case for Letter to Editor/Editorial
        if (publicationType === 'Letter to the Editor/Editorial') {
            const amountPerAuthor = totalSpecifiedIncentive / totalAuthors;
            return { success: true, amount: Math.round(amountPerAuthor) };
        }

        const internalAuthors = authors.filter(a => !a.isExternal);
        if (internalAuthors.length === 0) {
            return { success: true, amount: 0 }; // No PU authors
        }
        
        const mainAuthors = internalAuthors.filter(a => a.role === 'First Author' || a.role === 'Corresponding Author' || a.role === 'First & Corresponding Author');
        const coAuthors = internalAuthors.filter(a => a.role === 'Co-Author');

        let finalAmount = 0;

        // Rule 1: First or Corresponding author from PU is the sole internal author
        if (mainAuthors.length === 1 && coAuthors.length === 0 && internalAuthors.length === 1) {
            finalAmount = totalSpecifiedIncentive;
        }
        // Rule 4: First/Corresponding author from PU and one or more Co-authors also from PU
        else if (mainAuthors.length > 0 && coAuthors.length > 0) {
            const mainAuthorSharePool = totalSpecifiedIncentive * 0.7;
            const coAuthorSharePool = totalSpecifiedIncentive * 0.3;
            
            if (claimant.role === 'Co-Author') {
                finalAmount = coAuthorSharePool / (coAuthors.length || 1);
            } else { // Is a main author
                finalAmount = mainAuthorSharePool / (mainAuthors.length || 1);
            }
        }
        // Rule 2: Single Co-author from PU with other Co-authors from other institutions
        else if (coAuthors.length === 1 && mainAuthors.length === 0 && internalAuthors.length === 1) {
             finalAmount = totalSpecifiedIncentive * 0.8;
        }
        // Rule 3: Multiple Co-authors from PU (and no main authors from PU)
        else if (coAuthors.length > 1 && mainAuthors.length === 0) {
            const sharePerCoAuthor = (totalSpecifiedIncentive * 0.8) / (coAuthors.length || 1);
            finalAmount = sharePerCoAuthor;
        }
        // Fallback for cases like multiple main authors from PU but no co-authors
        else if (mainAuthors.length > 0 && coAuthors.length === 0) {
            finalAmount = totalSpecifiedIncentive / mainAuthors.length;
        }

        return { success: true, amount: Math.round(finalAmount) };

    } catch (error: any) {
        console.error("Error calculating incentive:", error);
        return { success: false, error: "Calculation failed: " + error.message };
    }
}


// --- Book/Chapter Calculation ---

function getBaseIncentiveForBook(claimData: Partial<IncentiveClaim>, isChapter: boolean): number {
    const isScopus = claimData.isScopusIndexed === true;
    const pubType = claimData.publisherType;
    const pages = isChapter ? (claimData.bookChapterPages || 0) : (claimData.bookTotalPages || 0);

    if (isChapter) {
        if (isScopus) return 6000;
        if (pubType === 'National') {
            if (pages > 20) return 2500;
            if (pages >= 10) return 1500;
            if (pages >= 5) return 500;
        } else if (pubType === 'International') {
            if (pages > 20) return 3000;
            if (pages >= 10) return 2000;
            if (pages >= 5) return 1000;
        }
    } else { // Full Book
        if (isScopus) return 18000;
        if (pubType === 'National') {
            if (pages > 350) return 3000;
            if (pages >= 200) return 2500;
            if (pages >= 100) return 2000;
            return 1000;
        } else if (pubType === 'International') {
            if (pages > 350) return 6000;
            if (pages >= 200) return 3500;
            return 2000;
        }
    }
    return 0;
}


export async function calculateBookIncentive(claimData: Partial<IncentiveClaim>): Promise<{ success: boolean; amount?: number; error?: string }> {
    try {
        const isChapter = claimData.bookApplicationType === 'Book Chapter';
        let baseIncentive = getBaseIncentiveForBook(claimData, isChapter);

        if (claimData.authorRole === 'Editor') {
            baseIncentive /= 2;
        }

        let totalIncentive = baseIncentive;
        
        if (isChapter && claimData.chaptersInSameBook && claimData.chaptersInSameBook > 1) {
            const n = claimData.chaptersInSameBook;
            const fullBookData = { ...claimData, bookTotalPages: 999 };
            const baseBookIncentive = getBaseIncentiveForBook(fullBookData, false);
            
            let sum = 0;
            for (let k = 1; k <= n; k++) {
                sum += baseIncentive / k;
                if (sum >= baseBookIncentive) {
                    sum = baseBookIncentive;
                    break;
                }
            }
            totalIncentive = Math.min(sum, baseBookIncentive);
        }

        const internalAuthorsCount = claimData.authors?.filter(a => !a.isExternal).length || 0;
        if (internalAuthorsCount > 1) {
            totalIncentive /= internalAuthorsCount;
        }

        return { success: true, amount: Math.round(totalIncentive) };
    } catch (error: any) {
        console.error("Error calculating book incentive:", error);
        return { success: false, error: error.message || "An unknown error occurred during calculation." };
    }
}

// --- APC Calculation ---

export async function calculateApcIncentive(claimData: Partial<IncentiveClaim>, isSpecialFaculty: boolean): Promise<{ success: boolean; amount?: number; error?: string }> {
    try {
        const { apcIndexingStatus, apcQRating, authors } = claimData;
        
        const internalAuthorCount = authors ? authors.filter(author => !author.isExternal).length : 0;
        if (internalAuthorCount === 0) {
          return { success: true, amount: 0 };
        }
        
        let maxTotalIncentive = 0;
    
        if (apcIndexingStatus?.includes('Scopus') || apcIndexingStatus?.includes('Web of science')) {
            switch (apcQRating) {
                case 'Q1': maxTotalIncentive = 40000; break;
                case 'Q2': maxTotalIncentive = 30000; break;
                case 'Q3': maxTotalIncentive = 20000; break;
                case 'Q4': maxTotalIncentive = 15000; break;
            }
        } else if (!isSpecialFaculty) {
            if (apcIndexingStatus?.includes('UGC-CARE Group-I')) {
                maxTotalIncentive = 5000;
            } else if (apcIndexingStatus?.includes('Web of Science indexed journals (ESCI)')) {
                maxTotalIncentive = 8000;
            }
        }
        
        const individualIncentive = maxTotalIncentive > 0 ? maxTotalIncentive / internalAuthorCount : 0;
        
        return { success: true, amount: Math.round(individualIncentive) };
    } catch (error: any) {
         console.error("Error calculating APC incentive:", error);
        return { success: false, error: error.message || "An unknown error occurred during calculation." };
    }
}

// --- Conference Calculation ---

export async function calculateConferenceIncentive(claimData: Partial<IncentiveClaim>): Promise<{ success: boolean; amount?: number; error?: string }> {
    try {
        const {
          conferenceType,
          conferenceVenue,
          presentationType,
          conferenceMode,
          registrationFee,
          travelFare,
          onlinePresentationOrder,
          organizerName,
        } = claimData;
    
        const totalExpenses = (registrationFee || 0) + (travelFare || 0);
        let maxReimbursement = 0;
    
        if (organizerName?.toLowerCase().includes('parul university')) {
          maxReimbursement = (registrationFee || 0) * 0.75;
        } else if (conferenceMode === 'Online') {
          const regFee = registrationFee || 0;
          switch (onlinePresentationOrder) {
            case 'First': maxReimbursement = Math.min(regFee * 0.75, 15000); break;
            case 'Second': maxReimbursement = Math.min(regFee * 0.60, 10000); break;
            case 'Third': maxReimbursement = Math.min(regFee * 0.50, 7000); break;
            case 'Additional': maxReimbursement = Math.min(regFee * 0.30, 2000); break;
          }
        } else if (conferenceMode === 'Offline') {
          if (conferenceType === 'International') {
            switch (conferenceVenue) {
              case 'Indian Subcontinent': maxReimbursement = 30000; break;
              case 'South Korea, Japan, Australia and Middle East': maxReimbursement = 45000; break;
              case 'Europe': maxReimbursement = 60000; break;
              case 'African/South American/North American': maxReimbursement = 75000; break;
              case 'India':
                maxReimbursement = presentationType === 'Oral' ? 20000 : 15000;
                break;
              case 'Other':
                maxReimbursement = 75000; // Defaulting to max for "Other" international
                break;
            }
          } else if (conferenceType === 'National') {
            maxReimbursement = presentationType === 'Oral' ? 12000 : 10000;
          } else if (conferenceType === 'Regional/State') {
            maxReimbursement = 7500;
          }
        }
        
        return { success: true, amount: Math.min(totalExpenses, maxReimbursement) };
    } catch (error: any) {
        console.error("Error calculating conference incentive:", error);
        return { success: false, error: error.message || "An unknown error occurred during calculation." };
    }
}

// --- Membership Calculation ---

export async function calculateMembershipIncentive(claimData: Partial<IncentiveClaim>): Promise<{ success: boolean; amount?: number; error?: string }> {
    try {
        const amountPaid = claimData.membershipAmountPaid || 0;
        if (amountPaid > 0) {
            const incentive = Math.min(amountPaid * 0.5, 10000);
            return { success: true, amount: incentive };
        }
        return { success: true, amount: 0 };
    } catch (error: any) {
        console.error("Error calculating membership incentive:", error);
        return { success: false, error: error.message || "An unknown error occurred during calculation." };
    }
}
