
'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import {
  Award,
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
  ShieldCheck,
  Upload,
  Users,
  History,
  Building2,
  Calendar,
  NotebookPen,
  Send,
  GripVertical,
  Save,
  Loader2,
  Briefcase,
  BookUp,
  MessageCircle,
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
  SidebarTrigger,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { UserNav } from '@/components/user-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/logo';
import type { User } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { auth, db } from '@/lib/config';
import { signOut, onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { collection, onSnapshot, query, where, doc, getDoc } from 'firebase/firestore';
import { getDefaultModulesForRole } from '@/lib/modules';
import { saveSidebarOrder } from '@/app/actions';
import { TutorialDialog } from '@/components/tutorial-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface NavItem {
  id: string;
  href: string;
  tooltip: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
  condition?: boolean;
}

const SortableSidebarMenuItem = ({ item }: { item: NavItem }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const pathname = usePathname();
  const isActive = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <SidebarMenuItem ref={setNodeRef} style={style} {...attributes}>
      <SidebarMenuButton href={item.href} tooltip={item.tooltip} isActive={isActive}>
        <div {...listeners} className="cursor-grab p-1 -ml-1">
          <GripVertical className="h-4 w-4 text-muted-foreground/50" />
        </div>
        <item.icon />
        <span>{item.label}</span>
        {item.badge !== undefined && item.badge > 0 && (
          <span className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-medium text-destructive-foreground">
            {item.badge}
          </span>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};


export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingMeetingsCount, setPendingMeetingsCount] = useState(0);
  const [pendingIncentiveApprovalsCount, setPendingIncentiveApprovalsCount] = useState(0);
  const [pendingBankClaimsCount, setPendingBankClaimsCount] = useState(0);
  const [menuItems, setMenuItems] = useState<NavItem[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isPostSetupDialogOpen, setIsPostSetupDialogOpen] = useState(false);
  const [linkedProjectsCount, setLinkedProjectsCount] = useState({ imr: 0, emr: 0 });
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const isRearrangeEnabled = user?.role === 'Super-admin' || user?.role === 'admin' || user?.role === 'CRO';
  
  const allNavItems = useMemo((): NavItem[] => [
    { id: 'dashboard', href: '/dashboard', tooltip: 'Dashboard', icon: Home, label: 'Dashboard', condition: true },
    { id: 'ai-chat', href: '/dashboard/ai-chat', tooltip: 'AI Chat', icon: MessageCircle, label: 'AI Chat Agent' },
    { id: 'new-submission', href: '/dashboard/new-submission', tooltip: 'New Submission', icon: FilePlus2, label: 'New Submission' },
    { id: 'my-projects', href: '/dashboard/my-projects', tooltip: 'My Projects', icon: Book, label: 'My Projects' },
    { id: 'emr-calendar', href: '/dashboard/emr-calendar', tooltip: 'EMR Calendar', icon: Calendar, label: 'EMR Calendar' },
    { id: 'incentive-claim', href: '/dashboard/incentive-claim', tooltip: 'Incentive Claims', icon: Award, label: 'Incentive Claims' },
    { id: 'incentive-approvals', href: '/dashboard/incentive-approvals', tooltip: 'Incentive Approvals', icon: NotebookPen, label: 'Incentive Approvals', badge: pendingIncentiveApprovalsCount },
    { id: 'evaluator-dashboard', href: '/dashboard/evaluator-dashboard', tooltip: 'Evaluation Queue', icon: ClipboardCheck, label: 'Evaluation Queue' },
    { id: 'my-evaluations', href: '/dashboard/my-evaluations', tooltip: 'My Evaluations', icon: History, label: 'My IMR Evaluations' },
    { id: 'schedule-meeting', href: '/dashboard/schedule-meeting', tooltip: 'Schedule Meeting', icon: CalendarClock, label: 'Schedule Meeting', badge: pendingMeetingsCount },
    { id: 'pending-reviews', href: '/dashboard/pending-reviews', tooltip: 'Pending Reviews', icon: GanttChartSquare, label: 'Pending Reviews' },
    { id: 'completed-reviews', href: '/dashboard/completed-reviews', tooltip: 'Completed Reviews', icon: FileCheck2, label: 'Completed Reviews' },
    { id: 'all-projects', href: '/dashboard/all-projects', tooltip: 'All Projects', icon: Book, label: 'All Projects' },
    { id: 'emr-management', href: '/dashboard/emr-management', tooltip: 'EMR Management', icon: Briefcase, label: 'EMR Management' },
    { id: 'analytics', href: '/dashboard/analytics', tooltip: 'Analytics', icon: LineChart, label: 'Analytics' },
    { id: 'manage-users', href: '/dashboard/manage-users', tooltip: 'Manage Users', icon: Users, label: 'Manage Users' },
    { id: 'manage-incentive-claims', href: '/dashboard/manage-incentive-claims', tooltip: 'Manage Incentive Claims', icon: Award, label: 'Manage Claims', badge: pendingBankClaimsCount },
    { id: 'bulk-upload', href: '/dashboard/bulk-upload', tooltip: 'Bulk Upload Projects', icon: Upload, label: 'Bulk Upload Projects' },
    { id: 'bulk-upload-papers', href: '/dashboard/bulk-upload-papers', tooltip: 'Bulk Upload Papers', icon: BookUp, label: 'Bulk Upload Papers' },
    { id: 'bulk-upload-emr', href: '/dashboard/bulk-upload-emr', tooltip: 'Bulk Upload EMR', icon: Upload, label: 'Bulk Upload EMR' },
    { id: 'module-management', href: '/dashboard/module-management', tooltip: 'Module Management', icon: ShieldCheck, label: 'Module Management' },
    { id: 'notifications', href: '/dashboard/notifications', tooltip: 'Notifications', icon: Bell, label: 'Notifications', badge: unreadCount, condition: true },
    { id: 'settings', href: '/dashboard/settings', tooltip: 'Settings', icon: Settings, label: 'Settings', condition: true },
  ], [unreadCount, pendingMeetingsCount, pendingIncentiveApprovalsCount, pendingBankClaimsCount]);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }

      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        
        unsubscribeProfile = onSnapshot(userDocRef, (userDocSnap) => {
          if (userDocSnap.exists()) {
            const appUser = { uid: firebaseUser.uid, ...userDocSnap.data() } as User;
            
            // Critical check: Ensure profile is complete before allowing access to the dashboard.
            if (!appUser.profileComplete) {
                router.replace('/profile-setup');
                return;
            }

            if (!appUser.allowedModules || appUser.allowedModules.length === 0) {
                appUser.allowedModules = getDefaultModulesForRole(appUser.role, appUser.designation);
            }
            
            const isPrincipal = appUser.designation === 'Principal';
            const isHod = appUser.designation === 'HOD';

            // Add special permission for Principals and HODs to see the 'All Projects' page
            if (isPrincipal || isHod) {
              if (!appUser.allowedModules.includes('all-projects')) {
                appUser.allowedModules.push('all-projects');
              }
            }
            
            // Check for post-setup linking notification
            const postSetupInfo = sessionStorage.getItem('postSetupInfo');
            if (postSetupInfo) {
                const { imr, emr } = JSON.parse(postSetupInfo);
                if (imr > 0 || emr > 0) {
                    setLinkedProjectsCount({ imr, emr });
                    setIsPostSetupDialogOpen(true);
                }
                sessionStorage.removeItem('postSetupInfo');
            }
            
            setUser(appUser);
            localStorage.setItem('user', JSON.stringify(appUser));
          } else {
            toast({ variant: 'destructive', title: 'Authentication Error', description: 'User profile not found.' });
            signOut(auth);
          }
          setLoading(false);
        }, (error) => {
          console.error("Firestore user listener error:", error);
          toast({ variant: "destructive", title: "Network Error", description: "Could not fetch real-time user data." });
          signOut(auth);
          setLoading(false);
        });

      } else {
        localStorage.removeItem('user');
        sessionStorage.clear(); // Clear session storage on logout
        router.replace('/login');
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, [router, toast]);

  useEffect(() => {
    if (user) {
        const filtered = allNavItems.filter(item => {
            if (item.condition) return true;
            if (item.id === 'incentive-approvals') {
                return user.allowedModules?.some(m => m.startsWith('incentive-approver-'));
            }
            return user.allowedModules?.includes(item.id);
        });
        const sorted = user.sidebarOrder 
            ? filtered.sort((a, b) => user.sidebarOrder!.indexOf(a.id) - user.sidebarOrder!.indexOf(b.id))
            : filtered;
        
        setMenuItems(sorted);
    }
  }, [user, allNavItems]);


  useEffect(() => {
    if (!user) return;

    const unsubscribes: (() => void)[] = [];

    // Notifications listener
    const notificationsQuery = query(collection(db, 'notifications'), where('uid', '==', user.uid));
    unsubscribes.push(onSnapshot(notificationsQuery, (snapshot) => {
      const unread = snapshot.docs.filter(doc => !doc.data().isRead).length;
      setUnreadCount(unread);
    }));

    // Pending Meetings listener (for admins)
    if (user.allowedModules?.includes('schedule-meeting')) {
      const projectsQuery = query(collection(db, 'projects'), where('status', '==', 'Submitted'));
      unsubscribes.push(onSnapshot(projectsQuery, (snapshot) => {
        setPendingMeetingsCount(snapshot.size);
      }));
    }

    // Incentive Approvals listener
    const approverModule = user.allowedModules?.find(m => m.startsWith('incentive-approver-'));
    if (approverModule) {
        const stage = parseInt(approverModule.split('-')[2], 10);
        const statusToFetch = stage === 1 ? 'Pending' : `Pending Stage ${stage} Approval`;
        const incentiveQuery = query(collection(db, 'incentiveClaims'), where('status', '==', statusToFetch));
        unsubscribes.push(onSnapshot(incentiveQuery, snapshot => {
            setPendingIncentiveApprovalsCount(snapshot.size);
        }));
    }

    // Pending Bank Claims listener (for admins)
    if (user.allowedModules?.includes('manage-incentive-claims')) {
        const bankClaimsQuery = query(collection(db, 'incentiveClaims'), where('status', 'in', ['Accepted', 'Submitted to Accounts']));
        unsubscribes.push(onSnapshot(bankClaimsQuery, snapshot => {
            setPendingBankClaimsCount(snapshot.size);
        }));
    }

    return () => unsubscribes.forEach(unsub => unsub());
  }, [user]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // localStorage is cleared by onAuthStateChanged listener
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
  
  const attemptLogout = () => {
    if (sessionStorage.getItem('chatSessionActive')) {
        setIsLogoutConfirmOpen(true);
    } else {
        handleLogout();
    }
  };

  const getPageTitle = () => {
      const segments = pathname.split('/');
      const lastSegment = segments.pop() || 'dashboard';

      if(pathname.includes('/dashboard/project/')) return "Project Details";
      if(pathname.includes('/dashboard/incentive-claim')) return "Incentive Claims";
      if(pathname.includes('/dashboard/manage-incentive-claims')) return "Manage Incentive Claims";
      if(pathname.includes('/dashboard/emr-management')) return "EMR Management";
      if(pathname.includes('/dashboard/emr-calendar')) return "EMR Calendar";
      if(pathname.includes('/dashboard/profile-setup')) return "Profile Setup";

      if (lastSegment === 'dashboard') return 'Dashboard';
      return lastSegment.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setMenuItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
      setIsDirty(true);
    }
  }

  const handleSaveOrder = async () => {
    if (!user) return;
    setIsSaving(true);
    const newOrder = menuItems.map(item => item.id);
    const result = await saveSidebarOrder(user.uid, newOrder);
    if (result.success) {
      toast({ title: "Success", description: "Your sidebar layout has been saved." });
      setIsDirty(false);
    } else {
      toast({ variant: 'destructive', title: "Error", description: result.error });
    }
    setIsSaving(false);
  };
  
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
             <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-md sm:px-6">
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

  return (
    <>
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <Logo variant="dashboard" />
        </SidebarHeader>
        <SidebarContent>
           <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={menuItems.map(item => item.id)} strategy={verticalListSortingStrategy}>
              <SidebarMenu>
                {menuItems.map((item) => (
                  isRearrangeEnabled ? (
                    <SortableSidebarMenuItem key={item.id} item={item} />
                  ) : (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton href={item.href} tooltip={item.tooltip} isActive={item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href)}>
                        <item.icon />
                        <span>{item.label}</span>
                         {item.badge !== undefined && item.badge > 0 && (
                          <span className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-medium text-destructive-foreground">
                            {item.badge}
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                ))}
              </SidebarMenu>
            </SortableContext>
          </DndContext>
        </SidebarContent>
         <SidebarFooter className="hidden md:flex mt-auto group-data-[collapsible=icon]:hidden">
            <Image
                src="https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/PU-WATERMARK.svg"
                alt="Parul University Logo"
                width={150}
                height={50}
                className="mx-auto"
                style={{ height: 'auto' }}
            />
        </SidebarFooter>
        {isRearrangeEnabled && isDirty && (
          <SidebarHeader>
            <Button onClick={handleSaveOrder} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Order
            </Button>
          </SidebarHeader>
        )}
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <h1 className="text-xl font-semibold">{getPageTitle()}</h1>
          </div>
          <div className="flex items-center gap-4">
            <TutorialDialog user={user} />
            <ThemeToggle />
            <UserNav user={user} onLogout={attemptLogout} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto sm:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
    <AlertDialog open={isLogoutConfirmOpen} onOpenChange={setIsLogoutConfirmOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you sure you want to log out?</AlertDialogTitle>
                <AlertDialogDescription>
                    Logging out will permanently delete your current AI chat history. This action cannot be undone.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleLogout}>Log Out</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={isPostSetupDialogOpen} onOpenChange={setIsPostSetupDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Projects Linked to Your Account</AlertDialogTitle>
                <AlertDialogDescription>
                    We found some existing projects where you were listed as an investigator. They have been automatically linked to your new account.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
                {linkedProjectsCount.imr > 0 && <p>{linkedProjectsCount.imr} IMR project(s) linked.</p>}
                {linkedProjectsCount.emr > 0 && <p>{linkedProjectsCount.emr} EMR project(s) linked.</p>}
            </div>
            <AlertDialogFooter>
                <AlertDialogAction onClick={() => setIsPostSetupDialogOpen(false)}>Great!</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
