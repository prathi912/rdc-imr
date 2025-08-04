
'use server';

import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { adminDb } from '@/lib/admin';
import type { Project, User, Evaluation } from '@/types';
import { getDoc, doc, collection, query, where, getDocs as adminGetDocs } from 'firebase/firestore';


export async function generateRecommendationForm(projectId: string): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const projectRef = doc(adminDb, 'projects', projectId);
    const projectSnap = await getDoc(projectRef);
    if (!projectSnap.exists()) {
      return { success: false, error: 'Project not found.' };
    }
    const project = { id: projectSnap.id, ...projectSnap.data() } as Project;
    
    const evaluationsRef = collection(adminDb, 'projects', projectId, 'evaluations');
    const evaluationsSnap = await adminGetDocs(evaluationsRef);
    const evaluations = evaluationsSnap.docs.map(doc => doc.data() as Evaluation);
    
    const templatePath = path.join(process.cwd(), 'IMR_RECOMMENDATION_TEMPLATE.docx');
    if (!fs.existsSync(templatePath)) {
      return { success: false, error: 'Recommendation form template not found on the server.' };
    }
    const content = fs.readFileSync(templatePath, 'binary');

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });

    const recommendationText = evaluations.map(e => {
        return `${e.evaluatorName} (${e.recommendation}):\n${e.comments}`;
    }).join('\n\n');

    const data = {
        pi_name: project.pi,
        submission_date: new Date(project.submissionDate).toLocaleDateString(),
        project_title: project.title,
        faculty: project.faculty,
        department: project.departmentName,
        institute: project.institute,
        grant_amount: project.grant?.totalAmount.toLocaleString('en-IN') || 'N/A',
        evaluator_comments: recommendationText || 'No evaluations submitted yet.'
    };
    
    doc.setData(data);

    try {
      doc.render();
    } catch (error: any) {
      console.error('Docxtemplater render error:', error);
      return { success: false, error: 'Failed to render the document template.' };
    }

    const buf = doc.getZip().generate({ type: 'nodebuffer' });
    const base64 = buf.toString('base64');

    return { success: true, fileData: base64 };
  } catch (error: any) {
    console.error('Error generating recommendation form:', error);
    return { success: false, error: error.message || 'Failed to generate the form.' };
  }
}
