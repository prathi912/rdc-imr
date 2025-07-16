
'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { PlusCircle } from 'lucide-react';
import type { User, FundingCall, EmrProject } from '@/types';
import { EmrCalendar } from '@/components/emr/emr-calendar';
import { EmrProjectList } from '@/components/emr/emr-project-list';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export default function EmrProjectsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [fundingCalls, setFundingCalls] = useState<FundingCall[]>([]);
  const [emrProjects, setEmrProjects] = useState<EmrProject[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const callsQuery = query(collection(db, 'fundingCalls'), orderBy('deadline', 'desc'));
    const callsUnsubscribe = onSnapshot(callsQuery, (snapshot) => {
      const callsData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FundingCall));
      setFundingCalls(callsData);
    }, (error) => {
      console.error("Error fetching funding calls:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch funding calls.' });
    });

    const projectsQuery = query(collection(db, 'emrProjects'), where('pi_uid', '==', user.uid), orderBy('submissionDate', 'desc'));
    const projectsUnsubscribe = onSnapshot(projectsQuery, (snapshot) => {
      const projectsData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as EmrProject));
      setEmrProjects(projectsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching EMR projects:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch your EMR projects.' });
      setLoading(false);
    });

    return () => {
      callsUnsubscribe();
      projectsUnsubscribe();
    };
  }, [user, toast]);

  return (
    <div className="container mx-auto py-10">
      <PageHeader
        title="Extra-Mural Research (EMR) Projects"
        description="View funding opportunities and manage your external grant proposals."
      >
        <Link href="/dashboard/emr-projects/new">
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            Submit New EMR Proposal
          </Button>
        </Link>
      </PageHeader>
      
      <div className="mt-8">
        <Tabs defaultValue="funding-calls" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="funding-calls">Funding Opportunities</TabsTrigger>
            <TabsTrigger value="my-proposals">My EMR Proposals ({emrProjects.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="funding-calls" className="mt-4">
            <EmrCalendar calls={fundingCalls} loading={loading} />
          </TabsContent>
          <TabsContent value="my-proposals" className="mt-4">
            <EmrProjectList projects={emrProjects} loading={loading} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
