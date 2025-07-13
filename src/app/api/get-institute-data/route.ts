
'use server';

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

// Define the expected structure of a row in the Excel sheet
interface InstituteData {
  Email?: string;
  Name?: string;
  Faculty?: string;
  Institute?: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');

  if (!email) {
    return NextResponse.json({ success: false, error: 'Email query parameter is required.' }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), 'institutes.xlsx');

  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`Institute data file not found at: ${filePath}. Pre-fill feature for institutes will be inactive.`);
      return NextResponse.json({ success: false, error: 'Institute data source not found on the server.' }, { status: 404 });
    }

    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<InstituteData>(worksheet);

    const instituteRecord = jsonData.find(row => row.Email && row.Email.toLowerCase() === email.toLowerCase());

    if (instituteRecord) {
      return NextResponse.json({
        success: true,
        data: {
          name: instituteRecord.Name,
          faculty: instituteRecord.Faculty,
          institute: instituteRecord.Institute,
        },
      });
    } else {
      return NextResponse.json({ success: false, error: 'Institute not found in data source.' });
    }
  } catch (error: any) {
    console.error('Error fetching or processing institute data file:', error);
    return NextResponse.json({ success: false, error: 'Failed to process institute data.' }, { status: 500 });
  }
}
