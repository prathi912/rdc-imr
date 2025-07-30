
import { NextRequest, NextResponse } from 'next/server';
import nodeHtmlToImage from 'node-html-to-image';

export async function POST(request: NextRequest) {
  try {
    const { html, isDarkMode } = await request.json();
    if (!html) {
      return NextResponse.json({ success: false, error: 'HTML content is required.' }, { status: 400 });
    }
    
    // Define theme-based styles. The client will tell us which theme is active.
    const lightThemeCss = `
        :root {
          --background: 210 29% 96%;
          --foreground: 224 71% 4%;
          --card: 0 0% 100%;
          --card-foreground: 224 71% 4%;
          --popover: 0 0% 100%;
          --popover-foreground: 224 71% 4%;
          --primary: 211 79% 57%;
          --primary-foreground: 0 0% 100%;
          --secondary: 210 40% 96.1%;
          --secondary-foreground: 222.2 47.4% 11.2%;
          --muted: 210 40% 96.1%;
          --muted-foreground: 215.4 16.3% 46.9%;
          --accent: 174 62% 37%;
          --accent-foreground: 0 0% 100%;
          --destructive: 0 84.2% 60.2%;
          --destructive-foreground: 210 40% 98%;
          --border: 214.3 31.8% 91.4%;
          --input: 214.3 31.8% 91.4%;
          --ring: 211 79% 57%;
          --radius: 0.5rem;
        }
    `;

    const darkThemeCss = `
        .dark {
            --background: 224 71% 4%;
            --foreground: 210 40% 98%;
            --card: 224 71% 4% / 0.1;
            --card-foreground: 210 40% 98%;
            --popover: 224 71% 4% / 0.1;
            --popover-foreground: 210 40% 98%;
            --primary: 211 79% 57%;
            --primary-foreground: 0 0% 100%;
            --secondary: 217.2 32.6% 17.5% / 0.5;
            --secondary-foreground: 210 40% 98%;
            --muted: 217.2 32.6% 17.5% / 0.5;
            --muted-foreground: 215 20.2% 65.1%;
            --accent: 174 58% 45% / 0.5;
            --accent-foreground: 0 0% 100%;
            --destructive: 0 62.8% 30.6%;
            --destructive-foreground: 210 40% 98%;
            --border: 217 33% 25% / 0.4;
            --input: 217 33% 25% / 0.4;
            --ring: 211 79% 57%;
        }
    `;
    
    const styledHtml = `
      <html>
        <head>
          <style>
            body {
              font-family: sans-serif;
              width: 800px;
              height: 450px;
              background-color: hsl(${isDarkMode ? 'var(--background)' : 'var(--card)'});
            }
            ${lightThemeCss}
            ${isDarkMode ? darkThemeCss : ''}
          </style>
        </head>
        <body class="${isDarkMode ? 'dark' : ''}">
          ${html}
        </body>
      </html>
    `;

    const image = await nodeHtmlToImage({
      html: styledHtml,
      quality: 100,
      type: 'png',
      puppeteerArgs: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
      encoding: 'base64'
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
