

'use server';

import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { adminDb } from '@/lib/admin';
import type { Project, User, Evaluation, IncentiveClaim } from '@/types';
import admin from 'firebase-admin';
import { format, parseISO } from 'date-fns';
import ExcelJS from 'exceljs';
import { toWords } from 'number-to-words';
import JSZip from 'jszip';
import { getTemplateContent } from '@/lib/template-manager';

async function logActivity(level: 'INFO' | 'WARNING' | 'ERROR', message: string, context: Record<string, any> = {}) {
  try {
    if (!message) {
      console.error("Log message is empty or undefined.");
      return;
    }
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };
    await adminDb.collection('logs').add(logEntry);
  } catch (error) {
    console.error("FATAL: Failed to write to logs collection.", error);
    console.error("Original Log Entry:", { level, message, context });
  }
}

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


export async function generateRecommendationForm(projectId: string): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const projectRef = adminDb.collection('projects').doc(projectId);
    const projectSnap = await projectRef.get();
    if (!projectSnap.exists) {
      return { success: false, error: 'Project not found.' };
    }
    const project = { id: projectSnap.id, ...projectSnap.data() } as Project;
    
    const evaluationsRef = projectRef.collection('evaluations');
    const evaluationsSnap = await evaluationsRef.get();
    const evaluations = evaluationsSnap.docs.map(doc => doc.data() as Evaluation);
    
    const templatePath = path.join(process.cwd(), 'src', 'templates', 'IMR_RECOMMENDATION_TEMPLATE.docx');
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

export async function generateIncentivePaymentSheet(
  claimIds: string[],
  remarks: Record<string, string>,
  referenceNumber: string
): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const claimsRef = adminDb.collection('incentiveClaims');
    const q = claimsRef.where(admin.firestore.FieldPath.documentId(), 'in', claimIds);
    const claimsSnapshot = await q.get();
    const claims = claimsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IncentiveClaim));

    const userIds = [...new Set(claims.map(c => c.uid))];
    const usersRef = adminDb.collection('users');
    const usersQuery = usersRef.where(admin.firestore.FieldPath.documentId(), 'in', userIds);
    const usersSnapshot = await usersQuery.get();
    const usersMap = new Map(usersSnapshot.docs.map(doc => [doc.id, doc.data() as User]));

    const templatePath = path.join(process.cwd(), 'src', 'templates', 'INCENTIVE_PAYMENT_SHEET.xlsx');
    if (!fs.existsSync(templatePath)) {
      return { success: false, error: 'Payment sheet template not found.' };
    }
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const worksheet = workbook.getWorksheet(1);

    if (!worksheet) {
      return { success: false, error: 'Could not find a worksheet in the template file.' };
    }

    let totalAmount = 0;
    const paymentData = claims.map((claim, index) => {
      const user = usersMap.get(claim.uid);
      const amount = claim.finalApprovedAmount || 0;
      totalAmount += amount;
      return {
        [`beneficiary_${index + 1}`]: user?.bankDetails?.beneficiaryName || user?.name || '',
        [`account_${index + 1}`]: user?.bankDetails?.accountNumber || '',
        [`ifsc_${index + 1}`]: user?.bankDetails?.ifscCode || '',
        [`branch_${index + 1}`]: user?.bankDetails?.branchName || '',
        [`amount_${index + 1}`]: amount,
        [`college_${index + 1}`]: getInstituteAcronym(user?.institute),
        [`mis_${index + 1}`]: user?.misId || '',
        [`remarks_${index + 1}`]: remarks[claim.id] || '',
      };
    });

    const flatData = paymentData.reduce((acc, item) => ({ ...acc, ...item }), {});

    flatData.date = format(new Date(), 'dd/MM/yyyy');
    flatData.reference_number = referenceNumber;
    flatData.total_amount = totalAmount;
    flatData.amount_in_word = toWords(totalAmount).replace(/\b\w/g, l => l.toUpperCase()) + ' Only';
    
    worksheet.eachRow((row) => {
        row.eachCell((cell) => {
            if (cell.value && typeof cell.value === 'string') {
                const templateVarMatch = cell.value.match(/\{(.*?)\}/);
                if (templateVarMatch && templateVarMatch[1]) {
                    const key = templateVarMatch[1];
                    const newValue = flatData[key] !== undefined ? flatData[key] : '';
                    
                    cell.value = newValue;
                    cell.font = { ...cell.font, size: 26 };
                    cell.alignment = { ...cell.alignment, horizontal: 'center', vertical: 'middle' };
                }
            }
        });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return { success: true, fileData: base64 };
  } catch (error: any) {
    console.error('Error generating payment sheet:', error);
    await logActivity('ERROR', 'Failed to generate payment sheet', { error: error.message });
    return { success: false, error: error.message || 'Failed to generate the sheet.' };
  }
}

