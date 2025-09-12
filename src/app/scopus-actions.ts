
'use server';

import type { IncentiveClaim } from '@/types';

export async function fetchAdvancedScopusData(
  url: string,
  claimantName: string,
): Promise<{
  success: boolean
  data?: {
    paperTitle: string;
    journalName: string;
    publicationMonth: string;
    publicationYear: string;
    printIssn?: string;
    electronicIssn?: string;
    journalWebsite?: string;
  }
  error?: string
}> {
  const apiKey = process.env.SCOPUS_API_KEY
  if (!apiKey) {
    console.error("Scopus API key is not configured.")
    return { success: false, error: "Scopus integration is not configured on the server." }
  }

  let apiUrl = '';
  const doiMatch = url.match(/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
  const eidMatch = url.match(/eid=([^&]+)/);

  if (doiMatch && doiMatch[1]) {
    const doi = doiMatch[1];
    apiUrl = `https://api.elsevier.com/content/abstract/doi/${encodeURIComponent(doi)}`;
  } else if (eidMatch && eidMatch[1]) {
    const eid = eidMatch[1];
    apiUrl = `https://api.elsevier.com/content/abstract/eid/${encodeURIComponent(eid)}`;
  } else {
    return { success: false, error: "Could not find a valid DOI or Scopus EID in the provided link." }
  }

  try {
    const response = await fetch(apiUrl, {
      headers: { "X-ELS-APIKey": apiKey, Accept: "application/json" },
    });
    if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData?.['service-error']?.status?.statusText || response.statusText;
        throw new Error(`Scopus Abstract API Error: ${errorMessage}`);
    }
    const abstractData = await response.json();
    const coredata = abstractData?.["abstracts-retrieval-response"]?.coredata;

    if (!coredata) {
      return { success: false, error: "Invalid response structure from Scopus Abstract API." }
    }

    const paperTitle = coredata["dc:title"] || "";
    const journalName = coredata["prism:publicationName"] || "";
    const coverDate = coredata["prism:coverDate"];
    const printIssn = coredata["prism:issn"];
    const electronicIssn = coredata["prism:eIssn"];

    let publicationMonth = '';
    let publicationYear = '';
    let journalWebsite: string | undefined = undefined;

    if (coverDate) {
        const date = new Date(coverDate);
        publicationYear = date.getFullYear().toString();
        publicationMonth = date.toLocaleString('en-US', { month: 'long' });
    }

    // After getting journalName, try to find its website via Springer Nature API
    if (journalName) {
      const springerApiKey = process.env.SPRINGER_API_KEY;
      if (springerApiKey) {
        try {
          const springerUrl = `https://api.springernature.com/meta/v2/json?q=journal:"${encodeURIComponent(journalName)}"&p=1&api_key=${springerApiKey}`;
          const springerResponse = await fetch(springerUrl);
          if (springerResponse.ok) {
            const springerData = await springerResponse.json();
            if (springerData.records && springerData.records.length > 0 && springerData.records[0].url && springerData.records[0].url.length > 0) {
              const springerLink = springerData.records[0].url.find((u: { platform: string; value: string; }) => u.platform === 'springerlink');
              if (springerLink && springerLink.value) {
                journalWebsite = springerLink.value;
              }
            }
          }
        } catch (e) {
          console.warn("Springer Nature API call failed, proceeding without website.", e);
          // Do not throw an error, just proceed without the website.
        }
      }
    }


    return {
      success: true,
      data: {
        paperTitle,
        journalName,
        publicationMonth,
        publicationYear,
        printIssn,
        electronicIssn,
        journalWebsite,
      },
    }
  } catch (error: any) {
    console.error("Error calling Scopus API:", error)
    return { success: false, error: error.message || "An unexpected error occurred while fetching Scopus data." }
  }
}
