
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
import { Part } from 'genkit';

const ChatInputSchema = z.object({
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.array(z.object({ 
        text: z.string().optional(),
        media: z.object({
            url: z.string(),
            contentType: z.string().optional(),
        }).optional()
    })),
  })),
  user: z.object({
    uid: z.string(),
    role: z.string(),
    designation: z.string().optional(),
    institute: z.string().optional(),
    department: z.string().optional(),
    faculties: z.array(z.string()).optional(),
  }),
  fileDataUri: z.string().optional(),
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
    // The context here is passed from the `chat` function's call to the prompt.
    const user = (context as any).user;
    if (!user) {
        throw new Error("User context is missing. Cannot perform role-based data fetching.");
    }

    const projectsCol = collection(adminDb, 'projects');
    const constraints: any[] = [];

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
    Your capabilities include querying project data and analyzing uploaded files.
    You MUST use the provided tools to answer questions about project data. Do not make up data.
    If the user uploads a file (image, PDF, Excel), analyze its content to answer their questions.
    When a user asks a question, use the available tools to find the information.
    If a user asks for "all projects", you can assume they mean the most recent ones and apply a reasonable limit unless they specify otherwise.
    Based on the user's role, the data you can access is already filtered. For example, a Principal of an institute will only see projects from their institute. Do not mention this filtering unless it's relevant to their question.
    Format your answers clearly. For lists of projects, use bullet points or tables.`,
    tools: [getProjectsData],
});


export async function chat(input: ChatInput): Promise<ChatOutput> {
  const { history, user, fileDataUri } = input;

  const promptHistory: Part[] = history.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));

  // Add the current user's message, which may include a file, to the end of the history for the AI to process.
  // The last message in the `history` from the client is the one we want to process.
  if (fileDataUri && promptHistory.length > 0) {
      const lastMessage = promptHistory[promptHistory.length - 1];
      if (lastMessage.role === 'user' && Array.isArray(lastMessage.content)) {
          lastMessage.content.push({ media: { url: fileDataUri } });
      }
  }

  const result = await chatAgent(
    { history: promptHistory },
    { context: { user: user } }
  );
  
  // Ensure the final output is a simple string.
  return result.text;
}