async function generateSingleOfficeNoting(claimId: string): Promise<{ fileName: string, content: Buffer } | null> {
    try {
        const claimRef = adminDb.collection('incentiveClaims').doc(claimId);
        const claimSnap = await claimRef.get();
        if (!claimSnap.exists()) return null;

        const claim = { id: claimSnap.id, ...claimSnap.data() } as IncentiveClaim;
        const userRef = adminDb.collection('users').doc(claim.uid);
        const userSnap = await userRef.get();
        if (!userSnap.exists()) return null;

        const user = userSnap.data() as User;

        const content = getTemplateContent('INCENTIVE_OFFICE_NOTING.docx');
        if (!content) return null;

        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

        const data = {
            pi_name: user.name,
            pi_designation: user.designation || 'N/A',
            pi_department: user.department || 'N/A',
            claim_title: claim.paperTitle || claim.publicationTitle || 'N/A',
            claim_amount: claim.finalApprovedAmount?.toLocaleString('en-IN') || 'N/A',
        };

        doc.setData(data);
        doc.render();

        const buf = doc.getZip().generate({ type: 'nodebuffer' });
        const fileName = `Office_Noting_${user.name.replace(/\s+/g, '_')}_${claim.id.substring(0, 5)}.docx`;

        return { fileName, content: buf };
    } catch (error) {
        console.error(`Error generating noting for claim ${claimId}:`, error);
        return null;
    }
}

export async function generateOfficeNotingsZip(claimIds: string[]): Promise<{ success: boolean; fileData?: string; error?: string }> {
    try {
        const zip = new JSZip();
        const generationPromises = claimIds.map(id => generateSingleOfficeNoting(id));
        const results = await Promise.all(generationPromises);

        let filesGenerated = 0;
        results.forEach(result => {
            if (result) {
                zip.file(result.fileName, result.content);
                filesGenerated++;
            }
        });

        if (filesGenerated === 0) {
            return { success: false, error: 'Could not generate any of the requested documents.' };
        }

        const zipContent = await zip.generateAsync({ type: 'nodebuffer' });
        const base64 = zipContent.toString('base64');

        await logActivity('INFO', 'Generated office notings ZIP', { count: filesGenerated });
        return { success: true, fileData: base64 };

    } catch (error: any) {
        console.error('Error generating office notings ZIP:', error);
        await logActivity('ERROR', 'Failed to generate office notings ZIP', { error: error.message });
        return { success: false, error: error.message || 'Failed to generate ZIP file.' };
    }
}


export async function exportClaimToExcel(
  claimId: string,
): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const claimRef = adminDb.collection("incentiveClaims").doc(claimId)
    const claimSnap = await claimRef.get()
    if (!claimSnap.exists()) {
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

    const templatePath = path.join(process.cwd(), 'src', 'templates', 'format.xlsx');
    if (!fs.existsSync(templatePath)) {
        return { success: false, error: 'Template file "format.xlsx" not found or could not be read.' };
    }
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const worksheet = workbook.getWorksheet(1); // Get the first worksheet
    
    if (!worksheet) {
        return { success: false, error: 'Could not find a worksheet in the template file.' };
    }

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
            worksheet.getCell(cellAddress).value = dataMap[cellAddress];
        }
    }

    const outputBuffer = await workbook.xlsx.writeBuffer();
    const base64 = Buffer.from(outputBuffer).toString('base64');

    return { success: true, fileData: base64 }
  } catch (error: any) {
    console.error("Error exporting claim to Excel:", error)
    await logActivity('ERROR', 'Failed to export claim to Excel', { claimId, error: error.message, stack: error.stack });
    return { success: false, error: error.message || "Failed to export data." }
  }
}
