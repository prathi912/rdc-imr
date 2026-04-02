import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    // Read staffdata.xlsx from the project root
    const filePath = path.resolve(process.cwd(), 'staffdata.xlsx');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, error: 'staffdata.xlsx not found' }, { status: 500 });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      return NextResponse.json({ success: false, error: 'Worksheet not found' }, { status: 500 });
    }

    const jsonData: any[] = [];
    const headerRow = worksheet.getRow(1);
    const headers = headerRow.values as any[];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const rowData: any = {};
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber];
        if (header) {
          rowData[header] = cell.value;
        }
      });
      jsonData.push(rowData);
    });

    // Find staff by email (case-insensitive)
    const staff = jsonData.find((row) => {
      return row['Email'] && row['Email'].toLowerCase() === email.toLowerCase();
    });

    if (staff && staff['Name']) {
      return NextResponse.json({ success: true, name: staff['Name'] });
    } else {
      return NextResponse.json({ success: true, name: null });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
