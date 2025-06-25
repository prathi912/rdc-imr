'use server';

/**
 * @fileOverview This file defines a Genkit flow for summarizing project submissions.
 *
 * - summarizeProject - A function that takes project details and returns a concise summary.
 * - SummarizeProjectInput - The input type for the summarizeProject function.
 * - SummarizeProjectOutput - The return type for the summarizeProject function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeProjectInputSchema = z.object({
  title: z.string().describe('The title of the project.'),
  abstract: z.string().describe('The abstract of the project.'),
  type: z.string().describe('The type of the project.'),
  department: z.string().describe('The department associated with the project.'),
  teamInfo: z.string().describe('Information about the project team (PI, Co-PIs, students).'),
  timelineAndOutcomes: z.string().describe('Timeline and expected outcomes of the project.'),
});
export type SummarizeProjectInput = z.infer<typeof SummarizeProjectInputSchema>;

const SummarizeProjectOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the project submission.'),
});
export type SummarizeProjectOutput = z.infer<typeof SummarizeProjectOutputSchema>;

export async function summarizeProject(input: SummarizeProjectInput): Promise<SummarizeProjectOutput> {
  return summarizeProjectFlow(input);
}

const summarizeProjectPrompt = ai.definePrompt({
  name: 'summarizeProjectPrompt',
  input: {schema: SummarizeProjectInputSchema},
  output: {schema: SummarizeProjectOutputSchema},
  prompt: `You are an expert research project summarizer.

  Please provide a concise summary of the following research project submission, highlighting the project's goals, methodology, and potential impact.

  Project Title: {{{title}}}
  Abstract: {{{abstract}}}
  Project Type: {{{type}}}
  Department: {{{department}}}
  Team Information: {{{teamInfo}}}
  Timeline and Expected Outcomes: {{{timelineAndOutcomes}}}
  `,
});

const summarizeProjectFlow = ai.defineFlow(
  {
    name: 'summarizeProjectFlow',
    inputSchema: SummarizeProjectInputSchema,
    outputSchema: SummarizeProjectOutputSchema,
  },
  async input => {
    const {output} = await summarizeProjectPrompt(input);
    return output!;
  }
);
