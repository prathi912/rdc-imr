
import type { Metadata } from 'next';
import { Inter, Source_Code_Pro } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { isFirebaseInitialized } from '@/lib/config';
import { FirebaseNotConfigured } from '@/components/firebase-not-configured';
import { AuthInitializer } from '@/components/AuthInitializer';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const sourceCodePro = Source_Code_Pro({ subsets: ['latin'], variable: '--font-source-code-pro' });

export const metadata: Metadata = {
  title: 'PU Research Projects Portal',
  description: 'Research Project Portal for Parul University',
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
      </body>
    </html>
  );
}
