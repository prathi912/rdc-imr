import { NextResponse } from 'next/server';
import { readExcelFromUrl } from '@/lib/excel-utils';
import { logEvent } from '@/lib/logger';

interface StaffData {
  Department?: string;
}

const GOA_STAFF_DATA_URL = 'https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/goastaffdata.xlsx';

export async function GET() {
  const start = performance.now();

  try {
    const departmentsData = await readExcelFromUrl<StaffData>(GOA_STAFF_DATA_URL);
    
    if (!departmentsData || departmentsData.length === 0) {
      console.warn(`No Goa staff data found at: ${GOA_STAFF_DATA_URL}. Cannot fetch departments.`);
      return NextResponse.json({ success: false, error: 'Goa department data source is empty or unavailable.' }, { status: 404 });
    }

    const departments = departmentsData
      .map((row: StaffData) => row.Department)
      .filter((dept): dept is string => !!dept && typeof dept === 'string' && dept.trim() !== '');

    const uniqueDepartments = [...new Set(departments)].sort();

    await logEvent('APPLICATION', 'API Request successful', {
      metadata: { endpoint: '/api/get-goa-departments', method: 'GET', statusCode: 200, latency_ms: performance.now() - start },
      status: 'info'
    });

    return NextResponse.json({ success: true, data: uniqueDepartments });

  } catch (error: any) {
    console.error('Error fetching or processing Goa staff data URL for departments:', error);
    await logEvent('APPLICATION', 'API Request failed: Internal error', {
      metadata: { endpoint: '/api/get-goa-departments', method: 'GET', statusCode: 500, error: error.message, latency_ms: performance.now() - start },
      status: 'error'
    });
    return NextResponse.json({ success: false, error: 'Failed to process Goa department data.' }, { status: 500 });
  }
}
