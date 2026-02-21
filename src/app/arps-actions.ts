

'use server';

import { adminDb } from '@/lib/admin';
import type { IncentiveClaim, EmrInterest, User, Author, ApprovalStage } from '@/types';
import { parseISO } from 'date-fns';

// --- Helper Functions ---

// Multiplier for Journal Publications (Policy 5.2.3)
function getJournalAuthorPositionMultiplier(claimantRole: Author['role'], authorPosition?: string): number {
    const position = parseInt(authorPosition || '0', 10);
    if (claimantRole === 'First Author' || claimantRole === 'Corresponding Author' || claimantRole === 'First & Corresponding Author') {
        return 0.7;
    }
    if (claimantRole === 'Co-Author') {
        if (position > 0 && position <= 5) return 0.3;
        if (position > 5) return 0.1;
    }
    return 0.3; // Default for co-authors if position is not specified
}

// Multiplier for Books, Chapters, and Conference Proceedings (Policy 5.1.2)
function getBookConfAuthorPositionMultiplier(claimantRole: Author['role'], authorPosition?: string): number {
    const position = parseInt(authorPosition || '0', 10);
     if (claimantRole === 'First Author' || claimantRole === 'Corresponding Author' || claimantRole === 'First & Corresponding Author') {
        return 0.7;
    }
    if (claimantRole === 'Co-Author') {
        // The policy states "up to 5", so we'll assume it applies to positions 1-5.
        if (position > 0 && position <= 5) return 0.3;
    }
    // If the role or position doesn't match, the multiplier is 0 for this category.
    return 0;
}


function getJournalPoints(claim: IncentiveClaim): { points: number, multiplier: number } {
    const { publicationType, journalClassification } = claim;
    let points = 0;
    let multiplier = 0;

    switch (publicationType) {
        case 'Research Articles/Short Communications':
            points = 8; 
            break;
        case 'Short Communication': 
            points = 6; 
            break;
        case 'Review Article': 
            points = (journalClassification === 'Q1' || journalClassification === 'Q2') ? 8 : 6; 
            break;
        case 'Case Report / Case Study': 
        case 'Case Reports/Short Surveys':
            points = 7; 
            break;
    }

    switch (journalClassification) {
        case 'Q1': multiplier = 1.0; break;
        case 'Q2': multiplier = 0.7; break;
        case 'Q3': multiplier = 0.4; break;
        case 'Q4': multiplier = 0.3; break;
    }
    return { points, multiplier };
}

// --- Main Calculation Functions ---

function calculatePublicationScore(claims: IncentiveClaim[], userId: string): { 
    score: number; 
    contributingClaims: { 
        claim: IncentiveClaim, 
        score: number,
        calculation: { base: number, multiplier: number, authorMultiplier: number } 
    }[] 
} {
    let score = 0;
    const contributingClaims: { claim: IncentiveClaim, score: number, calculation: { base: number, multiplier: number, authorMultiplier: number } }[] = [];

    for (const claim of claims) {
        // Find the claimant in the author list for this specific claim
        const claimantAuthorInfo = claim.authors?.find(a => a.uid === userId);
        if (!claimantAuthorInfo) continue;

        let claimScore = 0;
        let calculation = { base: 0, multiplier: 1, authorMultiplier: 0 };

        switch (claim.claimType) {
            case 'Books':
                if (claim.isScopusIndexed) {
                    const authorMultiplier = getBookConfAuthorPositionMultiplier(claimantAuthorInfo.role, claim.authorPosition);
                    const basePoints = claim.bookApplicationType === 'Book' ? 10 : 5;
                    claimScore = basePoints * authorMultiplier;
                    calculation = { base: basePoints, multiplier: 1, authorMultiplier };
                }
                break;
            case 'Conference Presentations':
                if (claim.publicationType === 'Scopus Indexed Conference Proceedings') {
                    const authorMultiplier = getBookConfAuthorPositionMultiplier(claimantAuthorInfo.role, claim.authorPosition);
                    const basePoints = 2;
                    claimScore = basePoints * authorMultiplier;
                    calculation = { base: basePoints, multiplier: 1, authorMultiplier };
                }
                break;
            case 'Research Papers':
                const authorMultiplier = getJournalAuthorPositionMultiplier(claimantAuthorInfo.role, claim.authorPosition);
                const { points, multiplier: quartileMultiplier } = getJournalPoints(claim);
                claimScore = (points * quartileMultiplier) * authorMultiplier;
                calculation = { base: points, multiplier: quartileMultiplier, authorMultiplier };
                break;
        }
        if (claimScore > 0) {
            score += claimScore;
            contributingClaims.push({ claim, score: claimScore, calculation });
        }
    }
    return { score, contributingClaims };
}

