
import type { Metadata } from 'next';
import { Inter, Source_Code_Pro } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { isFirebaseInitialized } from '@/lib/config';
import { FirebaseNotConfigured } from '@/components/firebase-not-configured';
import { AuthInitializer } from '@/components/AuthInitializer';
import { Analytics } from '@vercel/analytics/react';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const sourceCodePro = Source_Code_Pro({ subsets: ['latin'], variable: '--font-source-code-pro' });

export const metadata: Metadata = {
  title: 'R&D Portal | Parul University | Vadodara, Gujarat',
  description: 'The official Research & Development (R&D) Portal of Parul University, Vadodara. Streamline Intramural (IMR) and Extramural (EMR) research projects, manage grants, and foster academic innovation.',
  keywords: ['Parul University', 'Research Portal', 'R&D', 'IMR', 'EMR', 'Intramural Research', 'Extramural Research', 'Vadodara', 'Gujarat', 'University Grants'],
  openGraph: {
    title: 'R&D Portal | Parul University',
    description: 'A comprehensive portal to manage the entire research lifecycle at Parul University.',
    url: 'https://rndprojects.paruluniversity.ac.in',
    siteName: 'Parul University Research & Development Portal',
    images: [
      {
        url: 'https://www.paruluniversity.ac.in/images/header-logo.png',
        width: 800,
        height: 600,
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'R&D Portal | Parul University',
    description: 'A comprehensive portal to manage the entire research lifecycle at Parul University.',
    images: ['https://www.paruluniversity.ac.in/images/header-logo.png'],
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "CollegeOrUniversity",
  "name": "Parul University",
  "url": "https://www.paruluniversity.ac.in/",
  "logo": "https://www.paruluniversity.ac.in/images/header-logo.png",
  "sameAs": [
    "https://www.facebook.com/paruluniversity",
    "https://twitter.com/paruluniversity",
    "https://www.instagram.com/paruluniversity/",
    "https://www.linkedin.com/school/parul-university/"
  ],
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "P.O. Limda, Waghodia",
    "addressLocality": "Vadodara",
    "addressRegion": "Gujarat",
    "postalCode": "391760",
    "addressCountry": "IN"
  },
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+91-2668-260300",
    "contactType": "customer service",
    "email": "helpdesk.rdc@paruluniversity.ac.in"
  }
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // If Firebase isn't configured, show a helpful message instead of crashing.
  if (!isFirebaseInitialized) {
    return (
      <html lang="en" suppressHydrationWarning>
        <body className={`${inter.variable} ${sourceCodePro.variable} font-sans`} suppressHydrationWarning>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <FirebaseNotConfigured />
          </ThemeProvider>
        </body>
      </html>
    );
  }

  return (
    <html lang="en" suppressHydrationWarning>
       <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className={`${inter.variable} ${sourceCodePro.variable} font-sans`} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AuthInitializer>
            {children}
          </AuthInitializer>
          <Toaster />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
