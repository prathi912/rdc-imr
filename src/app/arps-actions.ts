
'use server';

import { adminDb } from '@/lib/admin';
import type { IncentiveClaim, EmrInterest, User, Author, ApprovalStage } from '@/types';
import { parseISO, getYear } from 'date-fns';

// --- Policy Constants ---
const POLICY = {
    WEIGHTAGE: {
        PUBLICATION: 0.80,
        PATENT: 0.05,
        EMR: 0.05,
    },
    CAPS: {
        PUBLICATION: 80,
        PATENT: 5,
        EMR: 5,
    },
    MIN_PUBLICATIONS_REQUIRED: 10,
};

// --- Helper Functions ---

const round = (n: number) => Math.round(n * 100) / 100;

function parseProjectDate(project: EmrInterest): Date | null {
    const rawDate = (project as any).sanctionDate ?? project.registeredAt;
    if (!rawDate) return null;

    if (typeof rawDate === 'string') {
        const isoParsed = parseISO(rawDate);
        if (!isNaN(isoParsed.getTime())) return isoParsed;

        const cleaned = rawDate.replace(/(\d+)(st|nd|rd|th)/gi, '$1').trim();
        const fallbackParsed = new Date(cleaned);
        if (!isNaN(fallbackParsed.getTime())) return fallbackParsed;
        return null;
    }

    if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
        return rawDate;
    }

    if (typeof rawDate === 'object' && typeof (rawDate as any).toDate === 'function') {
        const dateValue = (rawDate as any).toDate();
        if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
            return dateValue;
        }
    }

    return null;
}

function parseProjectAmount(project: EmrInterest): number {
    const directAmount = (project as any).sanctionAmount;
    if (typeof directAmount === 'number' && directAmount > 0) {
        return directAmount;
    }
    if (typeof directAmount === 'string') {
        const numeric = parseFloat(directAmount.replace(/[^\d.]/g, ''));
        if (!isNaN(numeric) && numeric > 0) return numeric;
    }

    const durationAmount = project.durationAmount || '';
    const labelledMatch = durationAmount.match(/Amount\s*:\s*[^\d]*([\d,]+(?:\.\d+)?)/i);
    if (labelledMatch) {
        const value = parseFloat(labelledMatch[1].replace(/,/g, ''));
        if (!isNaN(value) && value > 0) return value;
    }

    const anyNumberMatch = durationAmount.match(/([\d,]+(?:\.\d+)?)/);
    if (anyNumberMatch) {
        const value = parseFloat(anyNumberMatch[1].replace(/,/g, ''));
        if (!isNaN(value) && value > 0) return value;
    }

    return 0;
}

// Multiplier for Journal Publications (Policy 5.2.3)
function getJournalAuthorPositionMultiplier(
    claimantRole: Author['role'], 
    authorPosition?: string,
    isSingleAuthorParulWithMultipleOtherInstitutions?: boolean
): number {
    const position = parseInt(authorPosition || '0', 10);
    
    // Single Author case
    if (claimantRole === 'Single Author') {
        return 1.0;
    }
    
    // Single Co-author from Parul University & Multiple Authors from Other Institutions
    if (isSingleAuthorParulWithMultipleOtherInstitutions && claimantRole === 'Co-Author') {
        return 0.8;
    }
    
    // First or Corresponding Author
    if (claimantRole === 'First Author' || claimantRole === 'Corresponding Author' || claimantRole === 'First & Corresponding Author') {
        return 0.7;
    }
    
    // Co-Author with position
    if (claimantRole === 'Co-Author') {
        if (!authorPosition || position <= 0) return 0; // Position must be specified for co-authors
        if (position <= 5) return 0.3;
        if (position > 5) return 0.1;
    }
    
    return 0; // Return 0 for any other role
}

// Multiplier for Books, Chapters, and Conference Proceedings (Policy 5.1.2)
function getBookConfAuthorPositionMultiplier(claimantRole: Author['role'], authorPosition?: string): number {
    // 5.1.2: Author Position Multiplier
    if (claimantRole === 'First Author' || claimantRole === 'Corresponding Author' || claimantRole === 'First & Corresponding Author') {
        return 0.7;
    }
    if (claimantRole === 'Co-Author') {
        const position = parseInt(authorPosition || '0', 10);
        if (!authorPosition || position <= 0) return 0; // Position must be specified for co-authors
        if (position <= 5) return 0.3;
        // For position > 5, no points according to policy
        return 0;
    }
    return 0;
}


