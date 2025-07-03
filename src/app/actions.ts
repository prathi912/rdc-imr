
'use server';

import { getResearchDomainSuggestion, type ResearchDomainInput } from '@/ai/flows/research-domain-suggestion';
import { summarizeProject, type SummarizeProjectInput } from '@/ai/flows/project-summarization';
import { generateEvaluationPrompts, type EvaluationPromptsInput } from '@/ai/flows/evaluation-prompts';
import { findJournalWebsite, type JournalWebsiteInput } from '@/ai/flows/journal-website-finder';
import { db } from '@/lib/config';
import { adminDb, adminStorage } from '@/lib/admin';
import { doc, collection, writeBatch, query, where, getDocs } from 'firebase/firestore';


export async function getProjectSummary(input: SummarizeProjectInput) {
  try {
    const result = await summarizeProject(input);
    return { success: true, summary: result.summary };
  } catch (error) {
    console.error('Error summarizing project:', error);
    return { success: false, error: 'Failed to generate summary.' };
  }
}

export async function getEvaluationPrompts(input: EvaluationPromptsInput) {
  try {
    const result = await generateEvaluationPrompts(input);
    return { success: true, prompts: result };
  } catch (error) {
    console.error('Error generating evaluation prompts:', error);
    return { success: false, error: 'Failed to generate prompts.' };
  }
}

export async function getResearchDomain(input: ResearchDomainInput) {
    try {
        const result = await getResearchDomainSuggestion(input);
        return { success: true, domain: result.domain };
    } catch (error) {
        console.error('Error getting research domain:', error);
        return { success: false, error: 'Failed to get research domain.' };
    }
}

export async function getJournalWebsite(input: JournalWebsiteInput) {
  try {
    const result = await findJournalWebsite(input);
    return { success: true, url: result.websiteUrl };
  } catch (error) {
    console.error('Error finding journal website:', error);
    return { success: false, error: 'Failed to find journal website.' };
  }
}

export async function scheduleMeeting(
  projectsToSchedule: { id: string; pi_uid: string; title: string; }[],
  meetingDetails: { date: string; time: string; venue: string; }
) {
  try {
    const batch = writeBatch(db);

    projectsToSchedule.forEach((project) => {
      const projectRef = doc(db, 'projects', project.id);
      batch.update(projectRef, { 
        meetingDetails: meetingDetails,
        status: 'Under Review'
      });

      const notificationRef = doc(collection(db, 'notifications'));
      batch.set(notificationRef, {
         uid: project.pi_uid,
         projectId: project.id,
         title: `IMR meeting scheduled for your project: "${project.title}"`,
         createdAt: new Date().toISOString(),
         isRead: false,
      });
    });

    await batch.commit();
    return { success: true };
  } catch (error: any) {
    console.error('Error scheduling meeting:', error);
    return { success: false, error: error.message || 'Failed to schedule meeting.' };
  }
}

export async function uploadFileToServer(fileDataUrl: string, path: string): Promise<{success: boolean; url?: string; error?: string}> {
  try {
    if (!fileDataUrl) {
      throw new Error('Empty file data URL.');
    }
    const bucket = adminStorage.bucket();
    const file = bucket.file(path);

    // Extract mime type and base64 data from data URL
    const match = fileDataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) {
        throw new Error('Invalid data URL.');
    }
    const mimeType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Upload the file buffer
    await file.save(buffer, {
      metadata: {
        contentType: mimeType,
      },
      public: true, // Make the file public
    });

    // Get the public URL
    const downloadUrl = file.publicUrl();

    console.log(`File uploaded successfully to ${path}, URL: ${downloadUrl}`);

    return { success: true, url: downloadUrl };
  } catch (error: any) {
    console.error('Error uploading file via admin:', error);
    return { success: false, error: error.message || 'Failed to upload file.' };
  }
}

export async function notifyAdminsOnProjectSubmission(projectId: string, projectTitle: string, piName: string) {
  try {
    const adminRoles = ['admin', 'Super-admin', 'CRO'];
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('role', 'in', adminRoles));

    const adminUsersSnapshot = await getDocs(q);
    if (adminUsersSnapshot.empty) {
      console.log('No admin users found to notify.');
      return { success: true, message: 'No admins to notify.' };
    }

    const batch = writeBatch(db);
    const notificationTitle = `New Project Submitted: "${projectTitle}" by ${piName}`;

    adminUsersSnapshot.forEach(userDoc => {
      // userDoc.id is the UID of the admin user
      const notificationRef = doc(collection(db, 'notifications'));
      batch.set(notificationRef, {
        uid: userDoc.id,
        projectId: projectId,
        title: notificationTitle,
        createdAt: new Date().toISOString(),
        isRead: false,
      });
    });

    await batch.commit();
    return { success: true };

  } catch (error: any) {
    console.error('Error notifying admins:', error);
    return { success: false, error: error.message || 'Failed to notify admins.' };
  }
}

