
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

const formatUserRecord = (record: StaffData, defaultCampus: 'Vadodara' | 'Goa') => {
    const isGoaUser = record.Email?.toLowerCase().endsWith('@goa.paruluniversity.ac.in');
    const instituteName = record.Type === 'Institutional' ? record.Name : record.Institute;
    const resolvedCampus = record.Campus || (isGoaUser ? 'Goa' : defaultCampus);

    return {
        name: record.Name,
        email: record.Email,
        phoneNumber: String(record.Phone || ''),
        institute: instituteName,
        department: record.Department,
        designation: record.Designation,
        faculty: record.Faculty,
        misId: String(record['MIS ID'] || ''),
        scopusId: String(record.Scopus_ID || ''),
        googleScholarId: String(record.Google_Scholar_ID || ''),
        orcidId: String(record.ORCID_ID || record.Orcid || ''),
        vidwanId: String(record.Vidwan_ID || ''),
        type: record.Type || 'faculty',
        campus: resolvedCampus,
    };
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  const misId = searchParams.get('misId');

  if (!email && !misId) {
    return NextResponse.json({ success: false, error: 'Email or MIS ID query parameter is required.' }, { status: 400 });
  }

  const goastaffdataFilePath = path.join(process.cwd(), 'goastaffdata.xlsx');
  const staffdataFilePath = path.join(process.cwd(), 'staffdata.xlsx');
  
  let foundUserRecord: StaffData | undefined;
  let defaultCampus: 'Goa' | 'Vadodara' = 'Vadodara';

  if (email) {
      const lowercasedEmail = email.toLowerCase();
      if (lowercasedEmail.endsWith('@goa.paruluniversity.ac.in')) {
          const goaData = readStaffData(goastaffdataFilePath);
          foundUserRecord = goaData.find(row => row.Email && row.Email.toLowerCase() === lowercasedEmail);
          defaultCampus = 'Goa';
      } else {
          const vadodaraData = readStaffData(staffdataFilePath);
          foundUserRecord = vadodaraData.find(row => row.Email && row.Email.toLowerCase() === lowercasedEmail);
      }
  } else if (misId) {
      // If MIS ID is provided, we need the email to determine which file to check
      const userEmailForFileCheck = searchParams.get('userEmailForFileCheck');
      const lowercasedMisId = String(misId).toLowerCase();

      if (userEmailForFileCheck?.toLowerCase().endsWith('@goa.paruluniversity.ac.in')) {
          const goaData = readStaffData(goastaffdataFilePath);
          foundUserRecord = goaData.find(row => row['MIS ID'] && String(row['MIS ID']).toLowerCase() === lowercasedMisId);
          defaultCampus = 'Goa';
      } else {
          const vadodaraData = readStaffData(staffdataFilePath);
          foundUserRecord = vadodaraData.find(row => row['MIS ID'] && String(row['MIS ID']).toLowerCase() === lowercasedMisId);
      }
  }

  if (foundUserRecord) {
    return NextResponse.json({
      success: true,
      data: [formatUserRecord(foundUserRecord, defaultCampus)], // Return as an array to maintain consistency
    });
  } else {
    return NextResponse.json({ success: false, error: `User not found in the staff data file.` }, { status: 404 });
  }
}
