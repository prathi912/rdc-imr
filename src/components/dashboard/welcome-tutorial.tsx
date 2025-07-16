
'use client';

import { useState } from 'react';
import type { User } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { updateUserTutorialStatus } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import {
  FilePlus2,
  Book,
  Award,
  ClipboardCheck,
  History,
  FileCheck2,
  LineChart,
  Users,
  CalendarClock,
  ShieldCheck,
  Settings,
  Bell,
  GraduationCap
} from 'lucide-react';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';

interface WelcomeTutorialProps {
  user: User;
}

const tutorialSteps = {
  faculty: [
    {
      icon: Settings,
      title: 'First Step: Complete Your Profile',
      description: "Welcome! Before you begin, please go to 'Settings' from the sidebar. It's crucial to complete your academic profile and add your bank account details, as this is required for any grant payments.",
    },
    {
      icon: FilePlus2,
      title: 'Submit New Projects',
      description: "Click 'New Submission' in the sidebar to start a multi-step form to apply for IMR project funding. You can save your progress as a draft anytime.",
    },
    {
      icon: Book,
      title: 'Track Your Projects',
      description: "The 'My Projects' page lists all projects you are associated with. Click any project to view its detailed status, see feedback if revisions are needed, and manage grant funds if awarded.",
    },
     {
      icon: Bell,
      title: 'Stay Notified',
      description: "Keep an eye on the 'Notifications' tab. You'll receive important updates via mail too, here about your project status, meeting schedules, and more.",
    },
  ],
  Evaluator: [
    {
      icon: ClipboardCheck,
      title: 'Your Evaluation Queue',
      description: "The 'Evaluation Queue' page shows all projects currently assigned to you for review. Important: You can only evaluate projects on the day of the scheduled meeting.",
    },
    {
      icon: FileCheck2,
      title: 'Submit Your Feedback',
      description: "From the project details page, you can submit your recommendation and detailed comments. Use the AI prompts to guide your assessment.",
    },
    {
      icon: History,
      title: 'View Your History',
      description: "The 'My Evaluations' page keeps a record of all the projects you have previously reviewed, allowing you to see your past contributions.",
    },
  ],
  admin: [
     {
      icon: FileCheck2,
      title: 'Oversee All Projects',
      description: "From the 'All Projects' page, you can view, manage, and track every project submission across the university.",
    },
    {
      icon: CalendarClock,
      title: 'Schedule Meetings',
      description: "Use the 'Schedule Meeting' module to assign multiple projects to an IMR evaluation meeting and notify all relevant parties.",
    },
    {
      icon: LineChart,
      title: 'Analyze Data',
      description: "The 'Analytics' dashboard provides a high-level overview of submission trends, funding, and research activity across faculties.",
    },
     {
      icon: Users,
      title: 'Manage Users',
      description: "The 'Manage Users' page allows you to assign roles and permissions to all users in the system.",
    },
  ],
  CRO: [
    {
      icon: FileCheck2,
      title: 'Oversee Faculty Projects',
      description: "Your 'All Projects' and 'Analytics' pages are automatically filtered to show data from your assigned faculties. Use the dropdown filter on these pages to switch between faculties.",
    },
    {
      icon: Award,
      title: 'Manage Claims',
      description: "You can also review and manage all incentive claims submitted by faculty within your assigned faculties from the 'Manage Claims' module.",
    },
    {
      icon: GraduationCap,
      title: 'Get Started',
      description: 'Explore your dashboard to see these features in action. You can always refer to the SOP document for more details.',
    },
  ],
  Principal: [
    {
      icon: FileCheck2,
      title: 'Oversee Institute Projects',
      description: "Your 'All Projects' view is automatically filtered to show every project submitted from your institute, giving you a complete overview.",
    },
    {
      icon: LineChart,
      title: 'Institute Analytics',
      description: "The 'Analytics' dashboard is tailored for your role. Project data is aggregated by Department, allowing you to see which departments are leading in research.",
    },
    {
      icon: GraduationCap,
      title: 'Get Started',
      description: 'Explore your dashboard to see these features in action. You can always refer to the SOP document for more details.',
    },
  ],
  HOD: [
     {
      icon: FileCheck2,
      title: 'Oversee Department Projects',
      description: "Your 'All Projects' view is automatically filtered to show every project submitted from your specific department.",
    },
    {
      icon: LineChart,
      title: 'Department Analytics',
      description: "The 'Analytics' dashboard provides data specifically for your department, allowing you to track submission trends and funding success.",
    },
     {
      icon: GraduationCap,
      title: 'Get Started',
      description: 'Explore your dashboard to see these features in action. You can always refer to the SOP document for more details.',
    },
  ],
  'Super-admin': [
     {
      icon: FileCheck2,
      title: 'Complete Oversight',
      description: "You have access to all projects, users, and claims across the entire university. Your dashboards provide a global view of all activities.",
    },
    {
      icon: ShieldCheck,
      title: 'Manage Modules',
      description: "Use 'Module Management' to dynamically grant or revoke access to any feature for any user, allowing for fine-grained permission control.",
    },
     {
      icon: Users,
      title: 'Manage Users & Roles',
      description: "You have the highest level of control in 'Manage Users', including the ability to assign users to the CRO role and manage their faculty assignments.",
    },
    {
      icon: LineChart,
      title: 'Full Analytics',
      description: "The 'Analytics' dashboard provides a high-level overview of all research activity across the university.",
    },
  ]
};


export function WelcomeTutorial({ user }: WelcomeTutorialProps) {
  const [open, setOpen] = useState(true);
  const { toast } = useToast();

  const handleFinish = async () => {
    setOpen(false);
    const result = await updateUserTutorialStatus(user.uid);
    if (!result.success) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: result.error,
      });
    }
  };

  const getRoleKey = (): keyof typeof tutorialSteps => {
    if (user.role === 'faculty') {
        if (user.designation === 'Principal') return 'Principal';
        if (user.designation === 'HOD') return 'HOD';
        return 'faculty';
    }
    if (user.role === 'admin') return 'admin';
    if (user.role === 'CRO') return 'CRO';
    if (user.role === 'Super-admin') return 'Super-admin';
    if (user.role === 'Evaluator') return 'Evaluator';
    return 'faculty'; // Default fallback
  }

  const steps = tutorialSteps[getRoleKey()];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleFinish() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl text-center">Welcome, {user.name}!</DialogTitle>
          <DialogDescription className="text-center">
            Here’s a quick tour of the features available for your role.
          </DialogDescription>
        </DialogHeader>
        
        <Carousel className="w-full max-w-xs mx-auto">
          <CarouselContent>
            {steps.map((step, index) => (
              <CarouselItem key={index}>
                <div className="p-1">
                  <div className="flex aspect-square items-center justify-center p-6 flex-col text-center">
                    <step.icon className="h-16 w-16 text-primary mb-4" />
                    <h3 className="text-lg font-semibold">{step.title}</h3>
                    <p className="text-sm text-muted-foreground mt-2">{step.description}</p>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>

        <DialogFooter>
          <Button onClick={handleFinish} className="w-full">Get Started</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
