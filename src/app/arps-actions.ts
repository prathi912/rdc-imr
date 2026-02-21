

'use server';

import { adminDb } from '@/lib/admin';
import type { IncentiveClaim, EmrInterest, User, Author } from '@/types';
import { startOfYear, endOfYear, parseISO } from 'date-fns';

// --- Helper Functions ---

function getAuthorPositionMultiplier(claimantRole: Author['role'], authorPosition?: string): number {
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

function getJournalPoints(claim: IncentiveClaim): { points: number, multiplier: number } {
    const { publicationType, journalClassification } = claim;
    let points = 0;
    let multiplier = 0;

    switch (publicationType) {
        case 'Original Research Article': points = 8; break;
        case 'Short Communication': points = 6; break;
        case 'Review Article': points = (journalClassification === 'Q1' || journalClassification === 'Q2') ? 8 : 6; break;
        case 'Case Report / Case Study': points = 7; break;
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

function calculatePublicationScore(claims: IncentiveClaim[], userId: string): { score: number; contributingClaims: { claim: IncentiveClaim, score: number }[] } {
    let score = 0;
    const contributingClaims: { claim: IncentiveClaim, score: number }[] = [];

    for (const claim of claims) {
        if (claim.status !== 'Payment Completed') continue;

        const claimantAuthorInfo = claim.authors?.find(a => a.uid === userId);
        if (!claimantAuthorInfo) continue;

        let claimScore = 0;
        const authorPositionMultiplier = getAuthorPositionMultiplier(claimantAuthorInfo.role, claim.authorPosition);

        switch (claim.claimType) {
            case 'Books':
                if (claim.isScopusIndexed) {
                    claimScore = claim.bookApplicationType === 'Book' ? 10 : 5;
                    claimScore *= authorPositionMultiplier;
                }
                break;
            case 'Conference Presentations':
                if (claim.publicationType === 'Scopus Indexed Conference Proceedings') {
                    claimScore = 2 * authorPositionMultiplier;
                }
                break;
            case 'Research Papers':
                const { points, multiplier } = getJournalPoints(claim);
                claimScore = (points * multiplier) * authorPositionMultiplier;
                break;
        }
        if (claimScore > 0) {
            score += claimScore;
            contributingClaims.push({ claim, score: claimScore });
        }
    }
    return { score, contributingClaims };
}

function calculatePatentScore(claims: IncentiveClaim[]): { score: number; contributingClaims: { claim: IncentiveClaim, score: number }[] } {
    let score = 0;
    const contributingClaims: { claim: IncentiveClaim, score: number }[] = [];

    for (const claim of claims) {
        if (claim.status !== 'Payment Completed' || claim.claimType !== 'Patents') continue;

        let basePoints = 0;
        if (claim.currentStatus === 'Published') basePoints = 10;
        else if (claim.currentStatus === 'Granted') {
            basePoints = claim.patentLocale === 'International' ? 75 : 50;
        }

        let multiplier = 0;
        if (claim.patentFiledInPuName) {
            multiplier = claim.isPuSoleApplicant ? 1.0 : 0.8;
        }

        const claimScore = basePoints * multiplier;
        if (claimScore > 0) {
            score += claimScore;
            contributingClaims.push({ claim, score: claimScore });
        }
    }
    return { score, contributingClaims };
}

function calculateEmrScore(projects: EmrInterest[], userId: string, year: number): { score: number; contributingProjects: { project: EmrInterest, score: number }[] } {
    let score = 0;
    const contributingProjects: { project: EmrInterest, score: number }[] = [];
    const startDate = startOfYear(new Date(year, 0, 1));
    const endDate = endOfYear(new Date(year, 11, 31));
    
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

        let projectScore = 0;
        if (amount >= 2000000 && amount <= 5000000) {
            projectScore = isPI ? 50 : 15;
        } else if (amount > 5000000 && amount <= 10000000) {
            projectScore = isPI ? 70 : 20;
        } else if (amount > 10000000) {
            projectScore = isPI ? 100 : 25;
        }

        if (projectScore > 0) {
            score += projectScore;
            contributingProjects.push({ project, score: projectScore });
        }
    }
    return { score, contributingProjects };
}


// --- Main Exported Function ---

export async function calculateArpsForUser(userId: string, year: number) {
  try {
    const startDate = startOfYear(new Date(year, 0, 1));
    const endDate = endOfYear(new Date(year, 11, 31));

    // Fetch all necessary data
    const claimsRef = adminDb.collection('incentiveClaims');
    const claimsQuery = claimsRef.where('uid', '==', userId)
                                 .where('submissionDate', '>=', startDate.toISOString())
                                 .where('submissionDate', '<=', endDate.toISOString());
    
    const emrRef = adminDb.collection('emrInterests');
    const sanctionedStatuses = ['Sanctioned', 'SANCTIONED'];

    // Query for projects where the user is the PI
    const emrPiQuery = emrRef.where('userId', '==', userId).where('status', 'in', sanctionedStatuses);

    // Query for projects where the user is a Co-PI
    const emrCoPiQuery = emrRef.where('coPiUids', 'array-contains', userId).where('status', 'in', sanctionedStatuses);

    const [claimsSnapshot, emrPiSnapshot, emrCoPiSnapshot] = await Promise.all([
      claimsQuery.get(),
      emrPiQuery.get(),
      emrCoPiQuery.get(),
    ]);

    const allClaims = claimsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IncentiveClaim));
    
    const piProjects = emrPiSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));
    const coPiProjects = emrCoPiSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));

    // Combine and deduplicate EMR projects
    const allEmrProjects = new Map<string, EmrInterest>();
    piProjects.forEach(p => allEmrProjects.set(p.id, p));
    coPiProjects.forEach(p => allEmrProjects.set(p.id, p));
    const uniqueEmrProjects = Array.from(allEmrProjects.values());


    // Calculate Raw Scores
    const { score: rawPubScore, contributingClaims: pubClaims } = calculatePublicationScore(allClaims, userId);
    const { score: rawPatentScore, contributingClaims: patentClaims } = calculatePatentScore(allClaims);
    const { score: rawEmrScore, contributingProjects: emrProjects } = calculateEmrScore(uniqueEmrProjects, userId, year);

    // Apply Weighting
    const weightedPub = rawPubScore * 0.50;
    const weightedPatent = rawPatentScore * 0.15;
    const weightedEmr = rawEmrScore * 0.15;

    // Apply Capping
    const finalPubScore = Math.min(weightedPub, 50);
    const finalPatentScore = Math.min(weightedPatent, 15);
    const finalEmrScore = Math.min(weightedEmr, 15);
    
    // Total ARPS (out of 80 since consultancy and research activities are not included)
    const totalArps = finalPubScore + finalPatentScore + finalEmrScore;

    // Determine Grade
    let grade = 'DME';
    if (totalArps >= 80) grade = 'SEE'; // This grade is unreachable with the current criteria (max 80)
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
