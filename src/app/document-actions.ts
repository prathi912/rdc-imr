

'use server';

import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { adminDb } from '@/lib/admin';
import type { Project, User, Evaluation, IncentiveClaim, SystemSettings } from '@/types';
import admin from 'firebase-admin';
import { format, parseISO } from 'date-fns';
import ExcelJS from 'exceljs';
import { toWords } from 'number-to-words';
import JSZip from 'jszip';
import { getTemplateContent } from '@/lib/template-manager';
import { getSystemSettings } from './actions';
import ImageModule from 'docxtemplater-image-module-free';

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
    
    const IMR_TEMPLATE_URL = "https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/IMR_RECOMMENDATION_TEMPLATE.docx";

    let templateBuffer;
    try {
      const response = await fetch(IMR_TEMPLATE_URL, { cache: 'no-store' });
      if (!response.ok) {
        return { success: false, error: 'Recommendation form template not found on the server.' };
      }
      templateBuffer = Buffer.from(await response.arrayBuffer());
    } catch (err) {
      return { success: false, error: 'Error fetching recommendation form template.' };
    }

    const zip = new PizZip(templateBuffer);
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

    const TEMPLATE_URL = "https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/INCENTIVE_PAYMENT_SHEET.xlsx";
    const response = await fetch(TEMPLATE_URL);
    if (!response.ok) {
        return { success: false, error: 'Payment sheet template not found.' };
    }
    const templateBuffer = await response.arrayBuffer();
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateBuffer);
    const worksheet = workbook.getWorksheet("Sheet1");

    if (!worksheet) {
      return { success: false, error: 'Could not find a worksheet named "Sheet1" in the template file.' };
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
    flatData.amount_in_word = toWords(totalAmount).replace(/\b\w/g, (l: string) => l.toUpperCase()) + ' Only';
    
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
        if (!claimSnap.exists) return null;

        const claim = { id: claimSnap.id, ...claimSnap.data() } as IncentiveClaim;
        const userRef = adminDb.collection('users').doc(claim.uid);
        const userSnap = await userRef.get();
        if (!userSnap.exists) return null;

        const user = userSnap.data() as User;
        
        const claimTitle = claim.paperTitle || claim.publicationTitle || claim.patentTitle || claim.professionalBodyName || claim.apcPaperTitle || claim.conferencePaperTitle || 'N/A';

        const content = await getTemplateContent('INCENTIVE_OFFICE_NOTING.docx');
        if (!content) {
            console.error(`Template "INCENTIVE_OFFICE_NOTING.docx" not found.`);
            return null;
        }

        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

        const data = {
            name: user.name,
            designation: user.designation || 'N/A',
            claim_title: claimTitle,
            claim_type: claim.claimType,
            submission_date: new Date(claim.submissionDate).toLocaleDateString(),
            final_amount: claim.finalApprovedAmount?.toLocaleString('en-IN') || 'N/A',
            date: format(new Date(), 'dd/MM/yyyy'),
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
        const generationPromises = claimIds.map(claimId => generateSingleOfficeNoting(claimId));
        const results = await Promise.all(generationPromises);

        const successfulDocs = results.filter((result): result is { fileName: string; content: Buffer } => result !== null);

        if (successfulDocs.length === 0) {
            return { success: false, error: 'Could not generate any of the requested documents.' };
        }

        const zip = new JSZip();
        successfulDocs.forEach(doc => {
            zip.file(doc.fileName, doc.content);
        });
        
        const zipContent = await zip.generateAsync({ type: 'nodebuffer' });
        const base64 = zipContent.toString('base64');

        await logActivity('INFO', 'Generated office notings ZIP', { count: successfulDocs.length });
        return { success: true, fileData: base64 };

    } catch (error: any) {
        console.error('Error generating office notings ZIP:', error);
        await logActivity('ERROR', 'Failed to generate office notings ZIP', { error: error.message });
        return { success: false, error: error.message || 'Failed to generate ZIP file.' };
    }
}

