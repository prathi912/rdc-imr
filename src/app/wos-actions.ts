
'use server';

import type { IncentiveClaim } from '@/types';

export async function fetchWosDataByUrl(
  identifier: string, // Can be a URL or just a DOI
  claimantName: string,
): Promise<{
  success: boolean
  data?: { 
    paperTitle: string; 
    journalName: string; 
    totalAuthors: number;
    publicationYear: string;
    relevantLink: string;
   }
  error?: string
  claimantIsAuthor?: boolean
}> {
  const apiKey = process.env.WOS_API_KEY
  if (!apiKey) {
    console.error("Web of Science API key is not configured.")
    return { success: false, error: "Web of Science integration is not configured on the server." }
  }

  // Extract DOI from URL or use the identifier directly if it's a DOI
  const doiMatch = identifier.match(/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i)
  const doi = doiMatch ? doiMatch[1] : identifier;

  if (!doi) {
    return { success: false, error: "Could not find a valid DOI in the provided link or input." }
  }
  
  const wosApiUrl = `https://api.clarivate.com/apis/wos-starter/v1/documents?q=DO=${encodeURIComponent(doi)}`

  try {
    const response = await fetch(wosApiUrl, {
      headers: {
        "X-ApiKey": apiKey,
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      const errorMessage = errorData?.message || "Failed to fetch data from Web of Science."
      return { success: false, error: `WoS API Error: ${errorMessage}` }
    }

    const data = await response.json()
    const record = data?.data?.[0]

    if (!record) {
      return { success: false, error: "No matching record found in Web of Science for the provided DOI." }
    }

    const paperTitle = record.title || ""
    const journalName = record.source?.title || ""
    const publicationYear = record.publication_year ? String(record.publication_year) : new Date().getFullYear().toString();
    const relevantLink = `https://doi.org/${doi}`;

    const authors = record.authors
    const authorList = Array.isArray(authors) ? authors : authors ? [authors] : []
    const totalAuthors = authorList.length

    const nameParts = claimantName.trim().toLowerCase().split(/\s+/)
    const claimantLastName = nameParts.pop() || "---"

    const isClaimantAnAuthor = authorList.some((author: any) => {
      const wosFullName = (author.name || "").toLowerCase()
      // WoS format is "Lastname, F." or "Lastname, Firstname"
      if (wosFullName.includes(",")) {
        const [wosLastName] = wosFullName.split(",").map((p: string) => p.trim())
        return wosLastName === claimantLastName
      }
      // Fallback for "Firstname Lastname" format
      return wosFullName.includes(claimantLastName)
    })

    return {
      success: true,
      data: {
        paperTitle,
        journalName,
        totalAuthors,
        publicationYear,
        relevantLink
      },
      claimantIsAuthor: isClaimantAnAuthor,
    }
  } catch (error: any) {
    console.error("Error calling Web of Science API:", error)
    return { success: false, error: error.message || "An unexpected error occurred while fetching WoS data." }
  }
}
