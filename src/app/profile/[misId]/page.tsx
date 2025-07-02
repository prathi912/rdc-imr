'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '@/lib/config';
import type { User, IncentiveClaim, Project } from '@/types';
import { PageHeader } from '@/components/page-header';
import { ProfileClient } from '@/components/profile/profile-client';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export default function ProfilePage() {
  const params = useParams();
  const misId = params.misId as string;
  const [user, setUser] = useState<User | null>(null);
  const [claims, setClaims] = useState<IncentiveClaim[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!misId) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch user by MIS ID
        const usersRef = collection(db, 'users');
        const userQuery = query(usersRef, where('misId', '==', misId), limit(1));
        const userSnapshot = await getDocs(userQuery);

        if (userSnapshot.empty) {
          setError('User not found.');
          setLoading(false);
          return;
        }

        const fetchedUser = { uid: userSnapshot.docs[0].id, ...userSnapshot.docs[0].data() } as User;
        setUser(fetchedUser);

        // Fetch user's incentive claims
        const claimsRef = collection(db, 'incentiveClaims');
        const claimsQuery = query(claimsRef, where('uid', '==', fetchedUser.uid), orderBy('submissionDate', 'desc'));
        const claimsSnapshot = await getDocs(claimsQuery);
        const fetchedClaims = claimsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IncentiveClaim));
        setClaims(fetchedClaims);

        // Fetch user's projects
        const projectsRef = collection(db, 'projects');
        const projectsQuery = query(projectsRef, where('pi_uid', '==', fetchedUser.uid), orderBy('submissionDate', 'desc'));
        const projectsSnapshot = await getDocs(projectsQuery);
        const fetchedProjects = projectsSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as Project))
            .filter(p => p.status !== 'Draft');
        setProjects(fetchedProjects);

      } catch (err) {
        setError('Failed to load profile data.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [misId]);

  if (loading) {
    return (
      <div className="container mx-auto max-w-5xl py-10">
        <PageHeader title="Loading Profile..." description="Please wait..." showBackButton={true} backButtonHref="/dashboard" />
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-1">
                <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
            </div>
            <div className="md:col-span-2 space-y-8">
                 <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
                 <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
            </div>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="container mx-auto max-w-5xl py-10">
        <PageHeader title="Error" description={error || 'Could not load profile.'} showBackButton={true} backButtonHref="/dashboard" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl py-10">
      <PageHeader
        title={`${user.name}'s Profile`}
        description="Public research profile and contributions."
        showBackButton={false}
      />
      <div className="mt-8">
        <ProfileClient user={user} claims={claims} projects={projects} />
      </div>
    </div>
  );
}
