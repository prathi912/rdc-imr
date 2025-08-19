
'use server';

import { adminDb } from '@/lib/admin';
import type { IncentiveClaim, User } from '@/types';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { getTemplateContent } from '@/lib/template-manager';


export async function generateResearchPaperIncentiveForm(claimId: string): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const claimRef = adminDb.collection('incentiveClaims').doc(claimId);
    const claimSnap = await claimRef.get();
    if (!claimSnap.exists) {
      return { success: false, error: 'Incentive claim not found.' };
    }
    const claim = { id: claimSnap.id, ...claimSnap.data() } as IncentiveClaim;

    const userRef = adminDb.collection('users').doc(claim.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
        return { success: false, error: 'Claimant user profile not found.' };
    }
    const user = userSnap.data() as User;
    
    const templateName = 'INCENTIVE_RESEARCH_PAPER.docx';
    
    const content = getTemplateContent(templateName);
    if (!content) {
        return { success: false, error: `Template file ${templateName} not found or couldn't be loaded.` };
    }

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });

    const submissionDate = new Date(claim.submissionDate);

    const data = {
        name: user.name,
        designation: `${user.designation}, ${user.department}`,
        journal_name: claim.journalName || 'N/A',
        locale: 'International', // Assuming all are international for now, can be updated if field is added
        indexed: claim.indexType?.toUpperCase() || 'N/A',
        q_rating: claim.journalClassification || 'N/A',
        role: claim.authorType || 'N/A',
        total_authors: claim.totalAuthors || 'N/A',
        print_issn: 'N/A', // Placeholder as this is not in the form
        author_position: 'N/A', // Placeholder
        e_issn: 'N/A', // Placeholder
        publish_month: submissionDate.toLocaleString('default', { month: 'long' }),
        publish_year: submissionDate.getFullYear(),
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
    console.error('Error generating research paper incentive form:', error);
    return { success: false, error: error.message || 'Failed to generate the form.' };
  }
}
