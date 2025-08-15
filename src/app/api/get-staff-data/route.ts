
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
  
  let userRecord: StaffData | undefined;
  let fileName: string;
  let isGoaUser = false;
  
  const goastaffdataFilePath = path.join(process.cwd(), 'goastaffdata.xlsx');
  const staffdataFilePath = path.join(process.cwd(), 'staffdata.xlsx');
  
  const goaData = readStaffData(goastaffdataFilePath);
  const vadodaraData = readStaffData(staffdataFilePath);

  if (email) {
    if (email.endsWith('@goa.paruluniversity.ac.in')) {
      isGoaUser = true;
      userRecord = goaData.find(row => row.Email && row.Email.toLowerCase() === email.toLowerCase());
      fileName = 'goastaffdata.xlsx';
    } else {
      userRecord = vadodaraData.find(row => row.Email && row.Email.toLowerCase() === email.toLowerCase());
      fileName = 'staffdata.xlsx';
    }
  } else if (misId) {
    userRecord = goaData.find(row => String(row['MIS ID'] || '').toLowerCase() === misId.toLowerCase());
    if (userRecord) {
        isGoaUser = true;
        fileName = 'goastaffdata.xlsx';
    } else {
        userRecord = vadodaraData.find(row => String(row['MIS ID'] || '').toLowerCase() === misId.toLowerCase());
        fileName = 'staffdata.xlsx';
    }
  } else {
     return NextResponse.json({ success: false, error: 'Insufficient parameters.' }, { status: 400 });
  }


  if (userRecord) {
    const instituteName = userRecord.Type === 'Institutional' ? userRecord.Name : userRecord.Institute;

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
        campus: userRecord.Campus || (isGoaUser ? 'Goa' : 'Vadodara'),
      },
    });
  } else {
    // We already assigned the filename, so we can use it in the error.
    return NextResponse.json({ success: false, error: `User not found in ${fileName}.` }, { status: 404 });
  }
}
