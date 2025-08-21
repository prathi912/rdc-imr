
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
        wos_type: claim.wosType || 'N/A',
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

        // Verification marks for approver 1
        a1_name: getVerificationMark(approval1, 'name'),
        a1_designation: getVerificationMark(approval1, 'designation'),
        a1_publicationType: getVerificationMark(approval1, 'publicationType'),
        a1_journalName: getVerificationMark(approval1, 'journalName'),
        a1_locale: getVerificationMark(approval1, 'locale'),
        a1_indexType: getVerificationMark(approval1, 'indexType'),
        a1_wosType: getVerificationMark(approval1, 'wosType'),
        a1_journalClassification: getVerificationMark(approval1, 'journalClassification'),
        a1_authorType: getVerificationMark(approval1, 'authorType'),
        a1_totalPuAuthors: getVerificationMark(approval1, 'totalPuAuthors'),
        a1_printIssn: getVerificationMark(approval1, 'printIssn'),
        a1_publicationProofUrls: getVerificationMark(approval1, 'publicationProofUrls'),
        a1_isPuNameInPublication: getVerificationMark(approval1, 'isPuNameInPublication'),
        a1_publicationMonth: getVerificationMark(approval1, 'publicationMonth'),
        a1_authorPosition: getVerificationMark(approval1, 'authorPosition'),

        // Verification marks for approver 2
        a2_name: getVerificationMark(approval2, 'name'),
        a2_designation: getVerificationMark(approval2, 'designation'),
        a2_publicationType: getVerificationMark(approval2, 'publicationType'),
        a2_journalName: getVerificationMark(approval2, 'journalName'),
        a2_locale: getVerificationMark(approval2, 'locale'),
        a2_indexType: getVerificationMark(approval2, 'indexType'),
        a2_wosType: getVerificationMark(approval2, 'wosType'),
        a2_journalClassification: getVerificationMark(approval2, 'journalClassification'),
        a2_authorType: getVerificationMark(approval2, 'authorType'),
        a2_totalPuAuthors: getVerificationMark(approval2, 'totalPuAuthors'),
        a2_printIssn: getVerificationMark(approval2, 'printIssn'),
        a2_publicationProofUrls: getVerificationMark(approval2, 'publicationProofUrls'),
        a2_isPuNameInPublication: getVerificationMark(approval2, 'isPuNameInPublication'),
        a2_publicationMonth: getVerificationMark(approval2, 'publicationMonth'),
        a2_authorPosition: getVerificationMark(approval2, 'authorPosition'),
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