export async function generateOfficeNotingForClaim(claimId: string): Promise<{ success: boolean; fileData?: string; fileName?: string; error?: string }> {
    try {
        const result = await generateSingleOfficeNoting(claimId);
        if (!result) {
            return { success: false, error: 'Failed to generate the document.' };
        }
        const base64 = result.content.toString('base64');
        return { success: true, fileData: base64, fileName: result.fileName };
    } catch (error: any) {
        console.error(`Error generating single noting for claim ${claimId}:`, error);
        await logActivity('ERROR', 'Failed to generate single office noting', { claimId, error: error.message });
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

async function getImageAsBuffer(url: string) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.error(`Error fetching image from ${url}:`, error);
        return null; // Return null if the image can't be fetched
    }
}

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
      
      const content = await getTemplateContent('INCENTIVE_RESEARCH_PAPER.docx');
      if (!content) {
          return { success: false, error: 'Template file INCENTIVE_RESEARCH_PAPER.docx not found.' };
      }
  
      const zip = new PizZip(content);
      
      const settings = await getSystemSettings();
      const approvers = settings.incentiveApprovers || [];
      const data: any = {};
      
      const imageModule = new ImageModule({
          centered: false,
          getImage: (tag: string) => {
              // tag is the value from the template, e.g., 'data.approver2_sign'
              const buffer = tag;
              return buffer;
          },
          getSize: () => [150, 50], // width, height in pixels
      });

      const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
          nullGetter: () => "",
          modules: [imageModule],
      });
      
      const approval1 = claim.approvals?.find(a => a?.stage === 1);
      const approval2 = claim.approvals?.find(a => a?.stage === 2);
      const approval3 = claim.approvals?.find(a => a?.stage === 3);
      const approval4 = claim.approvals?.find(a => a?.stage === 4);
      
      // Fetch signature images in parallel
      const signatureUrls = {
        approver2_sign: approvers.find(a => a.stage === 2)?.signatureUrl,
        approver3_sign: approvers.find(a => a.stage === 3)?.signatureUrl,
        approver4_sign: approvers.find(a => a.stage === 4)?.signatureUrl,
      };

      const imagePromises = Object.entries(signatureUrls)
        .filter(([, url]) => !!url)
        .map(async ([key, url]) => {
          const buffer = await getImageAsBuffer(url!);
          return { key, buffer };
        });

      const resolvedImages = await Promise.all(imagePromises);
      const imageBuffers = resolvedImages.reduce((acc, { key, buffer }) => {
          if (buffer) acc[key] = buffer;
          return acc;
      }, {} as Record<string, Buffer>);
  
      data.name = user.name;
      data.designation = user.designation || 'N/A';
      data.department = user.department || 'N/A';
      data.publication_type = claim.publicationType || 'N/A';
      data.journal_name = claim.journalName || 'N/A';
      data.locale = claim.locale || 'N/A';
      data.index_type = claim.indexType?.toUpperCase() || 'N/A';
      data.wos_type = claim.wosType || 'N/A';
      data.q_rating = claim.journalClassification || 'N/A';
      data.author_role = claim.authorType || 'N/A';
      data.author_position = claim.authorPosition || 'N/A';
      data.total_pu_authors = claim.authors?.filter(a => !a.isExternal).length || 0;
      data.issn = `${claim.printIssn || ''} (Print) / ${claim.electronicIssn || ''} (Electronic)`;
      data.pu_name_exists = claim.isPuNameInPublication ? 'Yes' : 'No';
      data.published_month_year = `${claim.publicationMonth || ''}, ${claim.publicationYear || ''}`;
      data.approver1_comments = approval1?.comments || 'N/A';
      data.approver1_amount = approval1?.approvedAmount?.toLocaleString('en-IN') || 'N/A';
      data.approver2_comments = approval2?.comments || 'N/A';
      data.approver2_amount = approval2?.approvedAmount?.toLocaleString('en-IN') || 'N/A';
      data.approver3_comments = approval3?.comments || 'N/A';
      data.approver3_amount = approval3?.approvedAmount?.toLocaleString('en-IN') || 'N/A';
      data.final_approved_amount = claim.finalApprovedAmount?.toLocaleString('en-IN') || 'N/A';
      
      // Add image buffers to the data object for the template
      data.approver2_sign = imageBuffers.approver2_sign;
      data.approver3_sign = imageBuffers.approver3_sign;
      data.approver4_sign = imageBuffers.approver4_sign;
      
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
