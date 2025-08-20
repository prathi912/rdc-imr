
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

    const approval1 = claim.approvals?.find(a => a.stage === 1);
    const approval2 = claim.approvals?.find(a => a.stage === 2);
    const approval3 = claim.approvals?.find(a => a.stage === 3);


    const data = {
        name: user.name,
        designation: `${user.designation}, ${user.department}`,
        typeofpublication: claim.publicationType || 'N/A',
        journal_name: claim.journalName || 'N/A',
        locale: claim.locale || 'N/A',
        indexed: claim.indexType?.toUpperCase() || 'N/A',
        q_rating: claim.journalClassification || 'N/A',
        role: claim.authorType || 'N/A',
        total_authors: claim.bookCoAuthors?.length || 'N/A',
        print_issn: claim.printIssn || 'N/A',
        author_po: 'N/A', // This placeholder exists in the doc but not the form
        e_issn: claim.electronicIssn || 'N/A', 
        publish_month: claim.publicationMonth || 'N/A',
        publish_year: claim.publicationYear || 'N/A',
        approver_1: approval1?.status === 'Approved' ? '✓' : '',
        approver_2: approval2?.status === 'Approved' ? '✓' : '',
        approver1_comments: approval1?.comments || '',
        approver1_amount: approval1?.approvedAmount?.toLocaleString('en-IN') || '',
        approver2_comments: approval2?.comments || '',
        approver2_amount: approval2?.approvedAmount?.toLocaleString('en-IN') || '',
        approver3_comments: approval3?.comments || '',
        approver3_amount: approval3?.approvedAmount?.toLocaleString('en-IN') || '',
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
