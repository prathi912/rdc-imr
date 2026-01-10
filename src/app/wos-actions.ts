'use server';

import type { IncentiveClaim } from '@/types';

type WoSAuthor = {
  fullName?: string;
};

type WoSRecord = {
  title?: { value?: string };
  source?: { sourceTitle?: string };
  publicationInfo?: { year?: number };
  names?: { authors?: WoSAuthor[] };
};

export async function fetchWosDataByUrl(
  identifier: string,
  claimantName: string,
): Promise<{
  success: boolean;
  data?: {
    paperTitle: string;
    journalName: string;
    totalAuthors: number;
    publicationYear: string;
    relevantLink: string;
  };
  error?: string;
  claimantIsAuthor?: boolean;
}> {
  const apiKey = process.env.WOS_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: 'Web of Science API key is not configured on the server.',
    };
  }

  // Determine if the identifier is a DOI or a WoS Accession Number
  let queryParam: string;
  let relevantLink: string;

  const doiMatch = identifier.match(/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
  const wosIdMatch = identifier.match(/WOS:\d+/i);

  if (wosIdMatch) {
    queryParam = `UT=${encodeURIComponent(identifier)}`;
    relevantLink = `https://www.webofscience.com/wos/woscc/full-record/${identifier}`;
  } else if (doiMatch) {
    const doi = doiMatch[1];
    queryParam = `DO=${encodeURIComponent(doi)}`;
    relevantLink = `https://doi.org/${doi}`;
  } else {
    // As a last resort, assume it's a raw DOI
    queryParam = `DO=${encodeURIComponent(identifier)}`;
    relevantLink = `https://doi.org/${identifier}`;
  }
  

  const wosApiUrl =
    `https://api.clarivate.com/apis/wos-starter/v1/documents` +
    `?q=${queryParam}` +
    `&db=WOS&limit=1`;

  try {
    const response = await fetch(wosApiUrl, {
      headers: {
        'X-ApiKey': apiKey,
        Accept: 'application/json;charset=UTF-8',
      },
    });

    if (!response.ok) {
      let message = 'Failed to fetch data from Web of Science.';
      try {
        const err = await response.json();
        message = err?.error?.message || err?.message || message;
      } catch {
        // ignore JSON parse errors
      }
      return { success: false, error: `WoS API Error: ${message}` };
    }

    const payload = await response.json();
    const record: WoSRecord | undefined = payload?.data?.[0];

    if (!record) {
      return {
        success: false,
        error: 'No matching record found in Web of Science for the provided identifier.',
      };
    }

    const paperTitle = record.title?.value ?? '';
    const journalName = record.source?.sourceTitle ?? '';
    const publicationYear = record.publicationInfo?.year
      ? String(record.publicationInfo.year)
      : '';

    const authors = record.names?.authors ?? [];
    const totalAuthors = authors.length;

    const claimantParts = claimantName.trim().toLowerCase().split(/\s+/);
    const claimantLastName = claimantParts.pop() ?? '';
    const claimantFirstInitial = claimantParts[0]?.charAt(0) ?? '';

    const claimantIsAuthor = authors.some((author) => {
      const fullName = author.fullName?.toLowerCase() ?? '';
      if (!fullName || !claimantLastName) return false;

      // Expected WoS format: "lastname, firstname"
      if (fullName.includes(',')) {
        const [last, first] = fullName.split(',').map((p) => p.trim());
        return (
          last === claimantLastName &&
          (!claimantFirstInitial ||
            first?.startsWith(claimantFirstInitial))
        );
      }

      // Fallback for non-standard formats
      return fullName.includes(claimantLastName);
    });

    return {
      success: true,
      data: {
        paperTitle,
        journalName,
        totalAuthors,
        publicationYear,
        relevantLink,
      },
      claimantIsAuthor,
    };
  } catch (err: any) {
    return {
      success: false,
      error:
        err?.message ||
        'An unexpected error occurred while fetching WoS data.',
    };
  }
}