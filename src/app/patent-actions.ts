
'use server';

import { adminDb } from '@/lib/admin';
import type { IncentiveClaim, User } from '@/types';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

// This function fetches the template from a public URL.
async function getTemplateContent(url: string): Promise<Buffer | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to fetch template from ${url}, status: ${response.status}`);
            return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.error(`Error fetching template from ${url}:`, error);
        return null;
    }
}

export async function generatePatentIncentiveForm(claimId: string): Promise<{ success: boolean; fileData?: string; error?: string }> {
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

    const TEMPLATE_URL = 'https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/INCENTIVE_PATENT.docx';
    const content = await getTemplateContent(TEMPLATE_URL);
    
    if (!content) {
        return { success: false, error: `Template file could not be loaded from the URL.` };
    }

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => "N/A", // Return "N/A" for any undefined placeholder
    });

    const approval1 = claim.approvals?.find(a => a?.stage === 1);
    const approval2 = claim.approvals?.find(a => a?.stage === 2);
    const approval3 = claim.approvals?.find(a => a?.stage === 3);
    
    // Combine all inventors' names, including the PI's.
    const allInventors = [user.name, ...(claim.patentStudentNames?.split(',') || [])]
      .map(name => name.trim())
      .filter(Boolean)
      .join(', ');

    const data = {
        applicant_name: user.name,
        designation: user.designation || 'N/A',
        institute: user.institute || 'N/A',
        title: claim.patentTitle || 'N/A',
        application_no: claim.patentApplicationNumber || 'N/A',
        names_of_inventor: allInventors,
        status: claim.patentStatus || 'N/A',
        pu_name_present: claim.patentFiledInPuName ? 'Yes' : 'No',
        approver1_comment: approval1?.comments || '',
        approver1_amount: approval1?.approvedAmount?.toLocaleString('en-IN') || '',
        approver2_comment: approval2?.comments || '',
        approver2_amount: approval2?.approvedAmount?.toLocaleString('en-IN') || '',
        approver3_comment: approval3?.comments || '',
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
    console.error('Error generating patent incentive form:', error);
    return { success: false, error: error.message || 'Failed to generate the form.' };
  }
}
