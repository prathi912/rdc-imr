
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import type { User, IncentiveClaim } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Book, Award, Presentation, FileText, UserPlus, Banknote } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
    
    const getClaimTitle = (claim: IncentiveClaim): string => {
        return claim.paperTitle || claim.patentTitle || claim.conferencePaperTitle || claim.publicationTitle || claim.professionalBodyName || claim.apcPaperTitle || 'Untitled Claim';
    };

    return (
        <div className="space-y-4">
            {claims.map(claim => (
                 <Card key={claim.id}>
                    <CardContent className="p-4 flex justify-between items-start gap-4">
                         <div className="flex-1 space-y-1">
                            <Badge variant="outline">{claim.claimType}</Badge>
                            <p className="font-semibold">{getClaimTitle(claim)}</p>
                            {claim.journalName && <p className="text-sm text-muted-foreground">Journal: {claim.journalName}</p>}
                            {claim.conferenceName && <p className="text-sm text-muted-foreground">Conference: {claim.conferenceName}</p>}
                            <p className="text-sm text-muted-foreground pt-1">Submitted: {new Date(claim.submissionDate).toLocaleDateString()}</p>
                        </div>
                        <Badge variant={claim.status === 'Accepted' ? 'default' : claim.status === 'Rejected' ? 'destructive' : 'secondary'}>{claim.status}</Badge>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

const claimTypes = [
  {
    title: 'Research Papers',
    description: 'Claim incentives for papers published in WoS/Scopus indexed journals.',
    href: '/dashboard/incentive-claim/research-paper',
    icon: FileText,
  },
  {
    title: 'Patents',
    description: 'Claim incentives for filed, published, or granted patents.',
    href: '/dashboard/incentive-claim/patent',
    icon: Award,
  },
  {
    title: 'Conference Presentations',
    description: 'Get assistance for presenting papers at events.',
    href: '/dashboard/incentive-claim/conference',
    icon: Presentation,
  },
  {
    title: 'Books & Chapters',
    description: 'Claim incentives for publishing books or book chapters.',
    href: '/dashboard/incentive-claim/book',
    icon: Book,
  },
  {
    title: 'Professional Body Memberships',
    description: 'Claim 50% of the fee for one membership per year.',
    href: '/dashboard/incentive-claim/membership',
    icon: UserPlus,
  },
  {
    title: 'Seed Money for APC',
    description: 'Claim reimbursement for Article Processing Charges after publication.',
    href: '/dashboard/incentive-claim/apc',
    icon: Banknote,
  },
];


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
        description="Select a category to apply for an incentive, or view your existing claims below."
        showBackButton={false}
      />
      <div className="mt-8">
        <Tabs defaultValue="apply" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="apply">Apply for Incentive</TabsTrigger>
            <TabsTrigger value="pending">Pending ({pendingClaims.length})</TabsTrigger>
            <TabsTrigger value="accepted">Accepted ({acceptedClaims.length})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({rejectedClaims.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="apply" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {claimTypes.map(claim => (
                <Link href={claim.href} key={claim.href} className="flex">
                  <Card className="flex flex-col w-full hover:bg-accent/50 dark:hover:bg-accent/20 transition-colors">
                    <CardHeader>
                      <claim.icon className="h-7 w-7 mb-2 text-primary" />
                      <CardTitle>{claim.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-grow">
                      <p className="text-sm text-muted-foreground">{claim.description}</p>
                    </CardContent>
                    <CardFooter>
                      <div className="text-sm font-semibold text-primary">
                        Apply Now <ArrowRight className="inline-block ml-1 h-4 w-4" />
                      </div>
                    </CardFooter>
                  </Card>
                </Link>
              ))}
            </div>
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
