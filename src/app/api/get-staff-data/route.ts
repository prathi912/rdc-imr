
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
  const userEmailForFileCheck = searchParams.get('userEmailForFileCheck');
  const fetchAll = searchParams.get('fetchAll');

  if (!email && !misId) {
    return NextResponse.json({ success: false, error: 'Email or MIS ID query parameter is required.' }, { status: 400 });
  }

  const goastaffdataFilePath = path.join(process.cwd(), 'goastaffdata.xlsx');
  const staffdataFilePath = path.join(process.cwd(), 'staffdata.xlsx');
  
  const allFoundRecords: StaffData[] = [];
  const foundEmails = new Set<string>();

  const searchAndAdd = (data: StaffData[], defaultCampus: 'Vadodara' | 'Goa') => {
      let foundRecord: StaffData | undefined;
      if (email) {
          foundRecord = data.find(row => row.Email && row.Email.toLowerCase() === email.toLowerCase());
      } else if (misId) {
          foundRecord = data.find(row => row['MIS ID'] && String(row['MIS ID']).toLowerCase() === misId.toLowerCase());
      }
      
      if (foundRecord && foundRecord.Email && !foundEmails.has(foundRecord.Email.toLowerCase())) {
          allFoundRecords.push(formatUserRecord(foundRecord, defaultCampus) as any);
          foundEmails.add(foundRecord.Email.toLowerCase());
      }
  };
  
  const searchAndAddAll = (data: StaffData[], defaultCampus: 'Vadodara' | 'Goa') => {
      data.forEach(row => {
          if (row['MIS ID'] && String(row['MIS ID']).toLowerCase() === misId?.toLowerCase()) {
             if (row.Email && !foundEmails.has(row.Email.toLowerCase())) {
                allFoundRecords.push(formatUserRecord(row, defaultCampus) as any);
                foundEmails.add(row.Email.toLowerCase());
            }
          }
      });
  };

  if (fetchAll) {
      searchAndAddAll(readStaffData(staffdataFilePath), 'Vadodara');
      searchAndAddAll(readStaffData(goastaffdataFilePath), 'Goa');
  } else if (email) {
    const isGoaEmail = email.toLowerCase().endsWith('@goa.paruluniversity.ac.in');
    searchAndAdd(readStaffData(isGoaEmail ? goastaffdataFilePath : staffdataFilePath), isGoaEmail ? 'Goa' : 'Vadodara');
  } else if (misId) {
    const isGoaContext = userEmailForFileCheck?.toLowerCase().endsWith('@goa.paruluniversity.ac.in');
    searchAndAdd(readStaffData(isGoaContext ? goastaffdataFilePath : staffdataFilePath), isGoaContext ? 'Goa' : 'Vadodara');
  }

  if (allFoundRecords.length > 0) {
    return NextResponse.json({ success: true, data: allFoundRecords });
  } else {
    return NextResponse.json({ success: false, error: `User not found in the staff data file.` }, { status: 404 });
  }
}
