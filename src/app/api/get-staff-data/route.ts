
'use server';

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import * as XLSX from 'xlsx';
import fs from 'fs';
import { CRO_EMAILS } from '@/lib/constants';

// Define the expected structure of a row in the Excel sheet
interface StaffData {
  Name?: string;
  Email?: string;
  Phone?: string;
  Institute?: string;
  Department?: string;
  Designation?: string;
  'MIS ID'?: string;
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
  
  // Do not process for CRO emails as they have special roles
  if (CRO_EMAILS.includes(email)) {
      return NextResponse.json({ success: false, error: 'CRO accounts are handled separately.' });
  }

  const filePath = path.join(process.cwd(), 'src', 'lib', 'data', 'staffdata.xlsx');

  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`Staff data file not found at: ${filePath}. Pre-fill feature will be inactive.`);
      return NextResponse.json({ success: false, error: 'Staff data source not found.' });
    }
    
    const workbook = XLSX.readFile(filePath);
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
          phoneNumber: userRecord.Phone,
          institute: userRecord.Institute,
          department: userRecord.Department,
          designation: userRecord.Designation,
          misId: userRecord['MIS ID'],
          scopusId: userRecord.Scopus_ID,
          googleScholarId: userRecord.Google_Scholar_ID,
        },
      });
    } else {
      return NextResponse.json({ success: false, error: 'User not found in staff data.' });
    }
  } catch (error: any) {
    console.error('Error reading staff data file:', error);
    return NextResponse.json({ success: false, error: 'Failed to process staff data.' }, { status: 500 });
  }
}
