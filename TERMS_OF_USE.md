'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import Image from 'next/image';
import { Award, BookCheck, GanttChartSquare, Check, Users, ShieldCheck, FilePlus, Bot } from 'lucide-react';
import { auth } from '@/lib/config';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { Skeleton } from '@/components/ui/skeleton';

export default function LandingPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-background dark:bg-transparent">
      <header className="container mx-auto px-4 lg:px-6 h-20 flex items-center justify-between sticky top-0 z-50 bg-background/80 backdrop-blur-lg">
        <Logo />
        <nav className="flex gap-4 sm:gap-6">
          {loading ? (
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-24" />
            </div>
          ) : user ? (
            <Link href="/dashboard">
              <Button>Go to Dashboard</Button>
            </Link>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link href="/signup">
                <Button>Sign Up</Button>
              </Link>
            </>
          )}
        </nav>
      </header>
      <main className="flex-1">
        {/* Hero Section */}
        <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48">
          <div className="container px-4 md:px-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_400px] lg:gap-12 xl:grid-cols-[1fr_600px]">
              <div className="flex flex-col justify-center space-y-4 animate-in fade-in slide-in-from-left-8 duration-700">
                <div className="space-y-2">
                   <div className="inline-block rounded-lg bg-secondary px-3 py-1 text-sm font-medium text-primary">
                    Research & Development Cell
                  </div>
                  <h1 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none">
                    Empowering Research & Recognizing Achievement
                  </h1>
                  <p className="max-w-[600px] text-muted-foreground md:text-xl">
                    Our comprehensive portal streamlines the entire research lifecycle. From IMR proposal submissions and AI-assisted evaluations to simplified claims for publication incentives, we provide the tools to foster innovation at Parul University.
                  </p>
                </div>
                <div className="flex flex-col gap-2 min-[400px]:flex-row">
                  {loading ? (
                    <div className="flex flex-col gap-2 min-[400px]:flex-row">
                        <Skeleton className="h-12 w-32" />
                        <Skeleton className="h-12 w-32" />
                    </div>
                  ) : user ? (
                    <Link href="/dashboard">
                      <Button size="lg">Go to Dashboard</Button>
                    </Link>
                  ) : (
                    <>
                      <Link href="/signup">
                        <Button size="lg">Get Started</Button>
                      </Link>
                      <Link href="/login">
                        <Button variant="outline" size="lg">
                          Sign In
                        </Button>
                      </Link>
                    </>
                  )}
                </div>
              </div>
              <Image
                src="https://www.pierc.org/_next/image?url=%2F_next%2Fstatic%2Fmedia%2FmainBgImage.05039c52.png&w=1920&q=75"
                width={600}
                height={400}
                alt="Hero"
                className="mx-auto aspect-video overflow-hidden rounded-xl object-cover sm:w-full lg:order-last animate-in fade-in slide-in-from-right-8 duration-700"
              />
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="w-full py-12 md:py-24 lg:py-32 bg-muted">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">A Unified Platform for Your Research Journey</h2>
                <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  One portal to manage everything from initial project funding to celebrating your publication success.
                </p>
              </div>
            </div>
            <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 py-12 sm:grid-cols-2 lg:grid-cols-2">
              <div className="flex flex-col items-center text-center p-6 rounded-lg bg-card shadow-sm">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <GanttChartSquare className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold">IMR Project Funding</h3>
                <p className="text-muted-foreground mt-2">A guided workflow for submitting intramural research proposals, tracking their evaluation status, and managing awarded grants efficiently.</p>
              </div>
              <div className="flex flex-col items-center text-center p-6 rounded-lg bg-card shadow-sm">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Award className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold">Incentive Claims</h3>
                <p className="text-muted-foreground mt-2">Easily apply for incentives for your published research papers, patents, books, and conference presentations through dedicated, easy-to-use forms.</p>
              </div>
            </div>
          </div>
        </section>


        {/* Built for you section */}
        <section id="roles" className="w-full py-12 md:py-24">
             <div className="container px-4 md:px-6">
                 <div className="flex flex-col items-center justify-center space-y-4 text-center">
                    <div className="space-y-2">
                        <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">Tools Tailored for Your Role</h2>
                        <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                            A dedicated experience for every user involved in the research lifecycle.
                        </p>
                    </div>
                </div>
                 <div className="mx-auto grid max-w-5xl items-start gap-8 py-12 sm:grid-cols-1 md:grid-cols-3">
                     <div className="grid gap-4">
                        <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                               <Users className="h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-bold">For Faculty</h3>
                        </div>
                        <p className="text-muted-foreground">Submit, track, and manage your research projects and incentive claims from a personalized dashboard.</p>
                        <ul className="grid gap-2 text-sm">
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Simplified Proposal Submission</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Streamlined Incentive Claims</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Real-time Status Tracking</li>
                        </ul>
                    </div>
                    <div className="grid gap-4">
                        <div className="flex items-center gap-4">
                           <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                               <BookCheck className="h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-bold">For Evaluators</h3>
                        </div>
                        <p className="text-muted-foreground">Access your queue of projects, review submissions, and provide structured feedback with AI-assisted tools.</p>
                         <ul className="grid gap-2 text-sm">
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Dedicated Evaluation Queue</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> AI-Generated Evaluation Prompts</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Fair and Consistent Scoring</li>
                        </ul>
                    </div>
                    <div className="grid gap-4">
                         <div className="flex items-center gap-4">
                           <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                               <ShieldCheck className="h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-bold">For Admins</h3>
                        </div>
                        <p className="text-muted-foreground">Oversee the entire process with powerful dashboards, user management tools, and comprehensive analytics.</p>
                         <ul className="grid gap-2 text-sm">
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Centralized Project Oversight</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Incentive Claim Management</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Data Analytics & Reporting</li>
                        </ul>
                    </div>
                 </div>
             </div>
        </section>

        {/* CTA Section */}
        <section className="w-full py-12 md:py-24 lg:py-32 bg-muted">
            <div className="container grid items-center justify-center gap-4 px-4 text-center md:px-6">
                <div className="space-y-3">
                    <h2 className="text-3xl font-bold tracking-tighter md:text-4xl/tight">
                        Ready to Transform Your Research Process?
                    </h2>
                    <p className="mx-auto max-w-[600px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                        Create an account today and join the future of research management at Parul University.
                    </p>
                </div>
                <div className="mx-auto w-full max-w-sm space-x-2">
                     <Link href="/signup">
                        <Button size="lg">Sign Up Now</Button>
                    </Link>
                </div>
            </div>
        </section>

      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} Parul University. All rights reserved.</p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link className="text-xs hover:underline underline-offset-4" href="/TERMS_OF_USE.md" target="_blank">
            Terms of Service
          </Link>
          <Link className="text-xs hover:underline underline-offset-4" href="/PRIVACY_POLICY.md" target="_blank">
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  );
}