
'use server';

import { adminDb } from '@/lib/admin';
import type { IncentiveClaim, EmrInterest, User, Author, ApprovalStage } from '@/types';
import { parseISO, getYear } from 'date-fns';

// --- Policy Constants ---
const POLICY = {
    WEIGHTAGE: {
        PUBLICATION: 0.70,
        PATENT: 0.05,
        // EMR projects are scored directly without applying the usual ARPS weightage.
        // We set this to 1 so that the raw score is used as the final EMR component.
        EMR: 1,
    },
    CAPS: {
        PUBLICATION: 70,
        PATENT: 5,
        // cap for EMR raw points (same as before, can be adjusted later if policy changes)
        EMR: 20,
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


function getJournalPoints(claim: IncentiveClaim): { quartileBase: number, articleTypeMultiplier: number } {
    const { publicationType, journalClassification } = claim;
    let quartileBase = 0;
    let articleTypeMultiplier = 1.0;

    // Step 1: Get base points from quartile
    switch (journalClassification) {
        case 'Q1': quartileBase = 15; break;
        case 'Q2': quartileBase = 10; break;
        case 'Q3': quartileBase = 6; break;
        case 'Q4': quartileBase = 4; break;
        default: quartileBase = 0; break;
    }

    // Step 2: Get article type multiplier
    switch (publicationType) {
        case 'Original Research Article':
        case 'Research Articles/Short Communications':
            articleTypeMultiplier = 1.0; 
            break;
        case 'Short Communication': 
            articleTypeMultiplier = 1.0;
            break;
        case 'Review Article':
        case 'Review Articles':
            articleTypeMultiplier = (journalClassification === 'Q1' || journalClassification === 'Q2') ? 1.0 : 0.8;
            break;
        case 'Case Report / Case Study': 
        case 'Case Reports/Short Surveys':
            articleTypeMultiplier = 0.9;
            break;
        default:
            articleTypeMultiplier = 1.0;
            break;
    }

    return { quartileBase, articleTypeMultiplier };
}

function getClaimDate(claim: IncentiveClaim): Date | null {
    const finalApproval = (claim.approvals || [])
        .filter((a): a is ApprovalStage => a !== null && a.status === 'Approved')
        .sort((a, b) => b.stage - a.stage)[0];
        
    if (finalApproval && finalApproval.timestamp) {
        try {
            return parseISO(finalApproval.timestamp);
        } catch (e) {
            // Fallback if timestamp is invalid for some reason
        }
    }
    
    // Fallback to submission date if no valid approval timestamp is found
    try {
        return parseISO(claim.submissionDate);
    } catch(e) {
        return null;
    }
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

        const claimantAuthorInfo = claim.authors?.find(a => a.uid === userId);
        if (!claimantAuthorInfo) continue;
        
        if (!claim.journalClassification) continue; // Quartile undefined guard

        let claimScore = 0;
        
        const authorMultiplier = getJournalAuthorPositionMultiplier(claimantAuthorInfo.role, claim.authorPosition);
        const { quartileBase, articleTypeMultiplier } = getJournalPoints(claim);
        claimScore = (quartileBase * articleTypeMultiplier) * authorMultiplier;
        
        const calculation = { base: quartileBase, multiplier: articleTypeMultiplier, authorMultiplier };
        
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
        if (claim.patentStatus === 'Published') basePoints = 10;
        else if (claim.patentStatus === 'Granted') {
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

        // new EMR scoring tiers (direct points, PI and half for Co‑PI)
        // amount is in rupees; 1 Lakh = 100000
        let projectScore = 0;
        if (amount >= 2000000 && amount < 6000000) {
            // 20–60 L
            if (isPI) projectScore = 10;
            else if (isCoPi) projectScore = 5; // half of 10
        } else if (amount >= 6000000 && amount < 10000000) {
            // 60–100 L
            if (isPI) projectScore = 15;
            else if (isCoPi) projectScore = 7.5; // half of 15
        } else if (amount >= 10000000) {
            // >100 L
            if (isPI) projectScore = 20;
            else if (isCoPi) projectScore = 10; // half of 20
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
    
    // Count papers where user served as First/Corresponding Author vs Co-Author
    let firstCorrespondingAuthorCount = 0;
    let coAuthorCount = 0;
    
    claimsInPeriod.forEach(claim => {
        if (claim.claimType !== 'Research Papers') return;
        
        const claimantAuthorInfo = claim.authors?.find(a => a.uid === userId);
        if (!claimantAuthorInfo) return;
        
        if (claimantAuthorInfo.role === 'First Author' || claimantAuthorInfo.role === 'Corresponding Author' || claimantAuthorInfo.role === 'First & Corresponding Author') {
            firstCorrespondingAuthorCount++;
        } else if (claimantAuthorInfo.role === 'Co-Author') {
            coAuthorCount++;
        }
    });
    
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
    
    // Force Rule: If 6 or more papers published, minimum grade is ME
    if (pubCount >= 6) {
        if (grade === 'DME') {
            grade = 'ME';
        }
    }
    
    if (pubCount < POLICY.MIN_PUBLICATIONS_REQUIRED) {
        grade += ' (Minimum 6 publications required)';
    }

    return {
        success: true,
        data: {
            publications: { raw: round(rawPubScore), weighted: round(weightedPub), final: round(finalPubScore), contributingClaims: pubClaims },
            patents: { raw: round(rawPatentScore), weighted: round(weightedPatent), final: round(finalPatentScore), contributingClaims: patentClaims },
            emr: { raw: round(rawEmrScore), weighted: round(weightedEmr), final: round(finalEmrScore), contributingProjects: emrProjects },
            totalArps: totalArps,
            grade: grade,
            authorCounts: {
                firstCorrespondingAuthor: firstCorrespondingAuthorCount,
                coAuthor: coAuthorCount
            }
        }
    };

  } catch (error: any) {
    console.error("Error calculating ARPS:", error);
    return { success: false, error: "Failed to calculate ARPS score." };
  }
}

export async function generateArpsStatisticsReport(year: number) {
  try {
    const startDate = new Date(year - 1, 5, 1); // June 1st of previous year
    const endDate = new Date(year, 4, 31); // May 31st of current year

    // Get all users with incentive-claim module access
    const usersSnapshot = await adminDb.collection('users').get();
    const users = usersSnapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data() as any,
    }));

    // Filter eligible users (faculty, CRO, Super-admin with incentive-claim module)
    const eligibleUsers = users.filter(u => {
      const userModules = u.allowedModules || [];
      const hasClaimModule = userModules.includes('incentive-claim');
      const isEligibleRole = (u.role === 'faculty' || u.role === 'CRO' || u.role === 'Super-admin');
      return isEligibleRole && hasClaimModule;
    });

    // Aggregate statistics for each user
    const statistics = await Promise.all(
      eligibleUsers.map(async (user) => {
        try {
          // Get all incentive claims for this user
          const claimsSnapshot = await adminDb
            .collection('incentive-claims')
            .where('uid', '==', user.uid)
            .where('status', 'in', [
              'Accepted',
              'Payment Completed',
              'Submitted to Accounts',
            ])
            .get();

          const claims = claimsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data() as any,
          }));

          // Get all EMR projects for this user
          const emrSnapshot = await adminDb
            .collection('emr-interest')
            .where('userId', '==', user.uid)
            .where('status', 'in', ['Sanctioned', 'Process Complete'])
            .get();

          const emrProjects = emrSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data() as any,
          }));

          // Count papers by author role
          let papersFirstCorresponding = 0;
          let papersCoAuthor = 0;

          claims.forEach(claim => {
            if (claim.claimType === 'research-paper') {
              const authorPosition = claim.authorPosition || '';
              const authorType = claim.authorType || '';
              
              // Check if this is first/corresponding author
              if (
                authorPosition === '1st' ||
                authorType === 'First Author' ||
                authorType === 'Corresponding Author' ||
                authorType === 'First & Corresponding Author'
              ) {
                papersFirstCorresponding++;
              } else if (
                authorType === 'Co-Author' ||
                authorPosition !== '1st'
              ) {
                papersCoAuthor++;
              }
            }
          });

          // Count EMR projects and calculate total amount
          let emrCount = 0;
          let emrTotalAmount = 0;

          emrProjects.forEach(project => {
            emrCount++;
            // Parse the durationAmount field to extract the amount
            const durationAmount = project.durationAmount || '';
            const amountMatch = durationAmount.match(/Amount\s*:\s*[^\d]*([\d,]+(?:\.\d+)?)/i);
            if (amountMatch) {
              const amountStr = amountMatch[1].replace(/,/g, '');
              const amount = parseFloat(amountStr);
              if (!isNaN(amount)) {
                emrTotalAmount += amount;
              }
            }
          });

          // Count patents by status
          let patentsPublished = 0;
          let patentsGranted = 0;

          claims.forEach(claim => {
            if (claim.claimType === 'patent') {
              const status = claim.patentStatus || '';
              if (status === 'Published') {
                patentsPublished++;
              } else if (status === 'Granted') {
                patentsGranted++;
              }
            }
          });

          // Consultancy amount (support for future use)
          // Currently set to 0 as it's not yet tracked in the system
          let consultancyAmount = 0;

          return {
            name: user.name || 'N/A',
            misId: user.misId || 'N/A',
            department: user.department || 'N/A',
            papersFirstCorresponding,
            papersCoAuthor,
            emrCount,
            emrTotalAmount,
            consultancyAmount,
            patentsPublished,
            patentsGranted,
          };
        } catch (userError) {
          console.error(`Error aggregating stats for user ${user.uid}:`, userError);
          return {
            name: user.name || 'N/A',
            misId: user.misId || 'N/A',
            department: user.department || 'N/A',
            papersFirstCorresponding: 0,
            papersCoAuthor: 0,
            emrCount: 0,
            emrTotalAmount: 0,
            consultancyAmount: 0,
            patentsPublished: 0,
            patentsGranted: 0,
          };
        }
      })
    );

    // Sort by name
    statistics.sort((a, b) => a.name.localeCompare(b.name));

    return {
      success: true,
      data: statistics,
      yearRange: {
        startDate: startDate.toLocaleDateString('en-IN'),
        endDate: endDate.toLocaleDateString('en-IN'),
      },
    };
  } catch (error: any) {
    console.error('Error generating ARPS statistics report:', error);
    return { success: false, error: 'Failed to generate ARPS statistics report.' };
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
