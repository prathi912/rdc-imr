'use server';

/**
 * @fileOverview This file defines a Genkit flow for finding a journal's official website.
 * It first attempts to find the journal on Springer Nature, then ScienceDirect, and if not found, falls back to a general AI search.
 * - findJournalWebsite - A function that takes a journal name and returns its likely official website URL.
 * - JournalWebsiteInput - The input type for the function.
 * - JournalWebsiteOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'zod';

const JournalWebsiteInputSchema = z.object({
  journalName: z.string().describe('The name of the academic journal.'),
});
export type JournalWebsiteInput = z.infer<typeof JournalWebsiteInputSchema>;

const JournalWebsiteOutputSchema = z.object({
  websiteUrl: z.string().url().describe("The official homepage URL of the journal."),
});
export type JournalWebsiteOutput = z.infer<typeof JournalWebsiteOutputSchema>;

export async function findJournalWebsite(input: JournalWebsiteInput): Promise<JournalWebsiteOutput> {
  return journalWebsiteFlow(input);
}

// This prompt is a fallback if the APIs don't yield a result.
const prompt = ai.definePrompt({
  name: 'journalWebsitePrompt',
  input: {schema: JournalWebsiteInputSchema},
  output: {schema: JournalWebsiteOutputSchema},
  prompt: `You are a helpful research assistant. Your task is to find the official homepage URL for a given academic journal. Provide only the URL.

  Journal Name: {{{journalName}}}

  Find the official website for this journal.`,
});

const journalWebsiteFlow = ai.defineFlow(
  {
    name: 'journalWebsiteFlow',
    inputSchema: JournalWebsiteInputSchema,
    outputSchema: JournalWebsiteOutputSchema,
  },
  async (input) => {
    // --- 1. Try Springer Nature API ---
    const springerApiKey = process.env.SPRINGER_API_KEY;
    if (springerApiKey) {
      try {
        const url = `https://api.springernature.com/meta/v2/json?q=journal:"${encodeURIComponent(
          input.journalName
        )}"&p=1&api_key=${springerApiKey}`;
        const response = await fetch(url);
        
        if (response.ok) {
          const data = await response.json();
          if (data.records && data.records.length > 0 && data.records[0].url && data.records[0].url.length > 0) {
            const springerUrl = data.records[0].url.find((u: { platform: string; value: string; }) => u.platform === 'springerlink');
            if (springerUrl && springerUrl.value) {
                return { websiteUrl: springerUrl.value };
            }
          }
        }
      } catch (e) {
        console.error("Error fetching from Springer Nature API, falling back.", e);
      }
    }
    
    // --- 2. Try ScienceDirect (Elsevier) API ---
    const scopusApiKey = process.env.SCOPUS_API_KEY;
    if (scopusApiKey) {
        try {
            const url = `https://api.elsevier.com/content/metadata/article?query=src-title(${encodeURIComponent(input.journalName)})&count=1&httpAccept=application/json&apiKey=${scopusApiKey}`;
            const response = await fetch(url);

            if (response.ok) {
                const data = await response.json();
                const firstResult = data?.['search-results']?.entry?.[0];
                if (firstResult && firstResult['prism:url']) {
                    // The URL points to the article, but we can derive the journal from it.
                    // A typical URL is like: https://api.elsevier.com/content/article/pii/S000287032400192X
                    // We will return the ScienceDirect page for the journal by linking to its publication name.
                    const pubName = firstResult['prism:publicationName'];
                    if (pubName) {
                        return { websiteUrl: `https://www.sciencedirect.com/journal/${pubName.replace(/\s+/g, '-')}` };
                    }
                }
            }
        } catch(e) {
            console.error("Error fetching from ScienceDirect API, falling back.", e);
        }
    }

    // --- 3. Fallback to generic AI search ---
    const {output} = await prompt(input);
    return output!;
  }
);
