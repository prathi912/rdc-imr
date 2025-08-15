
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
  
  let userRecord: StaffData | undefined;
  let dataSourceFile: 'goa' | 'vadodara' | null = null;
  let searchField: 'email' | 'misId' | null = null;
  let searchTerm: string | null = null;

  if (email) {
      searchField = 'email';
      searchTerm = email.toLowerCase();
      if (searchTerm.endsWith('@goa.paruluniversity.ac.in')) {
          dataSourceFile = 'goa';
      } else {
          dataSourceFile = 'vadodara';
      }
  } else if (misId) {
      // This block is for legacy support or other API calls, but the primary logic from profile setup will pass both email and misId.
      searchField = 'misId';
      searchTerm = misId.toLowerCase();
      // If only MIS ID is passed, we have to check both files.
      const goaData = readStaffData(goastaffdataFilePath);
      userRecord = goaData.find(row => String(row['MIS ID'] || '').toLowerCase() === searchTerm);
      if (userRecord) {
          dataSourceFile = 'goa';
      } else {
          dataSourceFile = 'vadodara';
      }
  }
  
  // If profile setup sends both email and misId, the email determines the file to search.
  if (email && misId) {
      searchField = 'misId';
      searchTerm = misId.toLowerCase();
      if (email.toLowerCase().endsWith('@goa.paruluniversity.ac.in')) {
          dataSourceFile = 'goa';
      } else {
          dataSourceFile = 'vadodara';
      }
  }


  if (dataSourceFile && searchField && searchTerm) {
      const data = dataSourceFile === 'goa' ? readStaffData(goastaffdataFilePath) : readStaffData(staffdataFilePath);
      const searchKey = searchField === 'misId' ? 'MIS ID' : 'Email';
      userRecord = data.find(row => row[searchKey] && String(row[searchKey]).toLowerCase() === searchTerm);
  }


  if (userRecord) {
    const isGoaUser = dataSourceFile === 'goa';
    const instituteName = userRecord.Type === 'Institutional' ? userRecord.Name : userRecord.Institute;
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
    return NextResponse.json({ success: false, error: `User not found in the ${dataSourceFile} staff data file.` }, { status: 404 });
  }
}
