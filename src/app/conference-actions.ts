

'use server';

import { adminDb } from '@/lib/admin';
import type { IncentiveClaim, User } from '@/types';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { getTemplateContentFromUrl } from '@/lib/template-manager';
import { format } from 'date-fns';
import { getSystemSettings } from './actions';

function getInstituteAcronym(name?: string): string {
    if (!name) return '';

    const acronymMap: { [key: string]: string } = {
        'Parul Institute of Ayurved and Research': 'PIAR (Ayu.)',
        'Parul Institute of Architecture & Research': 'PIAR (Arc.)',
        'Parul Institute of Ayurved': 'PIA (Ayu.)',
        'Parul Institute of Arts': 'PIA (Art.)',
        'Parul Institute of Pharmacy': 'PIP (Pharma)',
        'Parul Institute of Physiotherapy': 'PIP (Physio)',
    };

    if (acronymMap[name]) {
        return acronymMap[name];
    }

    const ignoreWords = ['of', 'and', '&', 'the', 'in'];
    return name
        .split(' ')
        .filter(word => !ignoreWords.includes(word.toLowerCase()))
        .map(word => word.charAt(0))
        .join('')
        .toUpperCase();
}

const conferenceChecklistFields: { id: keyof IncentiveClaim | 'name' | 'designation', label: string }[] = [
    { id: 'name', label: 'Name of the Applicant' },
    { id: 'designation', label: 'Designation & Department' },
    { id: 'eventType', label: 'Type of Event' },
    { id: 'conferencePaperTitle', label: 'Title of Paper' },
    { id: 'authorType', label: 'First/Corresponding/Co-Author' },
    { id: 'totalAuthors', label: 'Total No. of Authors' },
    { id: 'conferenceName', label: 'Name of Conference' },
    { id: 'organizerName', label: 'Name of Organizer' },
    { id: 'conferenceType', label: 'National/International' },
    { id: 'presentationType', label: 'Oral/Poster' },
    { id: 'conferenceDate', label: 'Date of Conference' },
    { id: 'travelPlaceVisited', label: 'Place Visited' },
];


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
    
    const settings = await getSystemSettings();
    const templateUrl = settings.templateUrls?.['INCENTIVE_CONFERENCE'];

    if (!templateUrl) {
      return { success: false, error: 'Conference incentive template URL is not configured in system settings.' };
    }

    const content = await getTemplateContentFromUrl(templateUrl);
    
    if (!content) {
        return { success: false, error: `Template file could not be loaded from the URL.` };
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

    const data: { [key: string]: any } = {
        applicant_name: user.name || 'N/A',
        designation: user.designation || 'N/A',
        institute: getInstituteAcronym(user.institute),
        conference_type: claim.presentationType || 'N/A',
        mode_conference: claim.eventType || 'N/A',
        locale: claim.conferenceType || 'N/A',
        title_paper: claim.conferencePaperTitle || 'N/A',
        mode_presentation: claim.conferenceMode || 'N/A',
        presentation_date: claim.presentationDate ? new Date(claim.presentationDate).toLocaleDateString('en-GB') : 'N/A',
        event_name: claim.conferenceName || 'N/A',
        organiser_name: claim.organizerName || 'N/A',
        duration_event: claim.conferenceDate ? new Date(claim.conferenceDate).toLocaleDateString('en-GB') : 'N/A',
        registration_fee: claim.registrationFee?.toLocaleString('en-IN') || '0',
        travel_expense: claim.travelFare?.toLocaleString('en-IN') || '0',
        other_expense: '0', // This field is not in the form, so defaulting to 0
        total_amount: claim.finalApprovedAmount?.toLocaleString('en-IN') || 'N/A',
    };

    // Populate checklist fields for approver 1
    conferenceChecklistFields.forEach((field, index) => {
        const key = `a1_c${index + 1}`;
        data[key] = approval1?.verifiedFields?.[field.id] ? '✓' : '';
    });

    // Populate checklist fields for approver 2
    conferenceChecklistFields.forEach((field, index) => {
        const key = `a2_c${index + 1}`;
        data[key] = approval2?.verifiedFields?.[field.id] ? '✓' : '';
    });
    
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
