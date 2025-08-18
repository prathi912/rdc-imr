
'use server';

import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { adminDb } from '@/lib/admin';
import type { Project, User, Evaluation } from '@/types';
import { getDoc, doc, collection, query, where, getDocs as adminGetDocs } from 'firebase/firestore';
import officeNotingTemplate from '@/templates/IMR_RECOMMENDATION_TEMPLATE.docx';
import excelClaimTemplate from '@/templates/format.xlsx';


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

export async function generateOfficeNotingForm(
  projectId: string,
  formData: {
    projectDuration: string;
    phases: { name: string; amount: number }[];
  }
): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const projectRef = adminDb.collection('projects').doc(projectId);
    const projectSnap = await projectRef.get();
    if (!projectSnap.exists) {
      return { success: false, error: 'Project not found.' };
    }
    const project = { id: projectSnap.id, ...projectSnap.data() } as Project;

    const piUserRef = adminDb.collection('users').doc(project.pi_uid);
    const piUserSnap = await piUserRef.get();
    const piUser = piUserSnap.exists ? piUserSnap.data() as User : null;
    
    let coPi1User: User | null = null;
    if (project.coPiDetails && project.coPiDetails.length > 0 && project.coPiDetails[0].uid) {
      const coPi1UserRef = adminDb.collection('users').doc(project.coPiDetails[0].uid!);
      const coPi1UserSnap = await coPi1UserRef.get();
      if (coPi1UserSnap.exists) {
        coPi1User = coPi1UserSnap.data() as User;
      }
    }

    if (!officeNotingTemplate) {
        return { success: false, error: 'Office Notings form template not found on the server.' };
    }
    const zip = new PizZip(officeNotingTemplate, { base64: true });

    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    const coPiData: { [key: string]: string } = {};
    const coPiNames = project.coPiDetails?.map(c => c.name) || [];
    for (let i = 0; i < 4; i++) {
      coPiData[`co-pi${i + 1}`] = coPiNames[i] || '';
    }
    
    const phaseData: { [key: string]: string } = {};
    let totalAmount = 0;
    for (let i = 0; i < 4; i++) {
        if (formData.phases[i]) {
            phaseData[`phase${i + 1}_amount`] = formData.phases[i].amount.toLocaleString('en-IN');
            totalAmount += formData.phases[i].amount;
        } else {
            phaseData[`phase${i + 1}_amount`] = 'N/A';
        }
    }

    const data = {
      pi_name: project.pi,
      pi_designation: piUser?.designation || 'N/A',
      pi_department: piUser?.department || project.departmentName || 'N/A',
      pi_phone: project.pi_phoneNumber || piUser?.phoneNumber || 'N/A',
      pi_email: project.pi_email,
      ...coPiData,
      copi_designation: coPi1User?.designation || 'N/A',
      copi_department: coPi1User?.department || 'N/A',
      project_title: project.title,
      project_duration: formData.projectDuration,
      ...phaseData,
      total_amount: totalAmount.toLocaleString('en-IN'),
      presentation_date: project.meetingDetails?.date ? format(parseISO(project.meetingDetails.date), 'dd/MM/yyyy') : 'N/A',
      presentation_time: project.meetingDetails?.time || 'N/A',
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
    
    if (project.status === 'Recommended') {
      await projectRef.update({
          projectDuration: formData.projectDuration,
          phases: formData.phases,
      });
    }

    return { success: true, fileData: base64 };
  } catch (error: any) {
    console.error('Error generating office notings form:', error);
    await logActivity('ERROR', 'Failed to generate office notings form', { projectId, error: error.message, stack: error.stack });
    return { success: false, error: error.message || 'Failed to generate the form.' };
  }
}

export async function exportClaimToExcel(
  claimId: string,
): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const claimRef = adminDb.collection("incentiveClaims").doc(claimId)
    const claimSnap = await claimRef.get()
    if (!claimSnap.exists) {
      return { success: false, error: "Claim not found." }
    }
    const claim = claimSnap.data() as IncentiveClaim

    // Fetch user data for designation and department
    let user: User | null = null
    if (claim.uid) {
      const userRef = adminDb.collection("users").doc(claim.uid)
      const userSnap = await userRef.get()
      if (userSnap.exists) {
        user = userSnap.data() as User
      }
    }

    if (!excelClaimTemplate) {
        return { success: false, error: 'Template file "format.xlsx" not found or could not be read.' };
    }
    const workbook = XLSX.read(excelClaimTemplate, { type: "binary", cellStyles: true, sheetStubs: true });

    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]

    const getClaimTitle = (claim: IncentiveClaim): string => {
      return (
        claim.paperTitle ||
        claim.patentTitle ||
        claim.conferencePaperTitle ||
        claim.publicationTitle ||
        claim.professionalBodyName ||
        claim.apcPaperTitle ||
        "N/A"
      )
    }

    const claimTitle = getClaimTitle(claim)
    const submissionDate = claim.submissionDate ? new Date(claim.submissionDate).toLocaleDateString() : "N/A"

    const dataMap: { [key: string]: any } = {
      B2: claim.userName,
      B3: user?.designation || "N/A",
      B4: user?.department || "N/A",
      B5: claimTitle,
      D11: submissionDate,
    }

    for (const cellAddress in dataMap) {
      if (Object.prototype.hasOwnProperty.call(dataMap, cellAddress)) {
        const value = dataMap[cellAddress]
        if (value !== undefined && value !== null) {
          if (worksheet[cellAddress]) {
            // Cell exists (even if it was empty and just styled, thanks to sheetStubs).
            // Update its value and set type to string.
            worksheet[cellAddress].v = value
            worksheet[cellAddress].t = "s"
          } else {
            // Fallback for cells that don't exist at all in the template.
            XLSX.utils.sheet_add_aoa(worksheet, [[value]], { origin: cellAddress })
          }
        }
      }
    }

    // Explicitly tell the writer to use cell styles from the workbook object
    const outputBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "base64", cellStyles: true })

    return { success: true, fileData: outputBuffer }
  } catch (error: any) {
    console.error("Error exporting claim to Excel:", error)
    await logActivity('ERROR', 'Failed to export claim to Excel', { claimId, error: error.message, stack: error.stack });
    return { success: false, error: error.message || "Failed to export data." }
  }
}