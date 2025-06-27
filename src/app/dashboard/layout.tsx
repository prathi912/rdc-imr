'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Bell,
  Book,
  CalendarClock,
  ClipboardCheck,
  FileCheck2,
  FilePlus2,
  GanttChartSquare,
  Home,
  LineChart,
  Settings,
  Users,
} from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarInset,
} from '@/components/ui/sidebar';
import { UserNav } from '@/components/user-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/logo';
import type { User } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { auth, db } from '@/lib/firebase';
import { signOut, onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { collection, onSnapshot, query, where, doc, getDoc } from 'firebase/firestore';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const appUser = { uid: firebaseUser.uid, ...userDocSnap.data() } as User;
          setUser(appUser);
          localStorage.setItem('user', JSON.stringify(appUser));
        } else {
          toast({ variant: 'destructive', title: 'Authentication Error', description: 'User profile not found.' });
          await signOut(auth);
          router.replace('/login');
        }
      } else {
        localStorage.removeItem('user');
        router.replace('/login');
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, [router, toast]);

  useEffect(() => {
    if (user) {
      const q = query(
        collection(db, 'notifications'),
        where('uid', '==', user.uid),
        where('isRead', '==', false)
      );

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        setUnreadCount(querySnapshot.size);
      }, (error) => {
        console.error("Firestore notification listener error:", error);
        toast({
          variant: "destructive",
          title: "Network Error",
          description: "Could not fetch real-time notifications.",
        });
      });

      return () => unsubscribe();
    }
  }, [user, toast]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('user');
      router.push('/login');
      toast({ title: 'Logged out successfully.' });
    } catch (error) {
      console.error('Logout error:', error);
      toast({
        variant: 'destructive',
        title: 'Logout Failed',
        description: 'An error occurred during logout. Please try again.',
      });
    }
  };
  
  const getPageTitle = () => {
      const segments = pathname.split('/');
      const lastSegment = segments.pop() || 'dashboard';

      if(lastSegment === 'project' && segments.includes('dashboard')) return "Project Details";

      if (lastSegment === 'dashboard') return 'Dashboard';
      return lastSegment.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  if (loading || !user) {
    return (
       <div className="flex min-h-screen">
          <div className="hidden md:block md:w-64 bg-card border-r p-4">
              <div className="flex items-center h-10 mb-8">
                <Skeleton className="h-10 w-32" />
              </div>
              <div className="space-y-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
              </div>
          </div>
          <div className="flex-1">
             <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-md sm:px-6">
                 <Skeleton className="h-8 w-48" />
                   <div className="flex items-center gap-4">
                      <Skeleton className="h-9 w-9 rounded-md" />
                      <Skeleton className="h-9 w-9 rounded-full" />
                  </div>
              </header>
              <main className="p-6">
                <Skeleton className="h-[calc(100vh-10rem)] w-full" />
              </main>
          </div>
      </div>
    ); 
  }

  const isAdmin = ['admin', 'CRO', 'Super-admin'].includes(user.role);
  const isEvaluator = user.role === 'Evaluator';
  const isFaculty = user.role === 'faculty';


  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <Logo />
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton href="/dashboard" tooltip="Dashboard" isActive={pathname === '/dashboard'}>
                <Home />
                Dashboard
              </SidebarMenuButton>
            </SidebarMenuItem>
             {isFaculty && (
              <>
                 <SidebarMenuItem>
                  <SidebarMenuButton href="/dashboard/new-submission" tooltip="New Submission" isActive={pathname === '/dashboard/new-submission'}>
                    <FilePlus2 />
                    New Submission
                  </SidebarMenuButton>
                </SidebarMenuItem>
                 <SidebarMenuItem>
                  <SidebarMenuButton href="/dashboard/my-projects" tooltip="My Projects" isActive={pathname === '/dashboard/my-projects'}>
                    <Book />
                    My Projects
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </>
             )}
            {isEvaluator && (
                <SidebarMenuItem>
                  <SidebarMenuButton href="/dashboard/evaluator-dashboard" tooltip="Evaluation Queue" isActive={pathname === '/dashboard/evaluator-dashboard'}>
                    <ClipboardCheck />
                    Evaluation Queue
                  </SidebarMenuButton>
                </SidebarMenuItem>
            )}
            {isAdmin && (
              <>
                 <SidebarMenuItem>
                  <SidebarMenuButton href="/dashboard/schedule-meeting" tooltip="Schedule Meeting" isActive={pathname === '/dashboard/schedule-meeting'}>
                    <CalendarClock />
                    Schedule Meeting
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton href="/dashboard/pending-reviews" tooltip="Pending Reviews" isActive={pathname === '/dashboard/pending-reviews'}>
                    <GanttChartSquare />
                    Pending Reviews
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton href="/dashboard/completed-reviews" tooltip="Completed Reviews" isActive={pathname === '/dashboard/completed-reviews'}>
                    <FileCheck2 />
                    Completed Reviews
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton href="/dashboard/all-projects" tooltip="All Projects" isActive={pathname === '/dashboard/all-projects'}>
                    <Book />
                    All Projects
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton href="/dashboard/analytics" tooltip="Analytics" isActive={pathname === '/dashboard/analytics'}>
                    <LineChart />
                    Analytics
                  </SidebarMenuButton>
                </SidebarMenuItem>
                 <SidebarMenuItem>
                  <SidebarMenuButton href="/dashboard/manage-users" tooltip="Manage Users" isActive={pathname === '/dashboard/manage-users'}>
                    <Users />
                    Manage Users
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </>
            )}
            <SidebarMenuItem>
              <SidebarMenuButton href="/dashboard/notifications" tooltip="Notifications" isActive={pathname === '/dashboard/notifications'}>
                <Bell />
                <span>Notifications</span>
                {unreadCount > 0 && (
                  <span className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-medium text-destructive-foreground">
                    {unreadCount}
                  </span>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton href="/dashboard/settings" tooltip="Settings" isActive={pathname === '/dashboard/settings'}>
                <Settings />
                Settings
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-md sm:px-6">
          <h1 className="text-xl font-semibold">{getPageTitle()}</h1>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <UserNav user={user} onLogout={handleLogout} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
