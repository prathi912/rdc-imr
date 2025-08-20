'use server';

import type { IncentiveClaim } from '@/types';

// Function to determine Q Ranking from percentile
function getQRanking(percentile: number | null): IncentiveClaim['journalClassification'] | null {
    if (percentile === null) return null;
    if (percentile >= 75) return 'Q1';
    if (percentile >= 50) return 'Q2';
    if (percentile >= 25) return 'Q3';
    return 'Q4';
}


export async function fetchAdvancedScopusData(
  url: string,
  claimantName: string,
): Promise<{
  success: boolean
  data?: {
    paperTitle: string;
    journalName: string;
    journalClassification: IncentiveClaim['journalClassification'] | null;
    publicationMonth: string;
    publicationYear: string;
    relevantLink: string; // DOI
    isPuNameInPublication: boolean;
    journalWebsite: string;
    printIssn?: string;
    electronicIssn?: string;
  }
  error?: string
}> {
  const apiKey = process.env.SCOPUS_API_KEY
  if (!apiKey) {
    console.error("Scopus API key is not configured.")
    return { success: false, error: "Scopus integration is not configured on the server." }
  }

  let eid: string | null = null;
  const eidMatch = url.match(/eid=([^&]+)/)
  if (eidMatch && eidMatch[1]) {
    eid = eidMatch[1]
  }

  if (!eid) {
    return { success: false, error: "Could not find a valid Scopus EID in the provided link." }
  }

  const abstractApiUrl = `https://api.elsevier.com/content/abstract/eid/${encodeURIComponent(eid)}?view=FULL`
  const serialApiUrl = `https://api.elsevier.com/content/serial/title`;

  try {
    const abstractResponse = await fetch(abstractApiUrl, {
      headers: { "X-ELS-APIKey": apiKey, Accept: "application/json" },
    });
    if (!abstractResponse.ok) {
        throw new Error(`Scopus Abstract API Error: ${abstractResponse.statusText}`);
    }
    const abstractData = await abstractResponse.json();
    const coredata = abstractData?.["abstracts-retrieval-response"]?.coredata;
    const item = abstractData?.["abstracts-retrieval-response"]?.item;

    if (!coredata) {
      return { success: false, error: "Invalid response structure from Scopus Abstract API." }
    }

    const paperTitle = coredata["dc:title"] || "";
    const journalName = coredata["prism:publicationName"] || "";
    const coverDate = new Date(coredata["prism:coverDate"]);
    const publicationMonth = coverDate.toLocaleString('default', { month: 'long' });
    const publicationYear = coverDate.getFullYear().toString();
    const relevantLink = `https://doi.org/${coredata["prism:doi"]}` || "";
    const printIssn = coredata["prism:issn"] || undefined;
    const electronicIssn = coredata["prism:eIssn"] || undefined;

    const affiliations = item?.bibrecord?.head?.author_group?.map((g: any) => g.affiliation) || [];
    const isPuNameInPublication = affiliations.some((aff: any) => 
        aff?.organization?.some((org: any) => 
            typeof org === 'string' && org.toLowerCase().includes('parul university')
        )
    );

    // Fetch Journal Details for Q-Ranking
    let journalClassification: IncentiveClaim['journalClassification'] | null = null;
    let journalWebsite = '';

    if (printIssn || electronicIssn) {
        const issn = printIssn || electronicIssn;
        const serialSearchUrl = `${serialApiUrl}?issn=${issn}&apiKey=${apiKey}&view=ENHANCED`;
        const serialResponse = await fetch(serialSearchUrl, { headers: { Accept: "application/json" } });
        
        if(serialResponse.ok) {
            const serialData = await serialResponse.json();
            const entry = serialData?.["serial-metadata-response"]?.entry?.[0];
            if (entry) {
                journalWebsite = entry["link"]?.find((l: any) => l["@rel"] === "homepage")?.["@href"] || '';
                const highestPercentile = entry.citeScoreYearInfoList?.citeScoreCurrentMetric?.percentile;
                journalClassification = getQRanking(highestPercentile ? parseFloat(highestPercentile) : null);
            }
        }
    }
    

    return {
      success: true,
      data: {
        paperTitle,
        journalName,
        journalClassification,
        publicationMonth,
        publicationYear,
        relevantLink,
        isPuNameInPublication,
        journalWebsite,
        printIssn,
        electronicIssn,
      },
    }
  } catch (error: any) {
    console.error("Error calling Scopus API:", error)
    return { success: false, error: error.message || "An unexpected error occurred while fetching Scopus data." }
  }
}
