'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { collection, query, where, getDocs, limit, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/config';
import type { User, IncentiveClaim, Project } from '@/types';
import { PageHeader } from '@/components/page-header';
import { ProfileClient } from '@/components/profile/profile-client';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export default function ProfilePage() {
  const params = useParams();
  const misId = params.misId as string;
  
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [claims, setClaims] = useState<IncentiveClaim[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<User | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
        setSessionUser(JSON.parse(storedUser));
    } else {
        // If there's no user, we can't fetch anything. Let rules handle it or show error early.
        setLoading(false);
        setError("You must be logged in to view profiles.");
    }
  }, []);

  useEffect(() => {
    if (!misId || !sessionUser) {
      return; // Wait for session user to be loaded
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        let fetchedUser: User | null = null;
        const isAdmin = ['Super-admin', 'admin', 'CRO'].includes(sessionUser.role);

        if (isAdmin) {
          // Admins can query by misId, this is allowed by `list` security rule
          const usersRef = collection(db, 'users');
          const userQuery = query(usersRef, where('misId', '==', misId), limit(1));
          const userSnapshot = await getDocs(userQuery);
          if (!userSnapshot.empty) {
            fetchedUser = { uid: userSnapshot.docs[0].id, ...userSnapshot.docs[0].data() } as User;
          }
        } else {
          // Non-admins can only view their own profile.
          if (sessionUser.misId === misId) {
            // Fetch directly by UID, this is allowed by `get` security rule
            const userRef = doc(db, 'users', sessionUser.uid);
            const userSnapshot = await getDoc(userRef);
            if (userSnapshot.exists()) {
              fetchedUser = { uid: userSnapshot.id, ...userSnapshot.data() } as User;
            }
          } else {
            // Trying to view someone else's profile
            throw new Error("Access Denied: You do not have permission to view this profile.");
          }
        }

        if (!fetchedUser) {
          throw new Error('User not found.');
        }
        
        setProfileUser(fetchedUser);

        // Fetch user's incentive claims (assuming admins can read all claims, and users their own)
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

      } catch (err: any) {
        if (err.code === 'permission-denied') {
            setError("Access Denied: You do not have permission to view this profile.");
        } else {
            setError(err.message || 'Failed to load profile data.');
        }
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [misId, sessionUser]);

  if (loading) {
    return (
      <div className="container mx-auto max-w-7xl py-10">
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

  if (error || !profileUser) {
    return (
      <div className="container mx-auto max-w-7xl py-10">
        <PageHeader title="Error" description={error || 'Could not load profile.'} showBackButton={true} backButtonHref="/dashboard" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl py-10">
      <PageHeader
        title={`${profileUser.name}'s Profile`}
        description="Public research profile and contributions."
        showBackButton={false}
      />
      <div className="mt-8">
        <ProfileClient user={profileUser} claims={claims} projects={projects} />
      </div>
    </div>
  );
}
