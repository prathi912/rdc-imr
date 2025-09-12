
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
  }
  error?: string
}> {
  const apiKey = process.env.SCOPUS_API_KEY
  if (!apiKey) {
    console.error("Scopus API key is not configured.")
    return { success: false, error: "Scopus integration is not configured on the server." }
  }

  let doi: string | null = null;
  const doiMatch = url.match(/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
  if (doiMatch && doiMatch[1]) {
    doi = doiMatch[1];
  }

  if (!doi) {
    return { success: false, error: "Could not find a valid DOI in the provided link." }
  }

  const abstractApiUrl = `https://api.elsevier.com/content/abstract/doi/${encodeURIComponent(doi)}?view=STANDARD`

  try {
    const abstractResponse = await fetch(abstractApiUrl, {
      headers: { "X-ELS-APIKey": apiKey, Accept: "application/json" },
    });
    if (!abstractResponse.ok) {
        throw new Error(`Scopus Abstract API Error: ${abstractResponse.statusText}`);
    }
    const abstractData = await abstractResponse.json();
    const coredata = abstractData?.["abstracts-retrieval-response"]?.coredata;

    if (!coredata) {
      return { success: false, error: "Invalid response structure from Scopus Abstract API." }
    }

    const paperTitle = coredata["dc:title"] || "";
    const journalName = coredata["prism:publicationName"] || "";

    return {
      success: true,
      data: {
        paperTitle,
        journalName,
      },
    }
  } catch (error: any) {
    console.error("Error calling Scopus API:", error)
    return { success: false, error: error.message || "An unexpected error occurred while fetching Scopus data." }
  }
}
