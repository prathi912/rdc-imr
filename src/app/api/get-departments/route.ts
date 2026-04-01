
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
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

    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<StaffData>(worksheet);

    const departments = jsonData
      .map(row => row.Department)
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