function calculatePatentScore(claims: IncentiveClaim[], userId: string): { 
    score: number; 
    contributingClaims: { 
        claim: IncentiveClaim, 
        score: number,
        calculation: { base: number, applicantMultiplier: number } 
    }[] 
} {
    let score = 0;
    const contributingClaims: { claim: IncentiveClaim, score: number, calculation: { base: number, applicantMultiplier: number } }[] = [];

    for (const claim of claims) {
        if (claim.claimType !== 'Patents') continue;
        
        // Ensure this user is actually an inventor on this patent claim
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
    return { score, contributingClaims };
}


function calculateEmrScore(projects: EmrInterest[], userId: string, startDate: Date, endDate: Date): { 
    score: number; 
    contributingProjects: { 
        project: EmrInterest, 
        score: number,
        calculation: { rolePoints: number } 
    }[] 
} {
    let score = 0;
    const contributingProjects: { project: EmrInterest, score: number, calculation: { rolePoints: number } }[] = [];
    
    for (const project of projects) {
        // Status is pre-filtered, but double-checking is safe.
        if (project.status !== 'Sanctioned' && project.status !== 'SANCTIONED') continue;

        // Date filtering now happens here
        if (!project.sanctionDate) continue;
        const sanctionDate = parseISO(project.sanctionDate);
        if (sanctionDate < startDate || sanctionDate > endDate) continue;

        const amountMatch = project.durationAmount?.match(/Amount:\s*([\d,]+)/);
        if (!amountMatch) continue;
        
        const amount = parseInt(amountMatch[1].replace(/,/g, ''), 10);
        const isPI = project.userId === userId;
        const isCoPi = project.coPiUids?.includes(userId) && !isPI;

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
    return { score, contributingProjects };
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

        const workflow = claim.approvals || [];
        if (workflow.length === 0) return false;

        const finalApprovalEntry = [...workflow]
            .filter((a): a is ApprovalStage => a !== null)
            .sort((a, b) => b.stage - a.stage)[0];
        
        if (!finalApprovalEntry) return false;
        
        const acceptanceDate = parseISO(finalApprovalEntry.timestamp);
        return acceptanceDate >= startDate && acceptanceDate <= endDate;
      });
    
    const piProjects = emrPiSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));
    const coPiProjects = emrCoPiSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));

    const allEmrProjects = new Map<string, EmrInterest>();
    piProjects.forEach(p => allEmrProjects.set(p.id, p));
    coPiProjects.forEach(p => allEmrProjects.set(p.id, p));
    const uniqueEmrProjects = Array.from(allEmrProjects.values());


    const { score: rawPubScore, contributingClaims: pubClaims } = calculatePublicationScore(claimsInPeriod, userId);
    const { score: rawPatentScore, contributingClaims: patentClaims } = calculatePatentScore(claimsInPeriod, userId);
    const { score: rawEmrScore, contributingProjects: emrProjects } = calculateEmrScore(uniqueEmrProjects, userId, startDate, endDate);

    const weightedPub = rawPubScore * 0.50;
    const weightedPatent = rawPatentScore * 0.15;
    const weightedEmr = rawEmrScore * 0.15;

    const finalPubScore = Math.min(weightedPub, 50);
    const finalPatentScore = Math.min(weightedPatent, 15);
    const finalEmrScore = Math.min(weightedEmr, 15);
    
    const totalArps = finalPubScore + finalPatentScore + finalEmrScore;

    let grade = 'DME';
    if (totalArps >= 80) grade = 'SEE';
    else if (totalArps >= 50) grade = 'EE';
    else if (totalArps >= 30) grade = 'ME';
    
    return {
        success: true,
        data: {
            publications: { raw: rawPubScore, weighted: weightedPub, final: finalPubScore, contributingClaims: pubClaims },
            patents: { raw: rawPatentScore, weighted: weightedPatent, final: finalPatentScore, contributingClaims: patentClaims },
            emr: { raw: rawEmrScore, weighted: weightedEmr, final: finalEmrScore, contributingProjects: emrProjects },
            totalArps: totalArps,
            grade: grade,
        }
    };

  } catch (error: any) {
    console.error("Error calculating ARPS:", error);
    return { success: false, error: "Failed to calculate ARPS score." };
  }
}
