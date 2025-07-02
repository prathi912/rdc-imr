'use server';

/**
 * @fileOverview This file defines a Genkit flow for finding a journal's official website.
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
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
