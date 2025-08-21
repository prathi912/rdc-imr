
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

    const approval1 = claim.approvals?.find(a => a?.stage === 1);
    const approval2 = claim.approvals?.find(a => a?.stage === 2);
    const approval3 = claim.approvals?.find(a => a?.stage === 3);
    
    const getVerificationMark = (approval: typeof approval1, fieldId: string) => {
        if (!approval || approval.status !== 'Approved') return '';
        const verified = approval.verifiedFields?.[fieldId];
        if (verified === true) return '✓';
        if (verified === false) return '✗';
        return '';
    };

    const data = {
        name: user.name,
        designation: `${user.designation}, ${user.department}`,
        typeofpublication: claim.publicationType || 'N/A',
        journal_name: claim.journalName || 'N/A',
        locale: claim.locale || 'N/A',
        indexed: claim.indexType?.toUpperCase() || 'N/A',
        q_rating: claim.journalClassification || 'N/A',
        role: claim.authorType || 'N/A',
        author_position: claim.authorPosition || 'N/A',
        total_authors: claim.totalPuAuthors || 'N/A',
        print_issn: claim.printIssn || 'N/A',
        e_issn: claim.electronicIssn || 'N/A', 
        publish_month: claim.publicationMonth || 'N/A',
        publish_year: claim.publicationYear || 'N/A',
        
        approver_1: approval1?.status === 'Approved' ? '✓' : '✗',
        approver_2: approval2?.status === 'Approved' ? '✓' : '✗',
        
        approver1_comments: approval1?.comments || '',
        approver1_amount: approval1?.approvedAmount?.toLocaleString('en-IN') || '',
        approver2_comments: approval2?.comments || '',
        approver2_amount: approval2?.approvedAmount?.toLocaleString('en-IN') || '',
        approver3_comments: approval3?.comments || '',
        approver3_amount: approval3?.approvedAmount?.toLocaleString('en-IN') || '',

        // Verification marks for approver 1 (Checked)
        a1_c1: getVerificationMark(approval1, 'name'),
        a1_c2: getVerificationMark(approval1, 'publicationType'), // Note: a1_c2 is used for two rows based on template.
        a1_c3: getVerificationMark(approval1, 'journalName'),
        a1_c4: getVerificationMark(approval1, 'locale'),
        a1_c5: getVerificationMark(approval1, 'indexType'),
        a1_c6: getVerificationMark(approval1, 'journalClassification'),
        a1_c7: getVerificationMark(approval1, 'authorType'),
        a1_c8: getVerificationMark(approval1, 'totalPuAuthors'),
        a1_c9: getVerificationMark(approval1, 'printIssn'),
        a1_c10: getVerificationMark(approval1, 'publicationProofUrls'),
        a1_c11: getVerificationMark(approval1, 'isPuNameInPublication'),
        a1_c12: getVerificationMark(approval1, 'publicationMonth'),

        // Verification marks for approver 2 (Verified)
        a2_c1: getVerificationMark(approval2, 'name'),
        a2_c2: getVerificationMark(approval2, 'publicationType'), // Note: a2_c2 is used for two rows based on template.
        a2_c3: getVerificationMark(approval2, 'journalName'),
        a2_c4: getVerificationMark(approval2, 'locale'),
        a2_c5: getVerificationMark(approval2, 'indexType'),
        a2_c6: getVerificationMark(approval2, 'journalClassification'),
        a2_c7: getVerificationMark(approval2, 'authorType'),
        a2_c8: getVerificationMark(approval2, 'totalPuAuthors'),
        a2_c9: getVerificationMark(approval2, 'printIssn'),
        a2_c10: getVerificationMark(approval2, 'publicationProofUrls'),
        a2_c11: getVerificationMark(approval2, 'isPuNameInPublication'),
        a2_c12: getVerificationMark(approval2, 'publicationMonth'),
    };
    
    doc.setData(data);

    try {
      doc.render();
    } catch (error: any) {
      console.error('Docxtemplater render error:', error);
      if (error.properties && error.properties.errors) {
          console.error('Template errors:', JSON.stringify(error.properties.errors));
      }
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
