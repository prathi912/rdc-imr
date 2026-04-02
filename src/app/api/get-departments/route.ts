
import { NextResponse } from 'next/server';
import { readExcelFromFile } from '@/lib/excel-utils';
import fs from 'fs';
import path from 'path';
import { logEvent } from '@/lib/logger';

interface StaffData {
  Department?: string;
}

export async function GET() {
  const start = performance.now();
  const filePath = path.join(process.cwd(), 'staffdata.xlsx');

  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`Staff data file not found at: ${filePath}. Cannot fetch departments.`);
      await logEvent('APPLICATION', 'API Request failed: File not found', {
        metadata: { endpoint: '/api/get-departments', method: 'GET', statusCode: 404, latency_ms: performance.now() - start },
        status: 'warning'
      });
      return NextResponse.json({ success: false, error: 'Department data source not found on the server.' }, { status: 404 });
    }

    const jsonData = await readExcelFromFile<StaffData>(filePath);

    const departments = jsonData
      .map((row: StaffData) => row.Department)
      .filter((dept): dept is string => !!dept && typeof dept === 'string' && dept.trim() !== '');

    const uniqueDepartments = [...new Set(departments)].sort();

    await logEvent('APPLICATION', 'API Request successful', {
      metadata: { endpoint: '/api/get-departments', method: 'GET', statusCode: 200, latency_ms: performance.now() - start },
      status: 'info'
    });
    return NextResponse.json({ success: true, data: uniqueDepartments });

  } catch (error: any) {
    console.error('Error fetching or processing staff data file for departments:', error);
    await logEvent('APPLICATION', 'API Request failed: Internal error', {
      metadata: { endpoint: '/api/get-departments', method: 'GET', statusCode: 500, error: error.message, latency_ms: performance.now() - start },
      status: 'error'
    });
    return NextResponse.json({ success: false, error: 'Failed to process department data.' }, { status: 500 });
  }
}