function getJournalPoints(claim: IncentiveClaim): { points: number, multiplier: number } {
    const { publicationType, journalClassification } = claim;
    let quartilePoints = 0;
    let articleTypeMultiplier = 0;

    // 5.2.1 Points by Journal Quartile
    switch (journalClassification) {
        case 'Q1': quartilePoints = 15; break;
        case 'Q2': quartilePoints = 10; break;
        case 'Q3': quartilePoints = 6; break;
        case 'Q4': quartilePoints = 4; break;
    }

    // 5.2.2 Multiplier by Article Type
    switch (publicationType) {
        case 'Original Research Article':
        case 'Research Articles/Short Communications':
        case 'Short Communication':
            articleTypeMultiplier = 1.0;
            break;
        case 'Review Article':
        case 'Review Articles':
            // Review articles: Q1/Q2 = 1.0, Q3/Q4 = 0.8
            if (journalClassification === 'Q1' || journalClassification === 'Q2') {
                articleTypeMultiplier = 1.0;
            } else {
                articleTypeMultiplier = 0.8;
            }
            break;
        case 'Case Report / Case Study':
        case 'Case Reports/Short Surveys':
            articleTypeMultiplier = 0.9;
            break;
    }

    return { points: quartilePoints, multiplier: articleTypeMultiplier };
}

// 5.1 Points for Book Chapter, Publication & Conference Proceedings
function getBookChapterPoints(claim: IncentiveClaim): { points: number } {
    // 5.1.1: Scopus Indexed Book Chapter = 6 points
    return { points: 6 };
}

function getBookPoints(claim: IncentiveClaim): { points: number, divisor: number } {
    // 5.1.1: Scopus Indexed Book (Edited a book) = 18 points divided among total number of editors
    const totalEditors = claim.totalCorrespondingAuthors || claim.authors?.length || 1;
    return { points: 18, divisor: totalEditors };
}

function getConferenceProceedingsPoints(claim: IncentiveClaim): { points: number } {
    // 5.1.1: Scopus-Indexed Conference Proceedings = 3 points
    return { points: 3 };
}

function getClaimDate(claim: IncentiveClaim): Date | null {
    const finalApproval = (claim.approvals || [])
        .filter((a): a is ApprovalStage => a !== null && ['Approved', 'Accepted', 'Submitted to Accounts', 'Payment Completed'].includes(a.status))
        .sort((a, b) => b.stage - a.stage)[0];
        
    if (finalApproval && finalApproval.timestamp) {
        try {
            return parseISO(finalApproval.timestamp);
        } catch (e) {
            // Fallback parsing for DD/MM/YYYY, HH:mm:ss format
            const parts = finalApproval.timestamp.split(', ');
            if (parts.length === 2) {
                const datePart = parts[0]; // DD/MM/YYYY
                const timePart = parts[1]; // HH:mm:ss
                const [day, month, year] = datePart.split('/');
                if (day && month && year) {
                    const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timePart}`;
                    const parsed = new Date(dateStr);
                    if (!isNaN(parsed.getTime())) return parsed;
                }
            }
        }
    }
    
    // Fallback to submission date if no valid approval timestamp is found
    if (claim.submissionDate) {
        try {
            return parseISO(claim.submissionDate);
        } catch(e) {
            // Fallback parsing for submission date
            const parts = claim.submissionDate.split(', ');
            if (parts.length === 2) {
                const datePart = parts[0]; // DD/MM/YYYY
                const timePart = parts[1]; // HH:mm:ss
                const [day, month, year] = datePart.split('/');
                if (day && month && year) {
                    const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timePart}`;
                    const parsed = new Date(dateStr);
                    if (!isNaN(parsed.getTime())) return parsed;
                }
            }
        }
    }
    return null;
}


// --- Main Calculation Functions ---

