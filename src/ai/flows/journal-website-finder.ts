'use server';

/**
 * @fileOverview This file defines a Genkit flow for finding a journal's official website.
 * It first attempts to find the journal on Springer Nature, and if not found, falls back to a general AI search.
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

// This prompt is a fallback if the Springer Nature API doesn't yield a result.
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
    const springerApiKey = process.env.SPRINGER_API_KEY;

    if (springerApiKey) {
      try {
        const url = `https://api.springernature.com/meta/v2/json?q=journal:"${encodeURIComponent(
          input.journalName
        )}"&p=1&api_key=${springerApiKey}`;
        const response = await fetch(url);
        
        if (response.ok) {
          const data = await response.json();
          // Check for records and a valid URL in the first record
          if (data.records && data.records.length > 0 && data.records[0].url && data.records[0].url.length > 0) {
            const springerUrl = data.records[0].url.find((u: { format: string; platform: string; value: string; }) => u.format === '' && u.platform === 'springerlink');
            if (springerUrl && springerUrl.value) {
                return { websiteUrl: springerUrl.value };
            }
          }
        }
      } catch (e) {
        console.error("Error fetching from Springer Nature API, falling back to general AI search.", e);
        // Fallthrough to the generic AI search
      }
    }
    
    // Fallback to generic AI search if Springer API key is missing, call fails, or no result found
    const {output} = await prompt(input);
    return output!;
  }
);
