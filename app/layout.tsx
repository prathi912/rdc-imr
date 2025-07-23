import type React from "react"
import type { Metadata } from "next"
import { Inter, Source_Code_Pro } from "next/font/google"
import "@/src/app/globals.css"
import { ThemeProvider } from "@/src/components/providers/theme-provider"
import { Toaster } from "@/src/components/ui/toaster"
import { isFirebaseInitialized } from "@/src/lib/config"
import { FirebaseNotConfigured } from "@/src/components/firebase-not-configured"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const sourceCodePro = Source_Code_Pro({ subsets: ["latin"], variable: "--font-source-code-pro" })

export const metadata: Metadata = {
  title: "PU Research Portal",
  description: "IMR Research Project Submission Portal for Parul University",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // If Firebase isn't configured, show a helpful message instead of crashing.
  if (!isFirebaseInitialized) {
    return (
      <html lang="en" suppressHydrationWarning>
        <body className={`${inter.variable} ${sourceCodePro.variable} font-sans`} suppressHydrationWarning>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <FirebaseNotConfigured />
          </ThemeProvider>
        </body>
      </html>
    )
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${sourceCodePro.variable} font-sans`} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
