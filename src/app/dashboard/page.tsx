'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  Book,
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
import { DashboardClient } from '@/components/dashboard/dashboard-client';
import type { User } from '@/types';

const adminUser: User = {
  uid: 'admin-id',
  name: 'Pranav Rathi',
  email: 'rathipranav07@gmail.com',
  role: 'admin',
};

const facultyUser: User = {
  uid: 'faculty-id',
  name: 'Faculty Member',
  email: 'faculty.member@paruluniversity.ac.in',
  role: 'faculty',
};

export default function DashboardPage() {
  const [user, setUser] = useState<User>(facultyUser);

  const isAdmin = user.role === 'admin';

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <Logo />
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton href="/dashboard" tooltip="Dashboard" isActive>
                <Home />
                Dashboard
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton href="/dashboard/new-submission" tooltip="New Submission">
                <FilePlus2 />
                New Submission
              </SidebarMenuButton>
            </SidebarMenuItem>
             <SidebarMenuItem>
              <SidebarMenuButton href="#" tooltip="My Projects">
                <Book />
                My Projects
              </SidebarMenuButton>
            </SidebarMenuItem>
            {isAdmin && (
              <>
                <SidebarMenuItem>
                  <SidebarMenuButton href="#" tooltip="Pending Reviews">
                    <GanttChartSquare />
                    Pending Reviews
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton href="#" tooltip="Completed Reviews">
                    <FileCheck2 />
                    Completed Reviews
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton href="#" tooltip="All Projects">
                    <Book />
                    All Projects
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton href="#" tooltip="Analytics">
                    <LineChart />
                    Analytics
                  </SidebarMenuButton>
                </SidebarMenuItem>
                 <SidebarMenuItem>
                  <SidebarMenuButton href="#" tooltip="Manage Users">
                    <Users />
                    Manage Users
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </>
            )}
            <SidebarMenuItem>
              <SidebarMenuButton href="/dashboard/notifications" tooltip="Notifications">
                <Bell />
                Notifications
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton href="#" tooltip="Settings">
                <Settings />
                Settings
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-sm sm:px-6">
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <UserNav user={user} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <DashboardClient user={user} setUser={setUser} adminUser={adminUser} facultyUser={facultyUser} />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
