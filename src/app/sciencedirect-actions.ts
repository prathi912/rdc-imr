
'use server';

import type { IncentiveClaim } from '@/types';

// This function is designed to fetch publication data from the ScienceDirect API.
export async function fetchScienceDirectData(
  identifier: string,
  claimantName: string
): Promise<{
  success: boolean;
  data?: {
    paperTitle: string;
    journalName: string;
    publicationMonth: string;
    publicationYear: string;
    isPuNameInPublication: boolean;
    printIssn?: string;
    electronicIssn?: string;
  };
  error?: string;
}> {
  const apiKey = process.env.SCOPUS_API_KEY;
  if (!apiKey) {
    console.error("Scopus/ScienceDirect API key is not configured.");
    return { success: false, error: "API integration is not configured on the server." };
  }

  const doiMatch = identifier.match(/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
  const doi = doiMatch ? doiMatch[1] : identifier;
  
  if (!doi) {
      return { success: false, error: 'Could not extract a valid DOI from the input.' };
  }

  const apiUrl = `https://api.elsevier.com/content/abstract/doi/${encodeURIComponent(doi)}`;
  
  try {
    const response = await fetch(apiUrl, {
      headers: { "X-ELS-APIKey": apiKey, Accept: "application/json" },
    });

    if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData?.['service-error']?.status?.statusText || "The resource specified cannot be found.";
        throw new Error(`ScienceDirect API Error: ${errorMessage}`);
    }

    const data = await response.json();
    const coredata = data?.["abstracts-retrieval-response"]?.coredata;
    if (!coredata) {
        return { success: false, error: "Invalid response from ScienceDirect API." };
    }

    const paperTitle = coredata["dc:title"] || "";
    const journalName = coredata["prism:publicationName"] || "";
    const coverDate = coredata["prism:coverDate"];
    
    let publicationMonth = '';
    let publicationYear = '';
    if (coverDate) {
        const date = new Date(coverDate);
        publicationYear = date.getFullYear().toString();
        publicationMonth = date.toLocaleString('en-US', { month: 'long' });
    }

    const affiliations = data?.["abstracts-retrieval-response"]?.affiliation || [];
    const isPuNameInPublication = Array.isArray(affiliations) 
        ? affiliations.some((affil: any) => affil['affilname']?.toLowerCase().includes('parul'))
        : (affiliations['affilname'] || '').toLowerCase().includes('parul');

    let printIssn: string | undefined;
    let electronicIssn: string | undefined;
    const issnData = coredata["prism:issn"];
    if (Array.isArray(issnData)) {
      issnData.forEach((issn: any) => {
        if (issn && typeof issn === 'object' && issn['$']) {
          if (issn['@type'] === 'electronic') {
            electronicIssn = issn['$'];
          } else {
            printIssn = issn['$'];
          }
        }
      });
    } else if (typeof issnData === 'string') {
      printIssn = issnData;
    }

    return {
      success: true,
      data: {
        paperTitle,
        journalName,
        publicationMonth,
        publicationYear,
        isPuNameInPublication,
        printIssn,
        electronicIssn,
      },
    };

  } catch (error: any) {
    console.error('Error fetching from ScienceDirect API:', error);
    return { success: false, error: error.message || "An unexpected error occurred." };
  }
}
