
import { NextRequest, NextResponse } from 'next/server';
import nodeHtmlToImage from 'node-html-to-image';

export async function POST(request: NextRequest) {
  try {
    const { html, isDarkMode } = await request.json();
    if (!html) {
      return NextResponse.json({ success: false, error: 'HTML content is required.' }, { status: 400 });
    }
    
    const bgColor = isDarkMode ? '#0f172a' : '#ffffff';
    
    const image = await nodeHtmlToImage({
      html: `<html><head><style>body { background-color: ${bgColor}; padding: 20px; }</style></head><body>${html}</body></html>`,
      quality: 100,
      type: 'png',
      puppeteerArgs: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
      encoding: 'base64',
      transparent: false,
    });

    const dataUrl = `data:image/png;base64,${image}`;
    
    return NextResponse.json({ success: true, dataUrl });

  } catch (error: any) {
    console.error('API Error in /api/export-chart:', error);
    let errorMessage = 'An internal server error occurred during image generation.';
    if (error.message && error.message.includes('Could not find Chromium')) {
        errorMessage = 'Image generation failed: The server is missing a required dependency (Chromium). This may occur in some development environments.';
    } else if (error.message) {
        errorMessage = error.message;
    }
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
