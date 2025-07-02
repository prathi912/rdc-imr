
'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IncentiveForm } from '@/components/incentives/incentive-form';
import { Card, CardContent } from '@/components/ui/card';
import type { User, IncentiveClaim } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

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
                    <CardContent className="p-4 flex justify-between items-start">
                         <div>
                            <p className="font-semibold">{claim.paperTitle || claim.patentTitle || claim.conferencePaperTitle || claim.publicationTitle}</p>
                            {claim.journalName && <p className="text-sm text-muted-foreground">Journal: {claim.journalName}</p>}
                            {claim.conferenceName && <p className="text-sm text-muted-foreground">Conference: {claim.conferenceName}</p>}
                            <p className="text-sm text-muted-foreground">Submitted: {new Date(claim.submissionDate).toLocaleDateString()}</p>
                        </div>
                        <Badge variant={claim.status === 'Accepted' ? 'default' : claim.status === 'Rejected' ? 'destructive' : 'secondary'}>{claim.status}</Badge>
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
  const { toast } = useToast();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      fetchUserClaims(parsedUser.uid);
    } else {
        setLoading(false);
    }
  }, []);

  const fetchUserClaims = async (uid: string) => {
      setLoading(true);
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
          setLoading(false);
      }
  };

  const pendingClaims = userClaims.filter(c => c.status === 'Pending');
  const acceptedClaims = userClaims.filter(c => c.status === 'Accepted');
  const rejectedClaims = userClaims.filter(c => c.status === 'Rejected');

  return (
    <div className="container mx-auto max-w-5xl py-10">
      <PageHeader
        title="Incentive Claim Portal"
        description="Submit your claims for publication incentives and track their status."
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
             {loading ? <Skeleton className="h-40 w-full" /> : <UserClaimsList claims={pendingClaims} />}
          </TabsContent>
          <TabsContent value="accepted">
            {loading ? <Skeleton className="h-40 w-full" /> : <UserClaimsList claims={acceptedClaims} />}
          </TabsContent>
          <TabsContent value="rejected">
            {loading ? <Skeleton className="h-40 w-full" /> : <UserClaimsList claims={rejectedClaims} />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