function calculatePublicationScore(claims: IncentiveClaim[], userId: string, userEmail: string): { 
    score: number; 
    count: number;
    contributingClaims: { 
        claim: IncentiveClaim, 
        score: number,
        calculation: CalculationDetails
    }[] 
} {
    let score = 0;
    const contributingClaims: { claim: IncentiveClaim, score: number, calculation: CalculationDetails }[] = [];
    const processedDois = new Set<string>();
    let publicationCount = 0;

    for (const claim of claims) {
        if (claim.claimType !== 'Research Papers') continue;
        
        // Indexing Validation (Case-insensitive)
        const indexType = claim.indexType?.toLowerCase();
        if (!indexType || !['scopus', 'wos', 'both', 'sci'].includes(indexType)) {
            continue;
        }
        
        // Deduplication by DOI
        if (claim.doi) {
            const normalizedDoi = claim.doi.toLowerCase().trim();
            if (processedDois.has(normalizedDoi)) {
                continue;
            }
            processedDois.add(normalizedDoi);
        }
        
        publicationCount++;

        const claimantAuthorInfo = claim.authors?.find(a => a.uid === userId || a.email?.toLowerCase() === userEmail);
        if (!claimantAuthorInfo) continue;
        
        if (!claim.journalClassification) continue; // Quartile undefined guard

        let claimScore = 0;
        
        // Check if this is a single co-author from Parul with multiple authors from other institutions
        const totalAuthors = claim.authors?.length || 0;
        const parulAuthors = claim.authors?.filter(a => a.name?.includes('Parul') || a.email?.includes('parul'))?.length || 0;
        const isSingleParulWithOthers = (claimantAuthorInfo.role === 'Co-Author' && parulAuthors === 1 && totalAuthors > 1);
        
        const authorMultiplier = getJournalAuthorPositionMultiplier(claimantAuthorInfo.role, claim.authorPosition, isSingleParulWithOthers);
        const { points: quartilePoints, multiplier: articleTypeMultiplier } = getJournalPoints(claim);
        // Formula: P_pub = (Quartile Points) × (Article Type Multiplier) × (Author Position Multiplier)
        claimScore = quartilePoints * articleTypeMultiplier * authorMultiplier;
        
        const calculation = { base: quartilePoints, multiplier: articleTypeMultiplier, authorMultiplier };
        
        if (claimScore > 0) {
            score += claimScore;
            contributingClaims.push({ claim, score: claimScore, calculation });
        }
    }
    return { score: round(score), count: publicationCount, contributingClaims };
}

function calculateBookChapterScore(claims: IncentiveClaim[], userId: string, userEmail: string): { 
    score: number; 
    contributingClaims: { 
        claim: IncentiveClaim, 
        score: number,
        calculation: CalculationDetails 
    }[] 
} {
    let score = 0;
    const contributingClaims: { claim: IncentiveClaim, score: number, calculation: CalculationDetails }[] = [];

    for (const claim of claims) {
        console.log(`ARPS BookChapter: Processing claim ${claim.id}, type: ${claim.claimType}, status: ${claim.status}`);
        const claimType = claim.claimType?.toLowerCase() || '';
        // For Book Chapter claims: claimType is 'Books' and applicationTypeOrPublicationType should indicate 'Book Chapter'
        if (claimType !== 'books') {
            console.log(`ARPS BookChapter: Skipping claim ${claim.id}, not 'books'`);
            continue;
        }
        
        // Check if this is specifically a Book Chapter (not a full book)
        const isBookChapter = (claim.publicationType?.toLowerCase() === 'book chapter' || 
                              (claim as any).bookApplicationType?.toLowerCase() === 'book chapter' ||
                              claim.eventType?.toLowerCase() === 'book chapter');
        
        console.log(`ARPS BookChapter: Claim ${claim.id}, isBookChapter: ${isBookChapter}, bookApplicationType: ${(claim as any).bookApplicationType}`);
        if (!isBookChapter) {
            console.log(`ARPS BookChapter: Skipping claim ${claim.id}, not a book chapter`);
            continue;
        } // Skip if not a book chapter
        
        // Book chapters must be Scopus indexed (Policy 5.1.1: Scopus Indexed Book Chapter)
        const isScopusIndexed = (claim as any).isScopusIndexed;
        console.log(`ARPS BookChapter: Claim ${claim.id}, isScopusIndexed: ${isScopusIndexed}`);
        if (isScopusIndexed === false) {
            console.log(`ARPS BookChapter: Skipping claim ${claim.id}, not Scopus indexed`);
            continue; // Skip if explicitly marked as not Scopus indexed
        }
        
        const claimantAuthorInfo = claim.authors?.find(a => a.uid === userId || a.email?.toLowerCase() === userEmail);
        console.log(`ARPS BookChapter: Claim ${claim.id}, claimant found: ${!!claimantAuthorInfo}, userId: ${userId}, userEmail: ${userEmail}, authors: ${claim.authors?.map(a => ({uid: a.uid, email: a.email}))}`);
        if (!claimantAuthorInfo) {
            console.log(`ARPS BookChapter: Skipping claim ${claim.id}, claimant not found`);
            continue;
        }

        const { points } = getBookChapterPoints(claim);
        const authorMultiplier = getBookConfAuthorPositionMultiplier(claimantAuthorInfo.role, claim.authorPosition);
        const claimScore = points * authorMultiplier;
        
        console.log(`ARPS BookChapter: Claim ${claim.id}, points: ${points}, multiplier: ${authorMultiplier}, score: ${claimScore}`);
        
        const calculation = { base: points, multiplier: authorMultiplier };
        
        if (claimScore > 0) {
            score += claimScore;
            contributingClaims.push({ claim, score: claimScore, calculation });
            console.log(`ARPS BookChapter: Added claim ${claim.id} to contributing, total score so far: ${score}`);
        }
    }
    console.log(`ARPS BookChapter: Final score: ${score}, contributing claims: ${contributingClaims.length}`);
    return { score: round(score), contributingClaims };
}

