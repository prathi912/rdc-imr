
'use server';

import { adminDb } from '@/lib/admin';
import type { IncentiveClaim, User } from '@/types';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { getTemplateContent } from '@/lib/template-manager';
import { format } from 'date-fns';

export async function generateConferenceIncentiveForm(claimId: string): Promise<{ success: boolean; fileData?: string; error?: string }> {
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
    
    const templateName = 'INCENTIVE_CONFERENCE.docx';
    
    const content = getTemplateContent(templateName);
    if (!content) {
        return { success: false, error: `Template file ${templateName} not found or couldn't be loaded.` };
    }

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => "N/A",
    });

    const approval1 = claim.approvals?.find(a => a?.stage === 1);
    const approval2 = claim.approvals?.find(a => a?.stage === 2);
    const approval3 = claim.approvals?.find(a => a?.stage === 3);

    const data = {
        name: user.name || 'N/A',
        designation: user.designation || 'N/A',
        department: user.department || 'N/A',
        conference_name: claim.conferenceName || 'N/A',
        paper_title: claim.conferencePaperTitle || 'N/A',
        conference_date: claim.conferenceDate ? new Date(claim.conferenceDate).toLocaleDateString('en-GB') : 'N/A',
        presentation_date: claim.presentationDate ? new Date(claim.presentationDate).toLocaleDateString('en-GB') : 'N/A',
        conference_type: claim.conferenceType || 'N/A',
        organizer: claim.organizerName || 'N/A',
        presenting_author: claim.wasPresentingAuthor ? 'Yes' : 'No',
        pu_name_present: claim.isPuNamePresent ? 'Yes' : 'No',
        total_authors: claim.totalAuthors || 'N/A',
        author_type: claim.authorType || 'N/A',
        date: format(new Date(), 'dd/MM/yyyy'),
        
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
    console.error('Error generating conference incentive form:', error);
    return { success: false, error: error.message || 'Failed to generate the form.' };
  }
}
