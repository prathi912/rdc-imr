import { NextResponse } from 'next/server';
import { readExcelFromUrl } from '@/lib/excel-utils';
import { logEvent } from '@/lib/logger';

interface StaffData {
  Department?: string;
}

const VADODARA_STAFF_DATA_URL = 'https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/staffdatabrc.xlsx';

export async function GET() {
  const start = performance.now();

  try {
    const jsonData = await readExcelFromUrl<StaffData>(VADODARA_STAFF_DATA_URL);

    if (!jsonData || jsonData.length === 0) {
      console.warn(`No staff data found at: ${VADODARA_STAFF_DATA_URL}. Cannot fetch departments.`);
      await logEvent('APPLICATION', 'API Request failed: Data empty', {
        metadata: { endpoint: '/api/get-departments', method: 'GET', statusCode: 404, latency_ms: performance.now() - start },
        status: 'warning'
      });
      return NextResponse.json({ success: false, error: 'Department data source is empty or unavailable.' }, { status: 404 });
    }

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
    console.error('Error fetching or processing staff data URL for departments:', error);
    await logEvent('APPLICATION', 'API Request failed: Internal error', {
      metadata: { endpoint: '/api/get-departments', method: 'GET', statusCode: 500, error: error.message, latency_ms: performance.now() - start },
      status: 'error'
    });
    return NextResponse.json({ success: false, error: 'Failed to process department data.' }, { status: 500 });
  }
}