function calculateBookScore(claims: IncentiveClaim[], userId: string, userEmail: string): { 
    score: number; 
    contributingClaims: { 
        claim: IncentiveClaim, 
        score: number,
        calculation: CalculationDetails 
    }[] 
} {
    let score = 0;
    const contributingClaims: { claim: IncentiveClaim, score: number, calculation: CalculationDetails }[] = [];

    for (const claim of claims) {
        const claimType = claim.claimType?.toLowerCase() || '';
        // For full Book claims: claimType is 'Books' and should NOT be 'Book Chapter'
        if (claimType !== 'books') continue;
        
        // Check if this is specifically a full Book (not a chapter)
        const isFullBook = !(claim.publicationType?.toLowerCase() === 'book chapter' || 
                            (claim as any).bookApplicationType?.toLowerCase() === 'book chapter' ||
                            claim.eventType?.toLowerCase() === 'book chapter');
        
        if (!isFullBook) continue; // Skip if it's a book chapter
        
        // Books must be Scopus indexed (Policy 5.1.1: Scopus Indexed Book)
        const isScopusIndexed = (claim as any).isScopusIndexed;
        if (isScopusIndexed === false) {
            continue; // Skip if explicitly marked as not Scopus indexed
        }
        
        const claimantAuthorInfo = claim.authors?.find(a => a.uid === userId || a.email?.toLowerCase() === userEmail);
        if (!claimantAuthorInfo) continue;

        const { points, divisor } = getBookPoints(claim);
        // For edited books, points are divided among total number of editors
        const pointsPerEditor = points / divisor;
        const claimScore = pointsPerEditor;
        
        const calculation = { base: points, divisor: divisor, multiplier: 1 };
        
        if (claimScore > 0) {
            score += claimScore;
            contributingClaims.push({ claim, score: round(claimScore), calculation });
        }
    }
    return { score: round(score), contributingClaims };
}

function calculateConferenceProceedingsScore(claims: IncentiveClaim[], userId: string, userEmail: string): { 
    score: number; 
    contributingClaims: { 
        claim: IncentiveClaim, 
        score: number,
        calculation: CalculationDetails 
    }[] 
} {
    let score = 0;
    const contributingClaims: { claim: IncentiveClaim, score: number, calculation: CalculationDetails }[] = [];

    for (const claim of claims) {
        const claimType = claim.claimType?.toLowerCase() || '';
        // Match Conference Presentations or Conference Proceedings types
        if (claimType !== 'conference presentations' && claimType !== 'conference proceedings' && !claimType.includes('conference')) continue;
        
        const claimantAuthorInfo = claim.authors?.find(a => a.uid === userId || a.email?.toLowerCase() === userEmail);
        if (!claimantAuthorInfo) continue;

        const { points } = getConferenceProceedingsPoints(claim);
        const authorMultiplier = getBookConfAuthorPositionMultiplier(claimantAuthorInfo.role, claim.authorPosition);
        const claimScore = points * authorMultiplier;
        
        const calculation = { base: points, multiplier: authorMultiplier };
        
        if (claimScore > 0) {
            score += claimScore;
            contributingClaims.push({ claim, score: claimScore, calculation });
        }
    }
    return { score: round(score), contributingClaims };
}

