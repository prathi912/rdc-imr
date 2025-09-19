
'use server';

import type { IncentiveClaim } from '@/types';

export async function fetchAdvancedScopusData(
  identifier: string, // Can be a URL or just a DOI
  claimantName: string,
): Promise<{
  success: boolean
  data?: {
    paperTitle: string;
    journalName: string;
    publicationMonth: string;
    publicationYear: string;
    isPuNameInPublication?: boolean;
    printIssn?: string;
    electronicIssn?: string;
    journalWebsite?: string;
    publicationType?: string;
    journalClassification?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  }
  error?: string
  claimantIsAuthor?: boolean
}> {
  const apiKey = process.env.SCOPUS_API_KEY
  if (!apiKey) {
    console.error("Scopus API key is not configured.")
    return { success: false, error: "Scopus integration is not configured on the server." }
  }

  let apiUrl = '';
  // Check if the identifier is a DOI
  const doiMatch = identifier.match(/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
  const eidMatch = identifier.match(/eid=([^&]+)/);

  if (doiMatch && doiMatch[1]) {
    const doi = doiMatch[1];
    apiUrl = `https://api.elsevier.com/content/abstract/doi/${encodeURIComponent(doi)}`;
  } else if (eidMatch && eidMatch[1]) {
    const eid = eidMatch[1];
    apiUrl = `https://api.elsevier.com/content/abstract/eid/${encodeURIComponent(eid)}`;
  } else {
    // Assume the identifier is a DOI if no other pattern matches
    apiUrl = `https://api.elsevier.com/content/abstract/doi/${encodeURIComponent(identifier)}`;
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
    const retrievalResponse = abstractData?.["abstracts-retrieval-response"];
    const coredata = retrievalResponse?.coredata;

    if (!coredata) {
      return { success: false, error: "Invalid response structure from Scopus Abstract API." }
    }

    const paperTitle = coredata["dc:title"] || "";
    const journalName = coredata["prism:publicationName"] || "";
    const coverDate = coredata["prism:coverDate"];
    const printIssn = coredata["prism:issn"];
    const electronicIssn = coredata["prism:eIssn"];
    const subtypeDescription = coredata["subtypeDescription"] || "";
    
    // Check for PU affiliation
    const affiliations = retrievalResponse.affiliation || [];
    const isPuNameInPublication = affiliations.some((affil: any) => 
        affil['affilname'] && affil['affilname'].toLowerCase().includes('parul')
    );

    let publicationMonth = '';
    let publicationYear = '';
    let journalWebsite: string | undefined = undefined;
    let publicationType: string | undefined = undefined;
    let journalClassification: 'Q1' | 'Q2' | 'Q3' | 'Q4' | undefined = undefined;


    if (coverDate) {
        const date = new Date(coverDate);
        publicationYear = date.getFullYear().toString();
        publicationMonth = date.toLocaleString('en-US', { month: 'long' });
    }

    if (subtypeDescription) {
        const subtype = subtypeDescription.toLowerCase();
        if (subtype.includes('article')) {
            publicationType = 'Research Articles/Short Communications';
        } else if (subtype.includes('review')) {
            publicationType = 'Review Articles';
        } else if (subtype.includes('letter')) {
            publicationType = 'Letter to the Editor/Editorial';
        } else if (subtype.includes('conference paper')) {
            publicationType = 'Scopus Indexed Conference Proceedings';
        }
    }

    const issnToQuery = printIssn || electronicIssn;
    if (issnToQuery) {
        try {
            const serialApiUrl = `https://api.elsevier.com/content/serial/title/issn/${issnToQuery}?apiKey=${apiKey}&view=CITESCORE`;
            const serialResponse = await fetch(serialApiUrl, { headers: { Accept: "application/json" } });
            if (serialResponse.ok) {
                const serialData = await serialResponse.json();
                const serialTitleResponse = serialData?.['serial-title-response']?.[0];
                const sjrList = serialTitleResponse?.SJRList?.SJR;

                if (Array.isArray(sjrList) && sjrList.length > 0) {
                    // Find the most recent SJR entry with a quartile
                    const latestSjr = sjrList.sort((a, b) => parseInt(b['@year']) - parseInt(a['@year']))[0];
                    if (latestSjr && latestSjr['$']) {
                         const quartileMatch = latestSjr['$'].match(/\(Q(\d)\)/);
                         if (quartileMatch && quartileMatch[1]) {
                             journalClassification = `Q${quartileMatch[1]}` as 'Q1' | 'Q2' | 'Q3' | 'Q4';
                         }
                    }
                }
            }
        } catch (serialError) {
            console.warn("Could not fetch journal Q rating from Scopus Serial API, but proceeding without it.", serialError);
        }
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
        isPuNameInPublication,
        printIssn,
        electronicIssn,
        journalWebsite,
        publicationType,
        journalClassification,
      },
    }
  } catch (error: any) {
    console.error("Error calling Scopus API:", error)
    return { success: false, error: error.message || "An unexpected error occurred while fetching Scopus data." }
  }
}
