
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import type { User, IncentiveClaim } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, orderBy, addDoc, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Book, Award, Presentation, FileText, UserPlus, Banknote, Users, CheckSquare, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';


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

const coAuthorApplySchema = z.object({
    publicationOrderInYear: z.enum(['First', 'Second', 'Third'], {
        required_error: 'Please select the publication order for this year.',
    }),
});

type CoAuthorApplyValues = z.infer<typeof coAuthorApplySchema>;

function CoAuthorClaimsList({ claims, currentUser, onClaimApplied }: { claims: IncentiveClaim[], currentUser: User | null, onClaimApplied: () => void }) {
    const { toast } = useToast();
    const [claimToApply, setClaimToApply] = useState<IncentiveClaim | null>(null);
    const [isApplying, setIsApplying] = useState(false);

    const form = useForm<CoAuthorApplyValues>({
        resolver: zodResolver(coAuthorApplySchema),
    });
    
    const handleApply = async (values: CoAuthorApplyValues) => {
        if (!claimToApply || !currentUser || !currentUser.bankDetails) {
            toast({ variant: 'destructive', title: 'Action Required', description: 'Please complete your bank details in settings before applying.' });
            return;
        }
        setIsApplying(true);
        try {
            const { id, uid, userName, userEmail, status, submissionDate, publicationOrderInYear, ...originalClaimData } = claimToApply;

            const newClaim: Omit<IncentiveClaim, 'id'> = {
                ...originalClaimData,
                publicationOrderInYear: values.publicationOrderInYear,
                originalClaimId: id,
                uid: currentUser.uid,
                userName: currentUser.name,
                userEmail: currentUser.email,
                status: 'Pending',
                submissionDate: new Date().toISOString(),
                bankDetails: currentUser.bankDetails,
            };
            
            await addDoc(collection(db, 'incentiveClaims'), newClaim);

            // Update the status on the original claim for this co-author
            const originalClaimRef = doc(db, 'incentiveClaims', claimToApply.id);
            const updatedCoAuthors = claimToApply.bookCoAuthors?.map(author => 
                author.uid === currentUser.uid ? { ...author, status: 'Applied' } : author
            );
            await updateDoc(originalClaimRef, { bookCoAuthors: updatedCoAuthors });
            
            toast({ title: 'Success', description: 'Your claim has been submitted based on the original publication details.' });
            setClaimToApply(null);
            onClaimApplied();
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message || 'Could not submit your claim.' });
        } finally {
            setIsApplying(false);
        }
    };
    
    if (claims.length === 0) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">You have not been listed as a co-author on any book incentive claims yet.</p>
                </CardContent>
            </Card>
        );
    }
    
    const getMyCoAuthorDetails = (claim: IncentiveClaim) => {
        return claim.bookCoAuthors?.find(a => a.uid === currentUser?.uid);
    }

    return (
      <>
        <div className="space-y-4">
            {claims.map(claim => {
                 const myDetails = getMyCoAuthorDetails(claim);
                 const myStatus = myDetails?.status;
                 const canApply = myStatus === 'Pending';

                return (
                 <Card key={claim.id}>
                    <CardContent className="p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                         <div className="flex-1 space-y-2">
                            <p className="font-semibold">{claim.publicationTitle}</p>
                            <p className="text-sm text-muted-foreground">Primary Author: <span className="font-medium text-foreground">{claim.userName}</span></p>
                             <div className="flex items-center gap-2">
                                <Badge variant="outline">{claim.bookApplicationType}</Badge>
                                {myStatus === 'Applied' && <Badge variant="default"><CheckSquare className="h-4 w-4 mr-2"/> Applied</Badge>}
                             </div>
                        </div>
                        <Button onClick={() => setClaimToApply(claim)} disabled={!canApply}>
                            {canApply ? 'View & Apply' : 'Applied'}
                        </Button>
                    </CardContent>
                </Card>
            )})}
        </div>
        {claimToApply && (
            <Dialog open={!!claimToApply} onOpenChange={() => setClaimToApply(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Apply for Co-Author Incentive</DialogTitle>
                        <p className="text-sm text-muted-foreground pt-2">
                           You are applying for an incentive for the publication: "{claimToApply.publicationTitle}". Please confirm the publication order for your records.
                        </p>
                    </DialogHeader>
                    <Form {...form}>
                         <form id="co-author-apply-form" onSubmit={form.handleSubmit(handleApply)} className="space-y-4 py-4">
                            <FormField
                                control={form.control}
                                name="publicationOrderInYear"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Is this your First/Second/Third Chapter/Book in the calendar year?</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select publication order" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="First">First</SelectItem>
                                                <SelectItem value="Second">Second</SelectItem>
                                                <SelectItem value="Third">Third</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                         </form>
                    </Form>
                    <p className="text-xs text-muted-foreground">This action will create a new incentive claim under your name using the publication details from the original author's submission.</p>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                        <Button type="submit" form="co-author-apply-form" disabled={isApplying}>
                           {isApplying ? <><Loader2 className="h-4 w-4 animate-spin mr-2"/> Submitting...</> : 'Confirm & Apply'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )}
      </>
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
  const [coAuthorClaims, setCoAuthorClaims] = useState<IncentiveClaim[]>([]);
  const { toast } = useToast();

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
  
  const fetchCoAuthorClaims = async (uid: string) => {
    try {
        const claimsRef = collection(db, 'incentiveClaims');
        const q = query(claimsRef, where('coAuthorUids', 'array-contains', uid));
        const snapshot = await getDocs(q);
        
        const claims = snapshot.docs
            .map(doc => ({...doc.data(), id: doc.id} as IncentiveClaim))
            .filter(claim => 
                claim.bookCoAuthors?.some(author => author.uid === uid && author.status === 'Pending')
            );
        
        setCoAuthorClaims(claims);
    } catch (error) {
        console.error("Error fetching co-author claims:", error);
    }
  };
  
  const fetchAllData = (uid: string) => {
      fetchUserClaims(uid);
      fetchCoAuthorClaims(uid);
  }

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      fetchAllData(parsedUser.uid);
    } else {
        setLoading(false);
    }
  }, []);

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
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="apply">Apply for Incentive</TabsTrigger>
            <TabsTrigger value="co-author">Co-Author Claims ({coAuthorClaims.length})</TabsTrigger>
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
          <TabsContent value="co-author">
            {loading ? <Skeleton className="h-40 w-full" /> : <CoAuthorClaimsList claims={coAuthorClaims} currentUser={user} onClaimApplied={() => fetchAllData(user!.uid)} />}
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
