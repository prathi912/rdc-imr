'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IncentiveForm } from '@/components/incentives/incentive-form';
import { IncentiveClaimsList } from '@/components/incentives/incentive-claims-list';
import { Card, CardContent } from '@/components/ui/card';
import type { User, IncentiveClaim } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

function UserClaimsList({ claims }: { claims: IncentiveClaim[] }) {
    if (claims.length === 0) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">You have no claims with this status.</p>
                </CardContent>
            </Card>
        );
    }
    return (
        <div className="space-y-4">
            {claims.map(claim => (
                <Card key={claim.id}>
                    <CardContent className="pt-6">
                        <p className="font-semibold">{claim.paperTitle}</p>
                        <p className="text-sm text-muted-foreground">Submitted: {new Date(claim.submissionDate).toLocaleDateString()}</p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

export default function IncentiveClaimPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userClaims, setUserClaims] = useState<IncentiveClaim[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      if (parsedUser.role === 'faculty') {
        fetchUserClaims(parsedUser.uid);
      }
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchUserClaims = async (uid: string) => {
      setClaimsLoading(true);
      try {
          const claimsCollection = collection(db, 'incentiveClaims');
          const q = query(claimsCollection, where('uid', '==', uid), orderBy('submissionDate', 'desc'));
          const claimSnapshot = await getDocs(q);
          const claimList = claimSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as IncentiveClaim));
          setUserClaims(claimList);
      } catch (error) {
          console.error("Error fetching user claims:", error);
          toast({ variant: 'destructive', title: "Error", description: "Could not fetch your claims." });
      } finally {
          setClaimsLoading(false);
      }
  };

  if (loading) {
    return (
       <div className="container mx-auto max-w-5xl py-10">
        <PageHeader title="Loading..." description="..." showBackButton={false} />
        <div className="mt-8"> <Skeleton className="h-96 w-full" /> </div>
      </div>
    );
  }

  const isSuperAdmin = user?.role === 'Super-admin';

  if (isSuperAdmin) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Manage Incentive Claims" description="Review and manage all submitted incentive claims." showBackButton={false} />
        <div className="mt-8">
          <IncentiveClaimsList />
        </div>
      </div>
    );
  }
  
  const pendingClaims = userClaims.filter(c => c.status === 'Pending');
  const acceptedClaims = userClaims.filter(c => c.status === 'Accepted');
  const rejectedClaims = userClaims.filter(c => c.status === 'Rejected');

  return (
    <div className="container mx-auto max-w-5xl py-10">
      <PageHeader
        title="Paper Publication Incentive Claim"
        description="Submit your claim for a paper publication incentive."
        showBackButton={false}
      />
      <div className="mt-8">
        <Tabs defaultValue="apply" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="apply">Apply</TabsTrigger>
            <TabsTrigger value="pending">Pending ({pendingClaims.length})</TabsTrigger>
            <TabsTrigger value="accepted">Accepted ({acceptedClaims.length})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({rejectedClaims.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="apply">
            <IncentiveForm />
          </TabsContent>
          <TabsContent value="pending">
             {claimsLoading ? <Skeleton className="h-40 w-full" /> : <UserClaimsList claims={pendingClaims} />}
          </TabsContent>
          <TabsContent value="accepted">
            {claimsLoading ? <Skeleton className="h-40 w-full" /> : <UserClaimsList claims={acceptedClaims} />}
          </TabsContent>
          <TabsContent value="rejected">
            {claimsLoading ? <Skeleton className="h-40 w-full" /> : <UserClaimsList claims={rejectedClaims} />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
