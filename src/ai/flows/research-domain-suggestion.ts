'use server';

/**
 * @fileOverview This file defines a Genkit flow for suggesting a researcher's core domain.
 * - getResearchDomainSuggestion - A function that takes a list of paper titles and returns a suggested domain.
 * - ResearchDomainInput - The input type for the function.
 * - ResearchDomainOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ResearchDomainInputSchema = z.object({
  paperTitles: z.array(z.string()).describe('A list of research paper titles.'),
});
export type ResearchDomainInput = z.infer<typeof ResearchDomainInputSchema>;

const ResearchDomainOutputSchema = z.object({
  domain: z.string().describe("The suggested core research domain based on the paper titles, limited to 3-5 words."),
});
export type ResearchDomainOutput = z.infer<typeof ResearchDomainOutputSchema>;

export async function getResearchDomainSuggestion(input: ResearchDomainInput): Promise<ResearchDomainOutput> {
  return researchDomainFlow(input);
}

const prompt = ai.definePrompt({
  name: 'researchDomainPrompt',
  input: {schema: ResearchDomainInputSchema},
  output: {schema: ResearchDomainOutputSchema},
  prompt: `You are an expert academic analyst. Based on the following list of research paper titles, identify and suggest a single, concise core research domain for the author. The domain should be between 3 to 5 words.

  Paper Titles:
  {{#each paperTitles}}
  - {{{this}}}
  {{/each}}

  Based on these titles, what is the most likely core research domain?`,
});

const researchDomainFlow = ai.defineFlow(
  {
    name: 'researchDomainFlow',
    inputSchema: ResearchDomainInputSchema,
    outputSchema: ResearchDomainOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
