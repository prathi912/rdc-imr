'use server';

/**
 * @fileOverview A conversational AI agent for querying R&D portal data.
 * - chat - The main conversational flow.
 * - getProjectsData - A tool for the AI to fetch project data securely based on user roles.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { adminDb } from '@/lib/admin';
import type { Project, User } from '@/types';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

const ChatInputSchema = z.object({
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.array(z.object({ text: z.string() })),
  })),
  user: z.object({
    uid: z.string(),
    role: z.string(),
    designation: z.string().optional(),
    institute: z.string().optional(),
    department: z.string().optional(),
    faculties: z.array(z.string()).optional(),
  }),
});
export type ChatInput = z.infer<typeof ChatInputSchema>;

const ChatOutputSchema = z.string();
export type ChatOutput = z.infer<typeof ChatOutputSchema>;

const GetProjectsInputSchema = z.object({
  status: z.enum(['Submitted', 'Under Review', 'Recommended', 'Not Recommended', 'In Progress', 'Completed', 'Pending Completion Approval', 'Draft']).optional(),
  limit: z.number().optional().default(10),
});

const getProjectsData = ai.defineTool(
  {
    name: 'getProjectsData',
    description: 'Retrieves a list of research projects from the database. Can filter by status.',
    inputSchema: GetProjectsInputSchema,
    outputSchema: z.array(z.object({
        title: z.string(),
        pi: z.string(),
        status: z.string(),
        faculty: z.string(),
        institute: z.string(),
        departmentName: z.string(),
        submissionDate: z.string(),
    })),
  },
  async (input, context) => {
    const user = (context as ChatInput).user;

    const projectsCol = collection(adminDb, 'projects');
    const constraints = [];

    // Apply role-based filtering
    if (user.role === 'CRO' && user.faculties && user.faculties.length > 0) {
      constraints.push(where('faculty', 'in', user.faculties));
    } else if (user.designation === 'Principal' && user.institute) {
      constraints.push(where('institute', '==', user.institute));
    } else if (user.designation === 'HOD' && user.department && user.institute) {
      constraints.push(where('departmentName', '==', user.department), where('institute', '==', user.institute));
    }
    // For Admins/Super-admins, no extra constraints are added, so they see all projects.

    if (input.status) {
      constraints.push(where('status', '==', input.status));
    }
    
    constraints.push(orderBy('submissionDate', 'desc'));
    constraints.push(limit(input.limit!));

    const q = query(projectsCol, ...constraints);
    const snapshot = await getDocs(q);
    const projects = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            title: data.title,
            pi: data.pi,
            status: data.status,
            faculty: data.faculty,
            institute: data.institute,
            departmentName: data.departmentName,
            submissionDate: new Date(data.submissionDate).toLocaleDateString(),
        };
    });
    
    return projects;
  }
);

const chatAgent = ai.definePrompt({
    name: 'chatAgentPrompt',
    system: `You are a helpful AI assistant for the Parul University Research & Development Portal.
    Your capabilities include querying project data.
    You MUST use the provided tools to answer questions about data. Do not make up data.
    When a user asks a question, use the available tools to find the information.
    If a user asks for "all projects", you can assume they mean the most recent ones and apply a reasonable limit unless they specify otherwise.
    Based on the user's role, the data you can access is already filtered. For example, a Principal of an institute will only see projects from their institute. Do not mention this filtering unless it's relevant to their question.
    Format your answers clearly. For lists of projects, use bullet points or tables.`,
    tools: [getProjectsData],
});


export async function chat(input: ChatInput): Promise<ChatOutput> {
  const result = await chatAgent({
    history: input.history,
    // Provide the user object in the context for the tools to use
    context: { user: input.user },
  }, {
    // Pass the user object to the model as well, so it has context
    context: { user: input.user }
  });
  return result.text;
}
