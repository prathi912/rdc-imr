import { NextRequest, NextResponse } from 'next/server';
import { generateChartImage } from '@/app/actions';

export async function POST(request: NextRequest) {
  try {
    const { html } = await request.json();
    if (!html) {
      return NextResponse.json({ success: false, error: 'HTML content is required.' }, { status: 400 });
    }

    const result = await generateChartImage(html);

    if (result.success) {
      return NextResponse.json({ success: true, dataUrl: result.dataUrl });
    } else {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
  } catch (error: any) {
    console.error('API Error in /api/export-chart:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
