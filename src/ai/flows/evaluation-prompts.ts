'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating evaluation prompts for a research project.
 * - generateEvaluationPrompts - A function that takes project details and returns suggested evaluation questions.
 * - EvaluationPromptsInput - The input type for the function.
 * - EvaluationPromptsOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const EvaluationPromptsInputSchema = z.object({
  title: z.string().describe('The title of the project.'),
  abstract: z.string().describe('The abstract of the project.'),
});
export type EvaluationPromptsInput = z.infer<typeof EvaluationPromptsInputSchema>;

const EvaluationPromptsOutputSchema = z.object({
  guidance: z.string().describe("A single, insightful question to guide the evaluator's overall assessment and comments about the project."),
});
export type EvaluationPromptsOutput = z.infer<typeof EvaluationPromptsOutputSchema>;

export async function generateEvaluationPrompts(input: EvaluationPromptsInput): Promise<EvaluationPromptsOutput> {
  return evaluationPromptsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'evaluationPromptsPrompt',
  input: {schema: EvaluationPromptsInputSchema},
  output: {schema: EvaluationPromptsOutputSchema},
  prompt: `You are an expert research project evaluator. Your task is to provide a single, insightful question to guide another evaluator who is reviewing the project below. The question should encourage them to think critically about the project's overall merit, potential impact, and feasibility, helping them write comprehensive comments.

  Project Title: {{{title}}}
  Abstract: {{{abstract}}}

  Generate one guiding question.`,
});

const evaluationPromptsFlow = ai.defineFlow(
  {
    name: 'evaluationPromptsFlow',
    inputSchema: EvaluationPromptsInputSchema,
    outputSchema: EvaluationPromptsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
