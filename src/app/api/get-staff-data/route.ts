
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
  let fileName = 'staffdata.xlsx'; // Default
  let jsonData: StaffData[] = [];

  // Logic to determine which file to read
  const goastaffdataFilePath = path.join(process.cwd(), 'goastaffdata.xlsx');
  const staffdataFilePath = path.join(process.cwd(), 'staffdata.xlsx');

  let isGoaUser = email?.endsWith('@goa.paruluniversity.ac.in');

  // If MIS ID is provided, it could be from either file. We need to check.
  if (misId) {
      const goaData = readStaffData(goastaffdataFilePath);
      const goaRecord = goaData.find(row => String(row['MIS ID'] || '').toLowerCase() === misId.toLowerCase());
      if (goaRecord) {
          isGoaUser = true;
      }
  }

  fileName = isGoaUser ? 'goastaffdata.xlsx' : 'staffdata.xlsx';
  const filePath = isGoaUser ? goastaffdataFilePath : staffdataFilePath;


  try {
    if (!fs.existsSync(filePath)) {
        console.warn(`Staff data file not found at: ${filePath}. Pre-fill feature will be inactive.`);
        return NextResponse.json({ success: false, error: `Staff data source '${fileName}' not found on the server.` }, { status: 404 });
    }

    jsonData = readStaffData(filePath);
    
    if (misId) {
        userRecord = jsonData.find(row => String(row['MIS ID'] || '').toLowerCase() === misId.toLowerCase());
    }
    
    // If no record found by MIS ID, or if only email was provided, search by email.
    if (!userRecord && email) {
        userRecord = jsonData.find(row => row.Email && row.Email.toLowerCase() === email.toLowerCase());
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
      return NextResponse.json({ success: false, error: `User not found in ${fileName}.` });
    }
  } catch (error: any) {
    console.error(`Error fetching or processing ${fileName}:`, error);
    return NextResponse.json({ success: false, error: error.message || `Failed to process staff data from ${fileName}.` }, { status: 500 });
  }
}
