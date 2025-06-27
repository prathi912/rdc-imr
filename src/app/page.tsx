import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import Image from 'next/image';
import { Award, BookCheck, GanttChartSquare } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="container mx-auto px-4 lg:px-6 h-20 flex items-center justify-between">
        <Logo />
        <nav className="flex gap-4 sm:gap-6">
          <Link href="/login">
            <Button variant="ghost">Sign In</Button>
          </Link>
          <Link href="/signup">
            <Button>Sign Up</Button>
          </Link>
        </nav>
      </header>
      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48">
          <div className="container px-4 md:px-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_400px] lg:gap-12 xl:grid-cols-[1fr_600px]">
              <div className="flex flex-col justify-center space-y-4 animate-in fade-in slide-in-from-left-8 duration-700">
                <div className="space-y-2">
                  <h1 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none">
                    Parul University Research Portal
                  </h1>
                  <p className="max-w-[600px] text-muted-foreground md:text-xl">
                    Streamlining Intramural Research Funding from Submission to Completion.
                  </p>
                </div>
                <div className="flex flex-col gap-2 min-[400px]:flex-row">
                  <Link href="/signup">
                    <Button size="lg">Get Started</Button>
                  </Link>
                  <Link href="/login">
                    <Button variant="outline" size="lg">
                      Sign In
                    </Button>
                  </Link>
                </div>
              </div>
              <Image
                src="https://www.pierc.org/_next/image?url=%2F_next%2Fstatic%2Fmedia%2FmainBgImage.05039c52.png&w=1920&q=75"
                width="600"
                height="400"
                alt="Hero"
                className="mx-auto aspect-video overflow-hidden rounded-xl object-cover sm:w-full lg:order-last animate-in fade-in slide-in-from-right-8 duration-700"
              />
            </div>
          </div>
        </section>
        <section id="features" className="w-full py-12 md:py-24 lg:py-32 bg-muted">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <div className="inline-block rounded-lg bg-secondary px-3 py-1 text-sm">Key Features</div>
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">A Better Way to Manage Research</h2>
                <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  Our portal provides a centralized platform for managing the entire lifecycle of intramural research projects.
                </p>
              </div>
            </div>
            <div className="mx-auto grid max-w-5xl items-center gap-6 py-12 lg:grid-cols-3 lg:gap-12">
              <div className="grid gap-1 text-center animate-in fade-in-0 slide-in-from-bottom-8 duration-700" style={{ animationDelay: '100ms' }}>
                <div className="flex justify-center items-center mb-4">
                    <div className="p-4 rounded-full bg-primary/10 text-primary">
                        <BookCheck className="h-8 w-8" />
                    </div>
                </div>
                <h3 className="text-xl font-bold">Seamless Submissions</h3>
                <p className="text-muted-foreground">
                  A guided, multi-step form ensures all necessary project information is captured accurately.
                </p>
              </div>
              <div className="grid gap-1 text-center animate-in fade-in-0 slide-in-from-bottom-8 duration-700" style={{ animationDelay: '200ms' }}>
                <div className="flex justify-center items-center mb-4">
                    <div className="p-4 rounded-full bg-primary/10 text-primary">
                        <GanttChartSquare className="h-8 w-8" />
                    </div>
                </div>
                <h3 className="text-xl font-bold">Transparent Evaluation</h3>
                <p className="text-muted-foreground">
                  A dedicated dashboard for evaluators with AI-powered prompts to ensure fair and consistent reviews.
                </p>
              </div>
              <div className="grid gap-1 text-center animate-in fade-in-0 slide-in-from-bottom-8 duration-700" style={{ animationDelay: '300ms' }}>
                <div className="flex justify-center items-center mb-4">
                    <div className="p-4 rounded-full bg-primary/10 text-primary">
                        <Award className="h-8 w-8" />
                    </div>
                </div>
                <h3 className="text-xl font-bold">Efficient Grant Management</h3>
                <p className="text-muted-foreground">
                  Track grant disbursement and fund utilization from a single, unified interface.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} Parul University. All rights reserved.</p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link className="text-xs hover:underline underline-offset-4" href="#">
            Terms of Service
          </Link>
          <Link className="text-xs hover:underline underline-offset-4" href="#">
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  );
}
