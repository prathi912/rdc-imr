
'use server';

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { CRO_EMAILS } from '@/lib/constants';
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
  'Scopus_ID'?: string;
  'Google_Scholar_ID'?: string;
  'LinkedIn_URL'?: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');

  if (!email) {
    return NextResponse.json({ success: false, error: 'Email query parameter is required.' }, { status: 400 });
  }
  
  if (CRO_EMAILS.includes(email)) {
      return NextResponse.json({ success: false, error: 'CRO accounts are handled separately.' });
  }

  // Construct the path to the file in the project's root directory.
  const filePath = path.join(process.cwd(), 'staffdata.xlsx');

  try {
    // Check if the file exists before attempting to read it.
    if (!fs.existsSync(filePath)) {
        console.warn(`Staff data file not found at: ${filePath}. Pre-fill feature will be inactive.`);
        return NextResponse.json({ success: false, error: 'Staff data source not found on the server.' }, { status: 404 });
    }

    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<StaffData>(worksheet);

    const userRecord = jsonData.find(row => row.Email && row.Email.toLowerCase() === email.toLowerCase());

    if (userRecord) {
      return NextResponse.json({
        success: true,
        data: {
          name: userRecord.Name,
          email: userRecord.Email,
          phoneNumber: String(userRecord.Phone || ''),
          institute: userRecord.Institute,
          department: userRecord.Department,
          designation: userRecord.Designation,
          faculty: userRecord.Faculty,
          misId: String(userRecord['MIS ID'] || ''),
          scopusId: userRecord.Scopus_ID || '',
          googleScholarId: userRecord.Google_Scholar_ID || '',
        },
      });
    } else {
      return NextResponse.json({ success: false, error: 'User not found in staff data.' });
    }
  } catch (error: any) {
    console.error('Error fetching or processing staff data file:', error);
    return NextResponse.json({ success: false, error: 'Failed to process staff data.' }, { status: 500 });
  }
}
