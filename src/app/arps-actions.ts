

'use server';

import { adminDb } from '@/lib/admin';
import type { IncentiveClaim, EmrInterest, User, Author, ApprovalStage } from '@/types';
import { parseISO, getYear } from 'date-fns';

// --- Policy Constants ---
const POLICY = {
    WEIGHTAGE: {
        PUBLICATION: 0.50,
        PATENT: 0.15,
        EMR: 0.15,
    },
    CAPS: {
        PUBLICATION: 50,
        PATENT: 15,
        EMR: 15,
    },
    MIN_PUBLICATIONS_REQUIRED: 10,
};

// --- Helper Functions ---

const round = (n: number) => Math.round(n * 100) / 100;

// Multiplier for Journal Publications (Policy 5.2.3)
function getJournalAuthorPositionMultiplier(claimantRole: Author['role'], authorPosition?: string): number {
    const position = parseInt(authorPosition || '0', 10);
    if (claimantRole === 'First Author' || claimantRole === 'Corresponding Author' || claimantRole === 'First & Corresponding Author') {
        return 0.7;
    }
    if (claimantRole === 'Co-Author') {
        if (!authorPosition || position <= 0) return 0; // Position must be specified for co-authors
        if (position <= 5) return 0.3;
        if (position > 5) return 0.1;
    }
    return 0; // Return 0 for any other role
}

// Multiplier for Books, Chapters, and Conference Proceedings (Policy 5.1.2)
function getBookConfAuthorPositionMultiplier(claimantRole: Author['role'], authorPosition?: string): number {
    const position = parseInt(authorPosition || '0', 10);
     if (claimantRole === 'First Author' || claimantRole === 'Corresponding Author' || claimantRole === 'First & Corresponding Author') {
        return 0.7;
    }
    if (claimantRole === 'Co-Author') {
        if (!authorPosition || position <= 0) return 0; // Position must be specified for co-authors
        if (position <= 5) return 0.3;
        if (position > 5) return 0.1;
    }
    return 0;
}


function getJournalPoints(claim: IncentiveClaim): { points: number, multiplier: number } {
    const { publicationType, journalClassification } = claim;
    let points = 0;
    let multiplier = 0;

    switch (publicationType) {
        case 'Original Research Article':
        case 'Research Articles/Short Communications':
            points = 8; 
            break;
        case 'Short Communication': 
            points = 6;
            break;
        case 'Review Articles':
        case 'Review Article':
             points = (journalClassification === 'Q1' || journalClassification === 'Q2') ? 8 : 6;
             multiplier = 1.0;
             break;
        case 'Case Report / Case Study': 
        case 'Case Reports/Short Surveys':
            points = 7; 
            break;
    }

    if (publicationType !== 'Review Articles' && publicationType !== 'Review Article') {
        switch (journalClassification) {
            case 'Q1': multiplier = 1.0; break;
            case 'Q2': multiplier = 0.7; break;
            case 'Q3': multiplier = 0.4; break;
            case 'Q4': multiplier = 0.3; break;
        }
    } else if (!multiplier) { 
         switch (journalClassification) {
            case 'Q1': multiplier = 1.0; break;
            case 'Q2': multiplier = 1.0; break;
            case 'Q3': multiplier = 1.0; break;
            case 'Q4': multiplier = 1.0; break;
        }
    }

    return { points, multiplier };
}

function getClaimDate(claim: IncentiveClaim): Date | null {
    const finalApproval = (claim.approvals || [])
        .filter((a): a is ApprovalStage => a !== null && a.status === 'Approved')
        .sort((a, b) => b.stage - a.stage)[0];
        
    if (finalApproval && finalApproval.timestamp) {
        return parseISO(finalApproval.timestamp);
    }
    
    return parseISO(claim.submissionDate);
}


// --- Main Calculation Functions ---

function calculatePublicationScore(claims: IncentiveClaim[], userId: string): { 
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
        
        // Indexing Validation
        if (!claim.indexType || !['scopus', 'wos', 'both', 'sci'].includes(claim.indexType.toLowerCase())) {
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

        const claimantAuthorInfo = claim.authors?.find(a => a.uid === userId);
        if (!claimantAuthorInfo) continue;
        
        if (!claim.journalClassification) continue; // Quartile undefined guard

        let claimScore = 0;
        
        const authorMultiplier = getJournalAuthorPositionMultiplier(claimantAuthorInfo.role, claim.authorPosition);
        const { points, multiplier: quartileMultiplier } = getJournalPoints(claim);
        claimScore = (points * quartileMultiplier) * authorMultiplier;
        
        const calculation = { base: points, multiplier: quartileMultiplier, authorMultiplier };
        
        if (claimScore > 0) {
            score += claimScore;
            contributingClaims.push({ claim, score: claimScore, calculation });
        }
    }
    return { score: round(score), count: publicationCount, contributingClaims };
}

