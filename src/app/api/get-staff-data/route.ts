
'use server';

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

// Define the expected structure of a row in the Excel sheet
interface StaffData {
  Name?: string;
  Email?: string;
  Phone?: string | number;
  Institute?: string;
  Department?: string;
  Designation?: string;
  Faculty?: string;
  'MIS ID'?: string | number;
  Scopus_ID?: string | number;
  Google_Scholar_ID?: string | number;
  LinkedIn_URL?: string;
  ORCID_ID?: string | number;
  Vidwan_ID?: string | number;
  Type?: 'CRO' | 'Institutional' | 'faculty';
  Campus?: 'Vadodara' | 'Ahmedabad' | 'Rajkot' | 'Goa';
  // Goa specific columns
  Orcid?: string | number;
}

const readStaffData = (filePath: string): StaffData[] => {
    if (!fs.existsSync(filePath)) {
        console.warn(`Staff data file not found at: ${filePath}.`);
        return [];
    }
    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json<StaffData>(worksheet);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  const misId = searchParams.get('misId');

  if (!email && !misId) {
    return NextResponse.json({ success: false, error: 'Email or MIS ID query parameter is required.' }, { status: 400 });
  }

  const goastaffdataFilePath = path.join(process.cwd(), 'goastaffdata.xlsx');
  const staffdataFilePath = path.join(process.cwd(), 'staffdata.xlsx');
  
  const goaData = readStaffData(goastaffdataFilePath);
  const vadodaraData = readStaffData(staffdataFilePath);

  let userRecord: StaffData | undefined;
  let isGoaUser = false;
  let fileName = 'staffdata.xlsx'; // Default file name

  if (email) {
    const lowercasedEmail = email.toLowerCase();
    if (lowercasedEmail.endsWith('@goa.paruluniversity.ac.in')) {
      // If it's a Goa email, ONLY search the Goa file.
      userRecord = goaData.find(row => row.Email && row.Email.toLowerCase() === lowercasedEmail);
      isGoaUser = true;
      fileName = 'goastaffdata.xlsx';
    } else {
      // For any other email, ONLY search the Vadodara file.
      userRecord = vadodaraData.find(row => row.Email && row.Email.toLowerCase() === lowercasedEmail);
    }
  } else if (misId) {
    // If searching by MIS ID, check Goa file first.
    userRecord = goaData.find(row => String(row['MIS ID'] || '').toLowerCase() === misId.toLowerCase());
    if (userRecord) {
      isGoaUser = true;
      fileName = 'goastaffdata.xlsx';
    } else {
      // If not found in Goa file, check Vadodara file.
      userRecord = vadodaraData.find(row => String(row['MIS ID'] || '').toLowerCase() === misId.toLowerCase());
      fileName = 'staffdata.xlsx';
    }
  }

  if (userRecord) {
    const instituteName = userRecord.Type === 'Institutional' ? userRecord.Name : userRecord.Institute;
    // Determine campus from record, fallback to email domain, then default to Vadodara
    const resolvedCampus = userRecord.Campus || (isGoaUser ? 'Goa' : 'Vadodara');

    return NextResponse.json({
      success: true,
      data: {
        name: userRecord.Name,
        email: userRecord.Email,
        phoneNumber: String(userRecord.Phone || ''),
        institute: instituteName,
        department: userRecord.Department,
        designation: userRecord.Designation,
        faculty: userRecord.Faculty,
        misId: String(userRecord['MIS ID'] || ''),
        scopusId: String(userRecord.Scopus_ID || ''),
        googleScholarId: String(userRecord.Google_Scholar_ID || ''),
        orcidId: String(userRecord.ORCID_ID || userRecord.Orcid || ''),
        vidwanId: String(userRecord.Vidwan_ID || ''),
        type: userRecord.Type || 'faculty',
        campus: resolvedCampus,
      },
    });
  } else {
    return NextResponse.json({ success: false, error: `User not found in the respective staff data file.` }, { status: 404 });
  }
}