export async function checkMisIdExists(misId: string, currentUid: string): Promise<{exists: boolean}> {
  try {
    const usersRef = adminDb.collection('users');
    const q = usersRef.where('misId', '==', misId).limit(1);
    const querySnapshot = await q.get();

    if (querySnapshot.empty) {
      return { exists: false };
    }

    const foundUserDoc = querySnapshot.docs[0];
    if (foundUserDoc.id === currentUid) {
      // The only user with this MIS ID is the current user. This can happen if they are re-saving their profile.
      return { exists: false };
    }

    // A different user has this MIS ID.
    return { exists: true };

  } catch (error: any) {
    console.error('Error checking MIS ID uniqueness:', error);
    // Rethrow to let the client know something went wrong with the check.
    throw new Error('Failed to verify MIS ID due to a server error. Please try again.');
  }
}

export async function fetchScopusDataByUrl(url: string, claimantName: string): Promise<{ success: boolean; data?: { title: string; journalName: string; totalAuthors: number; totalInternalAuthors: number; totalInternalCoAuthors: number; }; error?: string; claimantIsAuthor?: boolean; }> {
  const apiKey = process.env.SCOPUS_API_KEY;
  if (!apiKey) {
    console.error('Scopus API key is not configured.');
    return { success: false, error: 'Scopus integration is not configured on the server.' };
  }

  let identifier: string | null = null;
  let type: 'doi' | 'eid' | null = null;

  // Prioritize EID extraction from Scopus URLs as it's more specific
  const eidMatch = url.match(/eid=([^&]+)/);
  if (eidMatch && eidMatch[1]) {
    identifier = eidMatch[1];
    type = 'eid';
  } else {
    // If no EID is found, fall back to looking for a DOI anywhere in the string
    const doiMatch = url.match(/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
    if (doiMatch && doiMatch[1]) {
      identifier = doiMatch[1];
      type = 'doi';
    }
  }

  if (!identifier || !type) {
    return { success: false, error: 'Could not find a valid Scopus EID or DOI in the provided link.' };
  }

  const scopusApiUrl = `https://api.elsevier.com/content/abstract/${type}/${encodeURIComponent(identifier)}`;

  try {
    const response = await fetch(scopusApiUrl, {
      headers: {
        'X-ELS-APIKey': apiKey,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData?.['service-error']?.status?.statusText || 'Failed to fetch data from Scopus.';
      return { success: false, error: `Scopus API Error: ${errorMessage}` };
    }

    const data = await response.json();
    const coredata = data?.['abstracts-retrieval-response']?.coredata;
    const authors = data?.['abstracts-retrieval-response']?.authors?.author;

    if (!coredata) {
      return { success: false, error: 'Invalid response structure from Scopus API.' };
    }

    const title = coredata['dc:title'] || '';
    const journalName = coredata['prism:publicationName'] || '';
    const totalAuthors = Array.isArray(authors) ? authors.length : 0;
    
    let totalInternalAuthors = 0;
    if (Array.isArray(authors)) {
        authors.forEach(author => {
            const affiliations = Array.isArray(author.affiliation) ? author.affiliation : [author.affiliation];
            const isInternal = affiliations.some(affil => 
                affil && affil.affilname && affil.affilname.toLowerCase().includes('parul')
            );
            if (isInternal) {
                totalInternalAuthors++;
            }
        });
    }
    const totalInternalCoAuthors = Math.max(0, totalInternalAuthors - 1);

    const nameParts = claimantName.trim().toLowerCase().split(/\s+/);
    const claimantLastName = nameParts.pop() || '---';
    const claimantFirstName = nameParts[0] || '---';
    
    const isClaimantAnAuthor = Array.isArray(authors) && authors.some(author => {
        const indexedName = (author['ce:indexed-name'] || '').toLowerCase(); // "joshi, r." or "joshi, rajesh"
        
        // Strategy 1: Use the indexed name which is usually reliable.
        if (indexedName.includes(',')) {
            const [scopusLastName, scopusFirstNamePart] = indexedName.split(',').map(p => p.trim());
            if (scopusLastName === claimantLastName) {
                // Last names match. Now check first name/initial.
                if (scopusFirstNamePart.startsWith(claimantFirstName.charAt(0))) {
                    return true; // Match found (e.g., "joshi" and "a" from "anand")
                }
            }
        }
        
        // Strategy 2: Fallback to structured name fields if they exist.
        const surname = (author['ce:surname'] || '').toLowerCase();
        if (surname && surname === claimantLastName) {
           return true; // Match on surname as a fallback
        }

        return false;
    });

    return {
      success: true,
      data: {
        title,
        journalName,
        totalAuthors,
        totalInternalAuthors,
        totalInternalCoAuthors,
      },
      claimantIsAuthor: isClaimantAnAuthor,
    };
  } catch (error: any) {
    console.error('Error calling Scopus API:', error);
    return { success: false, error: error.message || 'An unexpected error occurred while fetching Scopus data.' };
  }
}

export async function fetchWosDataByUrl(url: string, claimantName: string): Promise<{ success: boolean; data?: { title: string; journalName: string; totalAuthors: number; }; error?: string; claimantIsAuthor?: boolean; }> {
  const apiKey = process.env.WOS_API_KEY;
  if (!apiKey) {
    console.error('Web of Science API key is not configured.');
    return { success: false, error: 'Web of Science integration is not configured on the server.' };
  }

  const doiMatch = url.match(/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
  if (!doiMatch || !doiMatch[1]) {
    return { success: false, error: 'Could not find a valid DOI in the provided link.' };
  }
  const doi = doiMatch[1];

  const wosApiUrl = `https://api.clarivate.com/apis/wos-starter/v1/documents?q=DO=${encodeURIComponent(doi)}`;

  try {
    const response = await fetch(wosApiUrl, {
      headers: {
        'X-ApiKey': apiKey,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData?.message || 'Failed to fetch data from Web of Science.';
      return { success: false, error: `WoS API Error: ${errorMessage}` };
    }

    const data = await response.json();
    const record = data?.data?.[0];

    if (!record) {
      return { success: false, error: 'No matching record found in Web of Science for the provided DOI.' };
    }

    const title = record.title || '';
    const journalName = record.source?.title || '';
    
    const authors = record.authors;
    const authorList = Array.isArray(authors) ? authors : (authors ? [authors] : []);
    const totalAuthors = authorList.length;

    const nameParts = claimantName.trim().toLowerCase().split(/\s+/);
    const claimantLastName = nameParts.pop() || '---';

    const isClaimantAnAuthor = authorList.some((author: any) => {
        const wosFullName = (author.name || '').toLowerCase();
        // WoS format is "Lastname, F." or "Lastname, Firstname"
        if (wosFullName.includes(',')) {
            const [wosLastName] = wosFullName.split(',').map((p:string) => p.trim());
            return wosLastName === claimantLastName;
        }
        // Fallback for "Firstname Lastname" format
        return wosFullName.includes(claimantLastName);
    });

    return {
      success: true,
      data: {
        title,
        journalName,
        totalAuthors
      },
      claimantIsAuthor: isClaimantAnAuthor,
    };
  } catch (error: any) {
    console.error('Error calling Web of Science API:', error);
    return { success: false, error: error.message || 'An unexpected error occurred while fetching WoS data.' };
  }
}

export async function bulkUploadProjects(projectsData: any[]): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const batch = writeBatch(db);
    const usersRef = adminDb.collection('users');
    let projectCount = 0;

    for (const project of projectsData) {
      // Basic validation
      if (!project.pi_email || !project.project_title || !project.status) {
        console.warn('Skipping incomplete project record:', project);
        continue;
      }

      let pi_uid = '';
      let pi_name = project.pi_email.split('@')[0]; // Default name

      // Find user by email to get UID
      const userQuery = await usersRef.where('email', '==', project.pi_email).limit(1).get();
      if (!userQuery.empty) {
        const userDoc = userQuery.docs[0];
        pi_uid = userDoc.id;
        pi_name = userDoc.data().name || pi_name;
      }

      const projectRef = doc(collection(db, 'projects'));
      
      const newProjectData = {
        title: project.project_title,
        pi_email: project.pi_email,
        status: project.status,
        pi_uid: pi_uid, // Will be empty if user not found yet
        pi: pi_name,
        // Add default values for other required fields
        abstract: "Historical data migrated from bulk upload.",
        type: "Research", // Default type
        faculty: "Unknown", // Default
        institute: "Unknown",
        departmentName: "Unknown",
        teamInfo: "Historical data, team info not available.",
        timelineAndOutcomes: "Historical data, outcomes not available.",
        submissionDate: project.sanction_date || new Date().toISOString(),
        grant: {
            amount: project.grant_amount || 0,
            status: 'Completed', // Assume old grants are completed
            disbursementDate: project.sanction_date || new Date().toISOString(),
        }
      };

      batch.set(projectRef, newProjectData);
      projectCount++;
    }

    await batch.commit();
    return { success: true, count: projectCount };

  } catch (error: any) {
    console.error('Error during bulk upload:', error);
    return { success: false, count: 0, error: error.message || 'Failed to upload projects.' };
  }
}

export async function fetchOrcidData(orcidId: string): Promise<{ success: boolean; data?: { name: string; }; error?: string; }> {
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcidId)) {
    return { success: false, error: 'Invalid ORCID iD format.' };
  }

  const orcidApiUrl = `https://pub.orcid.org/v3.0/${orcidId}`;

  try {
    const response = await fetch(orcidApiUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
        if (response.status === 404) {
            return { success: false, error: 'ORCID iD not found.' };
        }
      const errorText = await response.text();
      return { success: false, error: `ORCID API Error: ${response.statusText} - ${errorText}` };
    }

    const data = await response.json();
    
    const givenName = data.person.name['given-names']?.value || '';
    const familyName = data.person.name['family-name']?.value || '';
    const fullName = `${givenName} ${familyName}`.trim();

    if (!fullName) {
      return { success: false, error: 'Could not extract name from ORCID profile.' };
    }
    
    return {
      success: true,
      data: {
        name: fullName,
      }
    };
  } catch (error: any) {
    console.error('Error calling ORCID API:', error);
    return { success: false, error: error.message || 'An unexpected error occurred while fetching ORCID data.' };
  }
}
