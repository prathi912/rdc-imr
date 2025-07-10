
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

        // Always fetch the target profile by MIS ID first to get their UID
        const usersRef = collection(db, 'users');
        const userQuery = query(usersRef, where('misId', '==', misId), limit(1));
        const userSnapshot = await getDocs(userQuery);
        
        if (userSnapshot.empty) {
            throw new Error('User not found.');
        }

        const targetUserDoc = userSnapshot.docs[0];
        fetchedUser = { uid: targetUserDoc.id, ...targetUserDoc.data() } as User;

        // Now, verify if the session user has permission to view this profile.
        // They are either an admin, or they are the owner of the profile.
        const isOwner = sessionUser.uid === fetchedUser.uid;

        if (!isAdmin && !isOwner) {
            throw new Error("Access Denied: You do not have permission to view this profile.");
        }
        
        setProfileUser(fetchedUser);

        // Fetch user's incentive claims (assuming admins can read all claims, and users their own)
        const claimsRef = collection(db, 'incentiveClaims');
        const claimsQuery = query(claimsRef, where('uid', '==', fetchedUser.uid), orderBy('submissionDate', 'desc'));
        const claimsSnapshot = await getDocs(claimsQuery);
        const fetchedClaims = claimsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IncentiveClaim));
        setClaims(fetchedClaims);

        // Fetch user's projects (as PI or Co-PI)
        const projectsRef = collection(db, 'projects');
        const piProjectsQuery = query(projectsRef, where('pi_uid', '==', fetchedUser.uid));
        const coPiProjectsQuery = query(projectsRef, where('coPiUids', 'array-contains', fetchedUser.uid));

        const [piProjectsSnapshot, coPiProjectsSnapshot] = await Promise.all([
          getDocs(piProjectsQuery),
          getDocs(coPiProjectsQuery)
        ]);
        
        const allProjects: Project[] = [];
        const projectIds = new Set<string>();

        piProjectsSnapshot.forEach(doc => {
            if (!projectIds.has(doc.id)) {
                allProjects.push({ id: doc.id, ...doc.data() } as Project);
                projectIds.add(doc.id);
            }
        });

        coPiProjectsSnapshot.forEach(doc => {
            if (!projectIds.has(doc.id)) {
                allProjects.push({ id: doc.id, ...doc.data() } as Project);
                projectIds.add(doc.id);
            }
        });

        const sortedProjects = allProjects
            .filter(p => p.status !== 'Draft')
            .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime());
        
        setProjects(sortedProjects);

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
