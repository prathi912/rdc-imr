'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import Image from 'next/image';
import {
  BookCheck,
  GanttChartSquare,
  Check,
  Users,
  ShieldCheck,
  Bot,
  User,
  Library,
  ArrowRight,
  TrendingUp,
  Award,
  Target,
  FileText,
  MousePointer2,
  Cpu,
  GraduationCap,
  Sparkles,
  Quote,
  Star,
  Globe,
  PlusCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  Download,
  HeartPulse,
  Settings,
  Zap,
  FlaskConical,
  Building2,
  Milestone
} from 'lucide-react';
import { auth } from '@/lib/config';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { getPublicFundingCalls } from '@/app/emr-actions';
import type { FundingCall } from '@/types';
import { format, isAfter, parseISO } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function LandingPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [fundingCalls, setFundingCalls] = useState<FundingCall[]>([]);
  const [callsLoading, setCallsLoading] = useState(true);
  const [showAllPast, setShowAllPast] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    const fetchCalls = async () => {
      try {
        const calls = await getPublicFundingCalls();
        setFundingCalls(calls);
      } catch (error) {
        console.error("Failed to fetch funding calls:", error);
      } finally {
        setCallsLoading(false);
      }
    };

    fetchCalls();
    return () => unsubscribe();
  }, []);

  const excellenceStats = [
    { label: 'Patents Filed', value: '425', icon: Target, description: 'Innovation Pipeline' },
    { label: 'Copyrights Filed', value: '47', icon: ShieldCheck, description: 'Creative Protection' },
    { label: 'Copyrights Granted', value: '15', icon: Check, description: 'Secured Rights' },
    { label: 'Patents Published', value: '355', icon: Globe, description: 'Public Knowledge' },
    { label: 'EMR research Grants', value: '17.39', unit: 'Cr', icon: TrendingUp, description: 'Total Funding' },
    { label: 'Research Papers', value: '4,353', icon: FileText, description: 'Scientific Publications' },
    { label: 'Patents Granted', value: '27', icon: Award, description: 'Awarded Innovation' },
    { label: 'Research Excellence', value: 'Excellence', icon: Sparkles, description: 'Leading the Future' },
  ];

  const currentCalls = useMemo(() =>
    fundingCalls.filter(call => !isAfter(new Date(), parseISO(call.interestDeadline))),
    [fundingCalls]);

  const pastCalls = useMemo(() =>
    fundingCalls.filter(call => isAfter(new Date(), parseISO(call.interestDeadline))),
    [fundingCalls]);

  const displayedPastCalls = useMemo(() =>
    showAllPast ? pastCalls : pastCalls.slice(0, 10),
    [pastCalls, showAllPast]);

  const getApplyRoute = (callId: string) => {
    if (user) return `/dashboard/emr-calendar`;
    return `/login`;
  };

  return (
    <div className="flex flex-col min-h-screen bg-background selection:bg-primary/30 font-sans">
      {/* Background Mesh Gradient */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-5%] left-[-5%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[5%] right-[-5%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[100px]" />
      </div>

      <header className="sticky top-0 z-50 w-full border-b bg-background/70 backdrop-blur-xl transition-all duration-300">
        <div className="container mx-auto px-4 lg:px-8 h-20 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-4 sm:gap-10">
            {loading ? (
              <div className="flex items-center gap-4">
                <Skeleton className="h-10 w-24 rounded-md" />
                <Skeleton className="h-10 w-24 rounded-md" />
              </div>
            ) : user ? (
              <Link href="/dashboard">
                <Button className="rounded-md px-6 font-bold shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95 bg-primary hover:bg-primary/90">
                  Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/login" className="hidden lg:block">
                  <Button variant="ghost" className="rounded-md px-6 font-bold text-muted-foreground hover:text-foreground">
                    Faculty Login
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button className="rounded-md px-6 font-bold shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95 bg-primary hover:bg-primary/90">
                    Get Access
                  </Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Official Hero Section */}
        <section className="relative w-full pt-16 pb-12 md:pt-24 md:pb-20 lg:pt-32 lg:pb-24 overflow-hidden">
          <div className="container px-4 md:px-8 relative z-10">
            <div className="grid gap-16 lg:grid-cols-2 items-start">
              <div className="flex flex-col justify-center space-y-10 animate-in fade-in slide-in-from-bottom-12 duration-1000 ease-out">
                <div className="space-y-6">
                  <div className="inline-flex items-center gap-3 rounded-md border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-bold text-primary backdrop-blur-md">
                    <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                    Parul University Research Ecosystem
                  </div>
                  <h1 className="text-4xl font-black tracking-tight sm:text-6xl xl:text-7xl/none leading-tight text-foreground">
                    Join the Future of University <span className="text-primary italic">Research</span>.
                  </h1>
                  <p className="max-w-[600px] text-muted-foreground md:text-xl font-medium leading-relaxed">
                    Research becomes an essential component for human development. RDC acts as a bridge between scientific issues faced by humanity and practical solutions.
                  </p>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row">
                  {loading ? (
                    <div className="flex gap-4">
                      <Skeleton className="h-14 w-40 rounded-md" />
                      <Skeleton className="h-14 w-40 rounded-md" />
                    </div>
                  ) : user ? (
                    <Link href="/dashboard">
                      <Button size="lg" className="h-14 rounded-xl px-12 text-lg font-black shadow-2xl shadow-primary/30 transition-all bg-primary hover:bg-primary/90 hover:scale-105">
                        Go to Dashboard <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                    </Link>
                  ) : (
                    <Link href="/signup">
                      <Button size="lg" className="h-14 rounded-xl px-12 text-lg font-black shadow-2xl shadow-primary/30 transition-all bg-primary hover:bg-primary/90 text-white hover:scale-105">
                        Register Now <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                    </Link>
                  )}
                  <Link href="/sop">
                    <Button variant="outline" size="lg" className="h-14 rounded-xl px-10 text-lg font-bold border-2 transition-all hover:bg-secondary">
                      View SOP Documentation
                    </Button>
                  </Link>
                </div>

                <div className="flex items-center gap-6 pt-4 grayscale opacity-70">
                  <div className="flex flex-col">
                    <span className="text-xl font-black">NAAC A++</span>
                    <span className="text-[10px] uppercase font-bold tracking-widest">Highest Grade</span>
                  </div>
                  <div className="w-[1px] h-10 bg-border" />
                  <div className="flex flex-col">
                    <span className="text-xl font-black">NIRF 41</span>
                    <span className="text-[10px] uppercase font-bold tracking-widest">Pharmacy India</span>
                  </div>
                </div>
              </div>

              <div className="relative group hidden md:block lg:ml-auto">
                <div className="absolute -inset-4 bg-primary/20 rounded-[2.5rem] blur-2xl group-hover:bg-primary/30 transition duration-700" />
                <div className="relative bg-background border rounded-[2.5rem] overflow-hidden shadow-2xl">
                  <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent pointer-events-none z-10" />
                  <Image
                    src="https://www.pierc.org/_next/image?url=%2F_next%2Fstatic%2Fmedia%2FmainBgImage.05039c52.png&w=1920&q=75"
                    width={800}
                    height={600}
                    alt="RDC Dashboard"
                    className="object-cover group-hover:scale-105 transition-transform duration-1000"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* About RDC Section */}
        <section className="w-full py-24 bg-primary/[0.02] border-y relative">
          <div className="container px-4 md:px-8">
            <div className="max-w-4xl mx-auto space-y-12">
              <div className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-black uppercase tracking-widest">About RDC</div>
              <div className="space-y-6">
                <h2 className="text-3xl font-black sm:text-5xl tracking-tight leading-tight">Driving Innovation for <span className="text-primary italic">Human Development</span></h2>
                <p className="text-lg md:text-xl text-muted-foreground font-medium leading-relaxed">
                  As evolution continues to take its course on humanity, research becomes an essential component for human development, as a mechanism to regulate changes and provide answers to humanity's greatest issues.
                </p>
                <p className="text-lg md:text-xl text-muted-foreground font-medium leading-relaxed">
                  This is the driving principle behind PU's Research & Development Cell (RDC): <span className="text-foreground font-bold">to act as a bridge between the scientific issues faced by humanity and the practical search for solutions.</span>
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8">
                <div className="p-8 rounded-[2rem] bg-background border hover:border-primary/30 transition-colors shadow-sm">
                  <p className="text-muted-foreground font-medium leading-relaxed">
                    Engaged in various forms of innovative research with academic, social, and industrial impact through the Department of Scientific and Industrial Research (DSIR).
                  </p>
                </div>
                <div className="p-8 rounded-[2rem] bg-background border hover:border-primary/30 transition-colors shadow-sm">
                  <p className="text-muted-foreground font-medium leading-relaxed">
                    Designed with the prime objective of facilitating student research projects and nurturing the next generation of scientific explorers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Target Research Sectors */}
        <section className="w-full py-24 relative overflow-hidden bg-background">
          <div className="container px-4 md:px-8">
            <div className="flex flex-col items-center justify-center space-y-4 text-center mb-16">
              <div className="space-y-4">
                <div className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-black uppercase tracking-widest">Focus Areas</div>
                <h2 className="text-3xl font-black sm:text-5xl tracking-tight">Target <span className="text-primary italic">Research Sectors</span></h2>
                <p className="max-w-[700px] text-muted-foreground md:text-xl font-medium mx-auto">
                  Our RDC ecosystem is strategically aligned with global scientific frontiers and industrial requirements.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
              {[
                { title: 'Material Science', icon: Sparkles, color: 'text-blue-500', bg: 'bg-blue-500/5' },
                { title: 'Pharmaceutical Science', icon: Library, color: 'text-emerald-500', bg: 'bg-emerald-500/5' },
                { title: 'Biomedical and Health Science', icon: HeartPulse, color: 'text-rose-500', bg: 'bg-rose-500/5' },
                { title: 'Engineering', icon: Settings, color: 'text-indigo-500', bg: 'bg-indigo-500/5' },
                { title: 'Semiconductor Technology', icon: Cpu, color: 'text-amber-500', bg: 'bg-amber-500/5' },
                { title: 'Energy', icon: Zap, color: 'text-orange-500', bg: 'bg-orange-500/5' },
              ].map((sector, idx) => (
                <div key={idx} className="group p-8 rounded-[2rem] bg-background border hover:border-primary/30 hover:shadow-xl transition-all duration-500 relative overflow-hidden">
                  <div className={cn("absolute -right-4 -top-4 opacity-10 group-hover:scale-110 transition-transform duration-500 p-8 rounded-full", sector.bg)}>
                    <sector.icon className={cn("h-16 w-16", sector.color)} />
                  </div>
                  <div className="relative z-10 space-y-4">
                    <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center", sector.bg)}>
                      <sector.icon className={cn("h-6 w-6", sector.color)} />
                    </div>
                    <h3 className="text-xl font-black group-hover:text-primary transition-colors">{sector.title}</h3>
                    <div className="h-1 w-8 bg-border group-hover:w-16 group-hover:bg-primary transition-all duration-500" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Extramural Research Portfolio */}
        <section className="w-full py-24 bg-primary/[0.03] relative overflow-hidden border-y">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(59,130,246,0.1),transparent)] pointer-events-none" />
          <div className="container px-4 md:px-8 relative z-10">
            <div className="flex flex-col items-center justify-center space-y-4 text-center mb-20">
              <div className="space-y-4">
                <div className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-[0.2em]">Institutional Credibility</div>
                <h2 className="text-4xl font-black tracking-tight sm:text-6xl">Grants for <span className="text-primary italic underline underline-offset-8 decoration-primary/20">Extramural Research</span></h2>
                <p className="max-w-2xl text-muted-foreground md:text-xl font-medium mx-auto mt-6">
                  Securing over <span className="text-foreground font-bold tracking-tight">₹ 1766 Lakhs</span> in research funding from premier global and national agencies (2016-2025).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl mx-auto">
              {/* Main Stats Panel */}
              <div className="lg:col-span-5 space-y-8">
                <div className="p-10 rounded-[3rem] bg-primary text-white shadow-2xl shadow-primary/20 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:scale-110 transition-transform duration-700">
                    <TrendingUp className="h-40 w-40" />
                  </div>
                  <div className="relative z-10 space-y-10">
                    <div className="space-y-2">
                      <p className="text-white/60 text-xs font-black uppercase tracking-widest">Aggregate Achievement</p>
                      <h3 className="text-5xl font-black">71 <span className="text-2xl font-light opacity-60 italic">Projects</span></h3>
                    </div>
                    <div className="h-[1px] w-full bg-white/20" />
                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-1">
                        <p className="text-white/60 text-[10px] font-black uppercase tracking-widest">Total Funding</p>
                        <p className="text-2xl font-black">₹ 1766 L</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-white/60 text-[10px] font-black uppercase tracking-widest">Active Period</p>
                        <p className="text-2xl font-black">2016-25</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-8 rounded-[2.5rem] bg-secondary/20 border border-dashed border-primary/20 flex items-center gap-6 group hover:bg-secondary/30 transition-all">
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                    <Milestone className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-bold text-muted-foreground leading-relaxed">
                    Supporting innovative research across <span className="text-foreground">multiple disciplines</span> including health, engineering, and biotechnology.
                  </p>
                </div>
              </div>

              {/* Agencies Grid */}
              <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { name: 'ICMR', full: 'Indian Council of Medical Research', amount: '946.04', unit: 'Lakhs', icon: HeartPulse, color: 'text-red-500', bg: 'bg-red-500/5' },
                  { name: 'Royal Academy of Engineering', full: 'United Kingdom', amount: '244.21', unit: 'Lakhs', icon: GraduationCap, color: 'text-blue-500', bg: 'bg-blue-500/5' },
                  { name: 'Industries Comm.', full: 'Govt. of Gujarat', amount: '150', unit: 'Lakhs', icon: Building2, color: 'text-emerald-500', bg: 'bg-emerald-500/5' },
                  { name: 'GSBTM', full: 'Gujarat State Biotechnology Mission', amount: '121.33', unit: 'Lakhs', icon: FlaskConical, color: 'text-amber-500', bg: 'bg-amber-500/5' },
                ].map((agency, i) => (
                  <div key={i} className="group p-8 rounded-[2.5rem] bg-background border hover:border-primary/40 transition-all duration-500 hover:shadow-xl relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all">
                      <agency.icon className="h-20 w-20" />
                    </div>
                    <div className="space-y-4">
                      <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center", agency.bg)}>
                        <agency.icon className={cn("h-6 w-6", agency.color)} />
                      </div>
                      <div>
                        <h4 className="font-black text-lg tracking-tight leading-none mb-1">{agency.name}</h4>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider line-clamp-1">{agency.full}</p>
                      </div>
                    </div>
                    <div className="mt-8">
                      <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Grant Value</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black tracking-tighter">₹ {agency.amount}</span>
                        <span className="text-xs font-bold text-muted-foreground italic">{agency.unit}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Research Centres & Facilities */}
        <section className="w-full py-24 relative bg-background">
          <div className="container px-4 md:px-8">
            <div className="flex flex-col items-center justify-center space-y-4 text-center mb-16">
              <div className="space-y-4">
                <div className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-black uppercase tracking-widest">Centers of Excellence</div>
                <h2 className="text-3xl font-black sm:text-5xl tracking-tight">Advanced <span className="text-primary italic">Research Facilities</span></h2>
                <p className="max-w-[700px] text-muted-foreground md:text-xl font-medium mx-auto">
                  Explore our world-class research centers dedicated to pushing the boundaries of knowledge and innovation.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-7xl mx-auto">
              {[
                {
                  title: 'Micro Nano Research and Development Center',
                  desc: 'An advanced lab for research and experiment in nano-technology',
                  icon: Target,
                  url: 'https://micronanornd.paruluniversity.ac.in/'
                },
                {
                  title: 'Environmental Sciences',
                  desc: 'A leading facility for advanced environmental research initiatives',
                  icon: Globe,
                  url: null
                },
                {
                  title: 'DSIR Research and Development Centre',
                  desc: 'A fully equipped centre for advanced multidisciplinary research initiatives',
                  icon: Library,
                  url: null
                },
                {
                  title: 'Advanced Electromagnetic Research & Antenna Laboratory',
                  desc: 'An advanced facility for research in electromagnetic analysis, antenna engineering, and wireless communication systems.',
                  icon: Cpu,
                  url: 'https://aeral.paruluniversity.ac.in/'
                },
                {
                  title: 'Advanced Manufacturing Research & Technology Centre',
                  desc: 'State-of-the-art facility for next-generation additive manufacturing and technological research.',
                  icon: Settings,
                  status: 'Coming Soon',
                  url: null
                },
              ].map((center, idx) => (
                <div key={idx} className="group p-10 rounded-[3rem] bg-secondary/10 border hover:bg-background hover:border-primary/40 hover:shadow-2xl transition-all duration-500 flex flex-col justify-between">
                  <div className="space-y-6">
                    <div className="flex justify-between items-start">
                      <div className="h-16 w-16 rounded-[1.5rem] bg-background flex items-center justify-center text-primary border shadow-sm group-hover:scale-110 transition-transform">
                        <center.icon className="h-8 w-8" />
                      </div>
                      {(center as any).status && (
                        <span className="px-3 py-1 bg-amber-500/10 text-amber-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-500/20">
                          {(center as any).status}
                        </span>
                      )}
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-2xl font-black leading-tight group-hover:text-primary transition-colors">{center.title}</h3>
                      <p className="text-muted-foreground font-medium">{center.desc}</p>
                    </div>
                  </div>
                  {center.url && (
                    <div className="mt-10">
                      <Link href={center.url} target="_blank">
                        <Button className="rounded-full px-8 bg-primary hover:bg-primary/90 font-bold shadow-lg shadow-primary/20">
                          Visit Center <ExternalLink className="ml-2 h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Vision & Mission */}
        <section className="w-full py-32 relative">
          <div className="container px-4 md:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* Vision */}
              <div className="group relative bg-background border rounded-[3rem] p-12 overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-700">
                <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:scale-110 transition-transform duration-700">
                  <Sparkles className="h-32 w-32 text-primary" />
                </div>
                <div className="relative z-10 space-y-8">
                  <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                    <Target className="h-8 w-8" />
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-4xl font-black tracking-tight">Our Vision</h3>
                    <p className="text-xl text-muted-foreground font-medium leading-relaxed max-w-md">
                      To make Parul University a globally acclaimed university with strong R & D foundation.
                    </p>
                  </div>
                  <div className="pt-4 flex items-center gap-3 text-sm font-bold text-primary">
                    <div className="h-10 w-10 rounded-full border border-primary/20 flex items-center justify-center bg-primary/5">
                      <Globe className="h-5 w-5" />
                    </div>
                    Hands holding globe with diverse community
                  </div>
                </div>
              </div>

              {/* Mission */}
              <div className="group relative bg-primary rounded-[3rem] p-12 overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-700 text-white">
                <div className="absolute top-0 right-0 p-12 opacity-15 group-hover:scale-110 transition-transform duration-700">
                  <Target className="h-32 w-32" />
                </div>
                <div className="relative z-10 space-y-8">
                  <div className="h-16 w-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                    <Sparkles className="h-8 w-8" />
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-4xl font-black tracking-tight">Our Mission</h3>
                    <p className="text-xl text-white/90 font-medium leading-relaxed">
                      To inspire and motivate students and faculty members to engage into community-centered, evidence-based, Inter-disciplinary research with significant socio-economic values.
                    </p>
                  </div>
                  <div className="pt-4 flex items-center gap-3 text-sm font-bold opacity-90">
                    <div className="h-10 w-10 rounded-full border border-white/20 flex items-center justify-center bg-white/10">
                      <Users className="h-5 w-5" />
                    </div>
                    Goal-oriented activity with teamwork and progress
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Dynamic Funding Calls Section */}
        <section id="funding" className="w-full py-32 bg-secondary/20 relative overflow-hidden">
          <div className="container px-4 md:px-8 relative z-10">
            <div className="flex flex-col items-center justify-center space-y-4 text-center mb-16">
              <div className="space-y-4">
                <div className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-black uppercase tracking-widest">Opportunities</div>
                <h2 className="text-4xl font-black tracking-tight sm:text-6xl">Open EMR Calls on <span className="text-primary italic">Funding</span></h2>
                <p className="max-w-[700px] text-muted-foreground md:text-xl font-medium mx-auto">
                  Discover open calls for funding to support your groundbreaking research and innovation projects from various funding agencies.
                </p>
              </div>
            </div>

            <Tabs defaultValue="current" className="max-w-6xl mx-auto">
              <div className="flex justify-center mb-12">
                <TabsList className="bg-background border rounded-full p-1 h-14 w-full max-w-md shadow-sm">
                  <TabsTrigger value="current" className="rounded-full px-8 font-bold data-[state=active]:bg-primary data-[state=active]:text-white transition-all h-full flex-1">
                    Current Calls ({currentCalls.length})
                  </TabsTrigger>
                  <TabsTrigger value="past" className="rounded-full px-8 font-bold data-[state=active]:bg-primary data-[state=active]:text-white transition-all h-full flex-1">
                    Past Opportunities ({pastCalls.length})
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="current">
                {callsLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-80 rounded-[2rem]" />)}
                  </div>
                ) : currentCalls.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {currentCalls.map((call) => (
                      <GrantCard key={call.id} call={call} applyRoute={getApplyRoute(call.id)} isPast={false} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-20 bg-background/50 rounded-[3rem] border border-dashed border-primary/20">
                    <p className="text-muted-foreground font-bold">No active funding calls at the moment. Check back soon!</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="past">
                {callsLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-80 rounded-[2rem]" />)}
                  </div>
                ) : pastCalls.length > 0 ? (
                  <div className="space-y-12">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 opacity-75">
                      {displayedPastCalls.map((call) => (
                        <GrantCard key={call.id} call={call} applyRoute={null} isPast={true} />
                      ))}
                    </div>

                    {pastCalls.length > 10 && !showAllPast && (
                      <div className="flex justify-center pt-8">
                        <Button
                          onClick={() => setShowAllPast(true)}
                          variant="outline"
                          className="rounded-full px-12 h-14 font-black text-lg border-2 border-primary/20 hover:bg-primary hover:text-white transition-all shadow-xl shadow-primary/10"
                        >
                          Show All Past Opportunities ({pastCalls.length - 10} more)
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-20 bg-background/50 rounded-[3rem] border border-dashed border-primary/20">
                    <p className="text-muted-foreground font-bold">No past opportunities recorded in the system.</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </section>

        {/* Research Excellence Stats */}
        <section className="w-full py-32 relative overflow-hidden">
          <div className="container px-4 md:px-8">
            <div className="flex flex-col items-center justify-center space-y-4 text-center mb-16">
              <div className="space-y-4">
                <h2 className="text-4xl font-black tracking-tight sm:text-6xl">Research Excellence</h2>
                <p className="max-w-[700px] text-muted-foreground md:text-xl font-medium mx-auto">
                  Pioneering innovation through groundbreaking research, intellectual property, and scientific advancement.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 lg:gap-8 max-w-7xl mx-auto">
              {excellenceStats.map((stat, idx) => (
                <div key={idx} className="group p-8 rounded-[2.5rem] bg-background border hover:border-primary/40 transition-all duration-500 hover:shadow-xl shadow-sm relative overflow-hidden">
                  <div className="absolute -right-4 -top-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
                    <stat.icon className="h-32 w-32" />
                  </div>
                  <div className="relative z-10 space-y-4">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <stat.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl lg:text-4xl font-black tracking-tighter">{stat.value}</span>
                        {stat.unit && <span className="text-sm font-bold text-primary">{stat.unit}</span>}
                      </div>
                      <h4 className="text-sm font-bold tracking-tight mt-1">{stat.label}</h4>
                      <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mt-2">{stat.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-16 text-center">
              <div className="inline-flex items-center gap-2 px-6 py-2 rounded-full border bg-primary text-white text-sm font-black uppercase tracking-widest shadow-xl shadow-primary/20">
                Excellence: Leading the future of research and innovation
              </div>
            </div>
          </div>
        </section>

        {/* Global Impact CTA */}
        <section className="w-full py-32 relative overflow-hidden bg-primary text-white">
          <div className="container relative z-10 px-4 md:px-8">
            <div className="max-w-4xl mx-auto text-center space-y-10">
              <div className="space-y-6">
                <h2 className="text-4xl font-black tracking-tight sm:text-7xl">Accelerate Your <span className="text-white/40 italic">Academic Journey</span>.</h2>
                <p className="text-white/70 md:text-xl font-medium max-w-2xl mx-auto">
                  Over 800+ faculty members at PU are already using the RDC portal to drive their academic careers forward with efficiency and transparency.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-4">
                {user ? (
                  <Link href="/dashboard" className="w-full sm:w-auto">
                    <Button size="lg" className="h-16 w-full sm:w-72 rounded-2xl bg-white text-primary hover:bg-white/90 shadow-2xl font-black text-xl transition-all border-none">
                      Go to Dashboard
                    </Button>
                  </Link>
                ) : (
                  <Link href="/signup" className="w-full sm:w-auto">
                    <Button size="lg" className="h-16 w-full sm:w-72 rounded-2xl bg-white text-primary hover:bg-white/90 shadow-2xl font-black text-xl transition-all border-none">
                      Get Started Now
                    </Button>
                  </Link>
                )}
                <Link href="/help" className="w-full sm:w-auto">
                  <Button variant="outline" size="lg" className="h-16 w-full sm:w-72 rounded-2xl border-2 border-white/20 bg-white/10 backdrop-blur hover:bg-white/20 text-white font-bold transition-all">
                    Get in Touch
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full border-t bg-background py-20">
        <div className="container px-4 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-16 mb-16">
            <div className="col-span-1 md:col-span-2 space-y-8">
              <Logo />
              <p className="max-w-md text-muted-foreground leading-relaxed font-medium">
                The Research & Development Cell at Parul University serves as a hub for academic brilliance, supporting innovative projects and fostering industry-academic collaborations.
              </p>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full border flex items-center justify-center hover:bg-primary hover:text-white transition-colors cursor-pointer"><Globe className="h-4 w-4" /></div>
                <div className="h-10 w-10 rounded-full border flex items-center justify-center hover:bg-primary hover:text-white transition-colors cursor-pointer"><Users className="h-4 w-4" /></div>
              </div>
            </div>
            <div className="space-y-6">
              <h4 className="font-black text-xs uppercase tracking-[0.2em] text-primary">Quick Portal</h4>
              <nav className="flex flex-col gap-4 text-sm font-bold">
                <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
                <Link href="/sop" className="hover:text-primary transition-colors">SOP Guides</Link>
                <Link href="/evaluator" className="hover:text-primary transition-colors">Evaluator Login</Link>
              </nav>
            </div>
            <div className="space-y-6">
              <h4 className="font-black text-xs uppercase tracking-[0.2em] text-primary">Compliance</h4>
              <nav className="flex flex-col gap-4 text-sm font-bold">
                <Link href="/privacy-policy" className="hover:text-primary transition-colors">Privacy Policy</Link>
                <Link href="/terms-of-use" className="hover:text-primary transition-colors">Terms of Service</Link>
              </nav>
            </div>
          </div>

          <div className="pt-10 border-t flex flex-col md:flex-row justify-between items-center gap-8">
            <p className="text-xs font-bold text-muted-foreground tracking-wide">
              &copy; {new Date().getFullYear()} Parul University Research & Development Cell. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <div className="px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">
                System Fully Operational
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function GrantCard({ call, applyRoute, isPast }: { call: FundingCall; applyRoute: string | null; isPast: boolean }) {
  return (
    <div className={cn(
      "group relative flex flex-col justify-between bg-background border rounded-[2rem] p-8 transition-all duration-500 hover:shadow-2xl hover:border-primary/30",
      isPast && "grayscale hover:grayscale-0"
    )}>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-tighter">
            {call.callType || 'Grant'}
          </div>
          <div className={cn(
            "flex items-center gap-1.5 text-[10px] font-bold uppercase",
            isPast ? "text-muted-foreground" : "text-amber-600"
          )}>
            <Clock className="h-3 w-3" />
            {isPast ? 'Closed' : `Apply By: ${format(parseISO(call.applyDeadline), 'dd/MM/yyyy')}`}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-xl font-bold line-clamp-2 min-h-[3.5rem] group-hover:text-primary transition-colors">{call.title}</h3>
          <p className="text-sm text-muted-foreground font-medium">Organized by {call.agency}</p>
        </div>

        <div className="pt-4 space-y-2 border-t">
          <div className="flex justify-between text-[11px] font-bold">
            <span className="text-muted-foreground uppercase tracking-widest">Interest Deadline:</span>
            <span>{format(parseISO(call.interestDeadline), 'dd/MM/yyyy')}</span>
          </div>
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        {call.driveLink && (
          <Button asChild variant="outline" className="flex-1 rounded-xl font-bold text-xs h-12 border-2">
            <a href={call.driveLink} target="_blank" rel="noopener noreferrer">
              <Download className="mr-2 h-4 w-4" /> PDF
            </a>
          </Button>
        )}
        {applyRoute ? (
          <Button asChild className="flex-[2] rounded-xl font-black text-xs h-12 bg-primary shadow-lg shadow-primary/20">
            <Link href={applyRoute}>
              Apply Now <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button disabled className="flex-[2] rounded-xl font-black text-xs h-12 bg-muted text-muted-foreground">
            Call Closed
          </Button>
        )}
      </div>
    </div>
  );
}