function calculatePatentScore(claims: IncentiveClaim[], userId: string): { 
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
        
        if (!claim.patentInventors?.some(inv => inv.uid === userId)) continue;

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
        if (project.status !== 'Sanctioned' && project.status !== 'SANCTIONED') continue;
        if (!project.sanctionDate) continue;
        const sanctionDate = parseISO(project.sanctionDate);
        if (sanctionDate < startDate || sanctionDate > endDate) continue;

        let amount = 0;
        if (project.sanctionAmount) {
            amount = project.sanctionAmount;
        } else if (project.durationAmount) {
            const amountMatch = project.durationAmount.match(/Amount:\s*([\d,]+)/);
            if (amountMatch) {
                amount = parseInt(amountMatch[1].replace(/,/g, ''), 10);
            }
        }
        if (amount === 0) continue;

        const isPI = project.userId === userId;
        const isCoPi = !isPI && project.coPiUids?.includes(userId);

        let projectScore = 0;
        if (amount >= 2000000 && amount <= 5000000) {
            if (isPI) projectScore = 50;
            else if (isCoPi) projectScore = 15;
        } else if (amount > 5000000 && amount <= 10000000) {
            if (isPI) projectScore = 70;
            else if (isCoPi) projectScore = 20;
        } else if (amount > 10000000) {
            if (isPI) projectScore = 100;
            else if (isCoPi) projectScore = 25;
        }

        if (projectScore > 0) {
            score += projectScore;
            contributingProjects.push({ project, score: projectScore, calculation: { rolePoints: projectScore } });
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
    const claimsQuery = claimsRef.where('authorUids', 'array-contains', userId);
    
    const emrRef = adminDb.collection('emrInterests');
    const sanctionedStatuses = ['Sanctioned', 'SANCTIONED'];

    const emrPiQuery = emrRef.where('userId', '==', userId).where('status', 'in', sanctionedStatuses);
    const emrCoPiQuery = emrRef.where('coPiUids', 'array-contains', userId).where('status', 'in', sanctionedStatuses);

    const [claimsSnapshot, emrPiSnapshot, emrCoPiSnapshot] = await Promise.all([
      claimsQuery.get(),
      emrPiQuery.get(),
      emrCoPiQuery.get(),
    ]);
    
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


    const { score: rawPubScore, count: pubCount, contributingClaims: pubClaims } = calculatePublicationScore(claimsInPeriod, userId);

    if (pubCount < POLICY.MIN_PUBLICATIONS_REQUIRED) {
        return {
            success: true,
            data: {
                publications: { raw: 0, weighted: 0, final: 0, contributingClaims: [] },
                patents: { raw: 0, weighted: 0, final: 0, contributingClaims: [] },
                emr: { raw: 0, weighted: 0, final: 0, contributingProjects: [] },
                totalArps: 0,
                grade: 'DME (Minimum 10 publications required)',
            }
        };
    }
    
    const { score: rawPatentScore, contributingClaims: patentClaims } = calculatePatentScore(claimsInPeriod, userId);
    const { score: rawEmrScore, contributingProjects: emrProjects } = calculateEmrScore(uniqueEmrProjects, userId, startDate, endDate);

    const weightedPub = rawPubScore * POLICY.WEIGHTAGE.PUBLICATION;
    const weightedPatent = rawPatentScore * POLICY.WEIGHTAGE.PATENT;
    const weightedEmr = rawEmrScore * POLICY.WEIGHTAGE.EMR;

    const finalPubScore = Math.min(weightedPub, POLICY.CAPS.PUBLICATION);
    const finalPatentScore = Math.min(weightedPatent, POLICY.CAPS.PATENT);
    const finalEmrScore = Math.min(weightedEmr, POLICY.CAPS.EMR);
    
    const totalArps = round(finalPubScore + finalPatentScore + finalEmrScore);

    let grade = 'DME';
    if (totalArps >= 80) grade = 'SEE';
    else if (totalArps >= 50) grade = 'EE';
    else if (totalArps >= 30) grade = 'ME';
    
    return {
        success: true,
        data: {
            publications: { raw: round(rawPubScore), weighted: round(weightedPub), final: round(finalPubScore), contributingClaims: pubClaims },
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
    base: number;
    multiplier?: number;
    quartileMultiplier?: number;
    authorMultiplier?: number;
    applicantMultiplier?: number;
    rolePoints?: number;
};
