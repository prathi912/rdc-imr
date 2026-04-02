
import { NextResponse } from 'next/server';
import { readExcelFromFile } from '@/lib/excel-utils';
import fs from 'fs';
import path from 'path';

interface StaffData {
  Department?: string;
}

export async function GET() {
  const filePath = path.join(process.cwd(), 'goastaffdata.xlsx');

  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`Goa staff data file not found at: ${filePath}. Cannot fetch departments.`);
      return NextResponse.json({ success: false, error: 'Goa department data source not found on the server.' }, { status: 404 });
    }

    const departmentsData = await readExcelFromFile<StaffData>(filePath);
    
    const departments = departmentsData
      .map((row: StaffData) => row.Department)
      .filter((dept): dept is string => !!dept && typeof dept === 'string' && dept.trim() !== '');

    const uniqueDepartments = [...new Set(departments)].sort();

    return NextResponse.json({ success: true, data: uniqueDepartments });

  } catch (error: any) {
    console.error('Error fetching or processing Goa staff data file for departments:', error);
    return NextResponse.json({ success: false, error: 'Failed to process Goa department data.' }, { status: 500 });
  }
}
