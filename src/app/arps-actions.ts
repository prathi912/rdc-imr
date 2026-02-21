
'use server';

import { adminDb } from '@/lib/admin';
import type { IncentiveClaim, EmrInterest, User, Author } from '@/types';
import { startOfYear, endOfYear } from 'date-fns';

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

function calculatePublicationScore(claims: IncentiveClaim[], userId: string): number {
    let totalScore = 0;

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
                // Assuming "Scopus Indexed Conference Proceeding" maps to this claim type
                 if (claim.publicationType === 'Scopus Indexed Conference Proceedings') {
                    claimScore = 2 * authorPositionMultiplier;
                }
                break;
            case 'Research Papers':
                const { points, multiplier } = getJournalPoints(claim);
                claimScore = (points * multiplier) * authorPositionMultiplier;
                break;
        }
        totalScore += claimScore;
    }
    return totalScore;
}

function calculatePatentScore(claims: IncentiveClaim[]): number {
    let totalScore = 0;
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

        totalScore += basePoints * multiplier;
    }
    return totalScore;
}

function calculateEmrScore(projects: EmrInterest[], userId: string): number {
    let totalScore = 0;
    for (const project of projects) {
        if (project.status !== 'Sanctioned' && project.status !== 'SANCTIONED') continue;

        const amountMatch = project.durationAmount?.match(/Amount:\s*([\d,]+)/);
        if (!amountMatch) continue;
        
        const amount = parseInt(amountMatch[1].replace(/,/g, ''), 10);
        const isPI = project.userId === userId;

        if (amount >= 2000000 && amount <= 5000000) {
            totalScore += isPI ? 50 : 15;
        } else if (amount > 5000000 && amount <= 10000000) {
            totalScore += isPI ? 70 : 20;
        } else if (amount > 10000000) {
            totalScore += isPI ? 100 : 25;
        }
    }
    return totalScore;
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
    const emrQuery = emrRef.where('userId', '==', userId)
                             .where('sanctionDate', '>=', startDate.toISOString())
                             .where('sanctionDate', '<=', endDate.toISOString());

    const [claimsSnapshot, emrSnapshot] = await Promise.all([claimsQuery.get(), emrQuery.get()]);

    const allClaims = claimsSnapshot.docs.map(doc => doc.data() as IncentiveClaim);
    const allEmrProjects = emrSnapshot.docs.map(doc => doc.data() as EmrInterest);

    // Calculate Raw Scores
    const rawPubScore = calculatePublicationScore(allClaims, userId);
    const rawPatentScore = calculatePatentScore(allClaims);
    const rawEmrScore = calculateEmrScore(allEmrProjects, userId);

    // Apply Weighting
    const weightedPub = rawPubScore * 0.50;
    const weightedPatent = rawPatentScore * 0.15;
    const weightedEmr = rawEmrScore * 0.15;

    // Apply Capping
    const finalPubScore = Math.min(weightedPub, 50);
    const finalPatentScore = Math.min(weightedPatent, 15);
    const finalEmrScore = Math.min(weightedEmr, 15);
    
    // Total ARPS
    const totalArps = finalPubScore + finalPatentScore + finalEmrScore;

    // Determine Grade
    let grade = 'DME';
    if (totalArps >= 80) grade = 'SEE';
    else if (totalArps >= 50) grade = 'EE';
    else if (totalArps >= 30) grade = 'ME';
    
    return {
        success: true,
        data: {
            publications: { raw: rawPubScore, weighted: weightedPub, final: finalPubScore },
            patents: { raw: rawPatentScore, weighted: weightedPatent, final: finalPatentScore },
            emr: { raw: rawEmrScore, weighted: weightedEmr, final: finalEmrScore },
            totalArps: totalArps,
            grade: grade,
        }
    };

  } catch (error: any) {
    console.error("Error calculating ARPS:", error);
    return { success: false, error: "Failed to calculate ARPS score." };
  }
}