function calculatePatentScore(claims: IncentiveClaim[], userId: string, userEmail: string): { 
    score: number; 
    contributingClaims: { 
        claim: IncentiveClaim, 
        score: number,
        calculation: CalculationDetails 
    }[] 
} {
    let score = 0;
    const contributingClaims: { claim: IncentiveClaim, score: number, calculation: CalculationDetails }[] = [];

    for (const claim of claims) {
        if (claim.claimType !== 'Patents') continue;
        
        if (!claim.patentInventors?.some(inv => inv.uid === userId || inv.email?.toLowerCase() === userEmail)) continue;

        let basePoints = 0;
        if (claim.currentStatus === 'Published') basePoints = 10;
        else if (claim.currentStatus === 'Granted') {
            basePoints = claim.patentLocale === 'International' ? 75 : 50;
        }

        let applicantMultiplier = 0;
        if (claim.patentFiledInPuName) {
            applicantMultiplier = claim.isPuSoleApplicant ? 1.0 : 0.8;
        }

        const claimScore = basePoints * applicantMultiplier;
        if (claimScore > 0) {
            score += claimScore;
            contributingClaims.push({ claim, score: claimScore, calculation: { base: basePoints, applicantMultiplier } });
        }
    }
    return { score: round(score), contributingClaims };
}


function calculateEmrScore(projects: EmrInterest[], userId: string, startDate: Date, endDate: Date): { 
    score: number; 
    contributingProjects: { 
        project: EmrInterest, 
        score: number,
        calculation: CalculationDetails 
    }[] 
} {
    let score = 0;
    const contributingProjects: { project: EmrInterest, score: number, calculation: CalculationDetails }[] = [];
    
    for (const project of projects) {
        const normalizedStatus = String(project.status || '').trim().toUpperCase();
        if (normalizedStatus !== 'SANCTIONED') continue;

        const projectDate = parseProjectDate(project);
        if (!projectDate) continue;
        if (projectDate < startDate || projectDate > endDate) continue;

        const amount = parseProjectAmount(project);
        if (amount === 0) continue;

        const isPI = project.userId === userId;
        const isCoPi = !isPI && (
            project.coPiUids?.includes(userId) ||
            project.coPiDetails?.some((coPi) => coPi.uid === userId)
        );

        let projectScore = 0;
        if (amount >= 2000000 && amount <= 5000000) {
            if (isPI) projectScore = 100;
            else if (isCoPi) projectScore = 30;
        } else if (amount > 5000000 && amount <= 10000000) {
            if (isPI) projectScore = 120;
            else if (isCoPi) projectScore = 40;
        } else if (amount > 10000000) {
            if (isPI) projectScore = 150;
            else if (isCoPi) projectScore = 50;
        }

        if (projectScore > 0) {
            score += projectScore;
            contributingProjects.push({
                project,
                score: projectScore,
                calculation: { rolePoints: projectScore, role: isPI ? 'PI' : 'Co-PI' }
            });
        }
    }
    return { score: round(score), contributingProjects };
}


// --- Main Exported Function ---

