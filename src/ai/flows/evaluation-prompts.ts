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
  relevance: z.string().describe("A question to prompt evaluation of the project's relevance and significance."),
  methodology: z.string().describe("A question to prompt evaluation of the project's methodology and research design."),
  feasibility: z.string().describe("A question to prompt evaluation of the project's feasibility, considering timeline and budget."),
  innovation: z.string().describe("A question to prompt evaluation of the project's novelty and innovation."),
});
export type EvaluationPromptsOutput = z.infer<typeof EvaluationPromptsOutputSchema>;

export async function generateEvaluationPrompts(input: EvaluationPromptsInput): Promise<EvaluationPromptsOutput> {
  return evaluationPromptsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'evaluationPromptsPrompt',
  input: {schema: EvaluationPromptsInputSchema},
  output: {schema: EvaluationPromptsOutputSchema},
  prompt: `You are an expert research project evaluator. Based on the project title and abstract below, generate a single, insightful question for each of the four evaluation criteria (relevance, methodology, feasibility, innovation). These questions should guide an evaluator to provide a thoughtful assessment.

  Project Title: {{{title}}}
  Abstract: {{{abstract}}}

  Generate one question for each category.`,
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
