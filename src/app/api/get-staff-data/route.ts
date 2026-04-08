
import { NextRequest, NextResponse } from 'next/server';
import { readExcelFromUrl } from '@/lib/excel-utils';
import { logEvent } from '@/lib/logger';

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

const GOA_STAFF_DATA_URL = 'https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/goastaffdata.xlsx';
const VADODARA_STAFF_DATA_URL = 'https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/staffdatabrc.xlsx';

const readStaffDataFromUrl = async (url: string): Promise<StaffData[]> => {
  return readExcelFromUrl<StaffData>(url);
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
  const start = performance.now();
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  const misId = searchParams.get('misId');
  const userEmailForFileCheck = searchParams.get('userEmailForFileCheck');
  const fetchAll = searchParams.get('fetchAll');

  if (!email && !misId) {
    await logEvent('APPLICATION', 'API Request failed: Missing params', {
      metadata: { endpoint: '/api/get-staff-data', method: 'GET', statusCode: 400, latency_ms: performance.now() - start },
      status: 'warning'
    });
    return NextResponse.json({ success: false, error: 'Email or MIS ID query parameter is required.' }, { status: 400 });
  }

  const allFoundRecords: StaffData[] = [];
  const foundEmails = new Set<string>();

  const searchAndAdd = (data: StaffData[], defaultCampus: 'Vadodara' | 'Goa') => {
    let foundRecord: StaffData | undefined;
    if (email) {
      foundRecord = data.find(row => row.Email && row.Email.toLowerCase() === email.toLowerCase());
    } else if (misId) {
      foundRecord = data.find(row => row['MIS ID'] && String(row['MIS ID']).toLowerCase() === misId.toLowerCase());
    }

    if (foundRecord) {
      const uniqueKey = foundRecord.Email ? foundRecord.Email.toLowerCase() : String(foundRecord['MIS ID']).toLowerCase();
      if (!foundEmails.has(uniqueKey)) {
        allFoundRecords.push(formatUserRecord(foundRecord, defaultCampus) as any);
        foundEmails.add(uniqueKey);
      }
    }
  };

  const searchAndAddAll = (data: StaffData[], defaultCampus: 'Vadodara' | 'Goa') => {
    data.forEach(row => {
      if (row['MIS ID'] && String(row['MIS ID']).toLowerCase() === misId?.toLowerCase()) {
        const uniqueKey = row.Email ? row.Email.toLowerCase() : String(row['MIS ID']).toLowerCase();
        if (!foundEmails.has(uniqueKey)) {
          allFoundRecords.push(formatUserRecord(row, defaultCampus) as any);
          foundEmails.add(uniqueKey);
        }
      }
    });
  };

  const [staffdata, goastaffdata] = await Promise.all([
    readStaffDataFromUrl(VADODARA_STAFF_DATA_URL),
    readStaffDataFromUrl(GOA_STAFF_DATA_URL)
  ]);

  if (fetchAll) {
    searchAndAddAll(staffdata, 'Vadodara');
    searchAndAddAll(goastaffdata, 'Goa');
  } else if (email) {
    const isGoaEmail = email.toLowerCase().endsWith('@goa.paruluniversity.ac.in');
    searchAndAdd(isGoaEmail ? goastaffdata : staffdata, isGoaEmail ? 'Goa' : 'Vadodara');
  } else if (misId) {
    if (userEmailForFileCheck) {
      const isGoaContext = userEmailForFileCheck.toLowerCase().endsWith('@goa.paruluniversity.ac.in');
      searchAndAdd(isGoaContext ? goastaffdata : staffdata, isGoaContext ? 'Goa' : 'Vadodara');
    } else {
      searchAndAdd(staffdata, 'Vadodara');
      searchAndAdd(goastaffdata, 'Goa');
    }
  }

  const latency_ms = performance.now() - start;

  if (allFoundRecords.length > 0) {
    await logEvent('APPLICATION', 'API Request successful', {
      metadata: { endpoint: '/api/get-staff-data', method: 'GET', statusCode: 200, latency_ms, email, misId },
      status: 'info'
    });
    return NextResponse.json({ success: true, data: allFoundRecords });
  } else {
    await logEvent('APPLICATION', 'API Request: User not found', {
      metadata: { endpoint: '/api/get-staff-data', method: 'GET', statusCode: 200, latency_ms, email, misId },
      status: 'info'
    });
    return NextResponse.json({ success: true, data: [], message: `User not found in the staff data file.` });
  }
}