export async function calculateArpsForUser(userId: string, year: number) {
  try {
    const startDate = new Date(year - 1, 5, 1); // June 1st of the previous year
    const endDate = new Date(year, 4, 31, 23, 59, 59, 999); // May 31st of the selected year

    const claimsRef = adminDb.collection('incentiveClaims');
    const claimsQuery = claimsRef.where('uid', '==', userId);
    
    const emrRef = adminDb.collection('emrInterests');

    const emrPiQuery = emrRef.where('userId', '==', userId);
    const emrCoPiQuery = emrRef.where('coPiUids', 'array-contains', userId);

    const [claimsSnapshot, emrPiSnapshot, emrCoPiSnapshot] = await Promise.all([
      claimsQuery.get(),
      emrPiQuery.get(),
      emrCoPiQuery.get(),
    ]);
    
    const userSnap = await adminDb.collection('users').doc(userId).get();
    const userData = userSnap.data();
    const userEmail = userData?.email?.toLowerCase() || '';
    
    const approvedClaimStatuses: IncentiveClaim['status'][] = ['Accepted', 'Submitted to Accounts', 'Payment Completed'];
    
    const claimsInPeriod = claimsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as IncentiveClaim))
      .filter(claim => {
        if (!approvedClaimStatuses.includes(claim.status)) return false;
        
        const dateToCheck = getClaimDate(claim);

        if (!dateToCheck || isNaN(dateToCheck.getTime())) return false;

        return dateToCheck >= startDate && dateToCheck <= endDate;
      });
    
    const piProjects = emrPiSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));
    const coPiProjects = emrCoPiSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));

    const allEmrProjects = new Map<string, EmrInterest>();
    piProjects.forEach(p => allEmrProjects.set(p.id, p));
    coPiProjects.forEach(p => allEmrProjects.set(p.id, p));
    const uniqueEmrProjects = Array.from(allEmrProjects.values());


    const { score: rawPubScore, count: pubCount, contributingClaims: pubClaims } = calculatePublicationScore(claimsInPeriod, userId, userEmail);
    const { score: rawBookChapterScore, contributingClaims: bookChapterClaims } = calculateBookChapterScore(claimsInPeriod, userId, userEmail);
    console.log(`ARPS: User ${userId}, rawBookChapterScore: ${rawBookChapterScore}, bookChapterClaims: ${bookChapterClaims.length}`);
    const { score: rawBookScore, contributingClaims: bookClaims } = calculateBookScore(claimsInPeriod, userId, userEmail);
    const { score: rawConferenceProceedingsScore, contributingClaims: conferenceProceedingsClaims } = calculateConferenceProceedingsScore(claimsInPeriod, userId, userEmail);
    
    const rawPublicationRelatedScore = rawPubScore + rawBookChapterScore + rawBookScore + rawConferenceProceedingsScore;
    
    const { score: rawPatentScore, contributingClaims: patentClaims } = calculatePatentScore(claimsInPeriod, userId, userEmail);
    const { score: rawEmrScore, contributingProjects: emrProjects } = calculateEmrScore(uniqueEmrProjects, userId, startDate, endDate);

    const weightedPub = rawPublicationRelatedScore * POLICY.WEIGHTAGE.PUBLICATION;
    const weightedPatent = rawPatentScore * POLICY.WEIGHTAGE.PATENT;
    const weightedEmr = rawEmrScore * POLICY.WEIGHTAGE.EMR;

    const finalPubScore = Math.min(weightedPub, POLICY.CAPS.PUBLICATION);
    const finalPatentScore = Math.min(weightedPatent, POLICY.CAPS.PATENT);
    const finalEmrScore = Math.min(weightedEmr, POLICY.CAPS.EMR);
    
    const totalArps = round(finalPubScore + finalPatentScore + finalEmrScore);
    
    const publicationContributingClaims = [...pubClaims, ...bookChapterClaims, ...bookClaims, ...conferenceProceedingsClaims];
    const totalPublicationCount = pubCount + bookChapterClaims.length + bookClaims.length + conferenceProceedingsClaims.length;

    let grade = 'DME';
    if (totalArps >= 80) grade = 'SEE';
    else if (totalArps >= 50) grade = 'EE';
    else if (totalArps >= 30) grade = 'ME';
    
    if (totalPublicationCount < POLICY.MIN_PUBLICATIONS_REQUIRED) {
        grade += ' (Minimum 10 publications required)';
    }

    return {
        success: true,
        data: {
            publications: { raw: round(rawPubScore), weighted: round(weightedPub), final: round(finalPubScore), contributingClaims: publicationContributingClaims },
            bookChapters: { raw: round(rawBookChapterScore), contributingClaims: bookChapterClaims },
            books: { raw: round(rawBookScore), contributingClaims: bookClaims },
            conferenceProceedings: { raw: round(rawConferenceProceedingsScore), contributingClaims: conferenceProceedingsClaims },
            patents: { raw: round(rawPatentScore), weighted: round(weightedPatent), final: round(finalPatentScore), contributingClaims: patentClaims },
            emr: { raw: round(rawEmrScore), weighted: round(weightedEmr), final: round(finalEmrScore), contributingProjects: emrProjects },
            totalArps: totalArps,
            grade: grade,
        }
    };

  } catch (error: any) {
    console.error("Error calculating ARPS:", error);
    return { success: false, error: "Failed to calculate ARPS score." };
  }
}


type CalculationDetails = {
    base?: number;
    multiplier?: number;
    quartileMultiplier?: number;
    authorMultiplier?: number;
    applicantMultiplier?: number;
    rolePoints?: number;
    role?: 'PI' | 'Co-PI';
};
