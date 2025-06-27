'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Logo } from '@/components/logo';
import { useToast } from '@/hooks/use-toast';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import type { User } from '@/types';
import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { Skeleton } from '@/components/ui/skeleton';

const profileSetupSchema = z.object({
  faculty: z.string().min(1, 'Please select a faculty.'),
  institute: z.string().min(1, 'Please select an institute.'),
  department: z.string().min(2, 'Department name is required.'),
  misId: z.string().min(1, 'MIS ID is required.'),
  phoneNumber: z.string().min(10, 'A valid 10-digit phone number is required.').max(10, 'A valid 10-digit phone number is required.'),
});

type ProfileSetupFormValues = z.infer<typeof profileSetupSchema>;

const faculties = [
    "Faculty of Engineering & Technology", "Faculty of Diploma Studies", "Faculty of Applied Sciences",
    "Faculty of Computer Applications", "Faculty of Agriculture", "Faculty of Architecture & Planning",
    "Faculty of Design", "Faculty of Fine Arts", "Faculty of Arts", "Faculty of Commerce",
    "Faculty of Social Work", "Faculty of Management Studies", "Faculty of Hotel Management & Catering Technology",
    "Faculty of Law", "Faculty of Medicine", "Faculty of Homoeopathy", "Faculty of Ayurveda",
    "Faculty of Nursing", "Faculty of Pharmacy", "Faculty of Physiotherapy", "Faculty of Public Health",
];

const institutes = [
    "Parul Institute of Engineering & Technology", "Parul Institute of Technology", "Parul Diploma Studies",
    "Parul Institute of Computer Application", "Parul Institute of Applied Sciences", "Parul Institute of Agriculture",
    "Parul Institute of Architecture and Research", "Faculty of Design", "Parul Institute of Fine Arts",
    "Parul Institute of Arts", "Parul Institute of Commerce", "Parul Institute of Social Work",
    "Faculty of Management Studies", "Parul Institute of Hotel Management & Catering Technology",
    "Parul Institute of Law", "Parul Medical College & Hospital", "Jawaharlal Nehru Homoeopathic Medical College",
    "Ahmedabad Homoeopathic Medical College", "Parul Institute of Homoeopathy & Research", "Rajkot Homoeopathic Medical College",
    "Parul Institute of Ayurved", "Parul Institute of Ayurved & Research", "Parul Institute of Nursing",
    "Parul Institute of Pharmacy", "Parul Institute of Pharmacy & Research", "Parul Institute of Physiotherapy",
    "Faculty of Public Health",
];

export default function ProfileSetupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ProfileSetupFormValues>({
    resolver: zodResolver(profileSetupSchema),
    defaultValues: {
      faculty: '',
      institute: '',
      department: '',
      misId: '',
      phoneNumber: '',
    },
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const appUser = { uid: firebaseUser.uid, ...userDoc.data() } as User;
          if (appUser.profileComplete) {
            router.replace('/dashboard');
            return;
          }
          setUser(appUser);
          form.reset({
            faculty: appUser.faculty || '',
            institute: appUser.institute || '',
            department: appUser.department || '',
            misId: appUser.misId || '',
            phoneNumber: appUser.phoneNumber || '',
          });
        } else {
          toast({ variant: 'destructive', title: 'Error', description: 'Could not find user profile.' });
          router.replace('/login');
        }
      } else {
        router.replace('/login');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router, form, toast]);

  const onSubmit = async (data: ProfileSetupFormValues) => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        ...data,
        profileComplete: true,
      });
      
      const updatedUser = { ...user, ...data, profileComplete: true };
      localStorage.setItem('user', JSON.stringify(updatedUser));

      toast({ title: 'Profile Updated!', description: 'Redirecting to your dashboard.' });
      router.push('/dashboard');
    } catch (error) {
      console.error('Profile update error:', error);
      toast({ variant: 'destructive', title: 'Update Failed', description: 'Could not update your profile.' });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (loading || !user) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
            <Card className="w-full max-w-lg">
                <CardHeader>
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-4 w-3/4" />
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-full" /></div>
                    <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-full" /></div>
                    <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-full" /></div>
                    <Skeleton className="h-10 w-full" />
                </CardContent>
            </Card>
        </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-lg">
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-6 flex justify-center">
              <Logo />
            </div>
            <CardTitle className="text-2xl font-bold">Complete Your Profile</CardTitle>
            <CardDescription>
              Please provide the following details to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField name="faculty" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Faculty</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select your faculty" /></SelectTrigger></FormControl><SelectContent>{faculties.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                <FormField name="institute" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Institute</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select your institute" /></SelectTrigger></FormControl><SelectContent>{institutes.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="department" render={({ field }) => (
                  <FormItem><FormLabel>Department</FormLabel><FormControl><Input placeholder="e.g., Computer Science" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="misId" render={({ field }) => (
                  <FormItem><FormLabel>MIS ID</FormLabel><FormControl><Input placeholder="Your MIS ID" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="phoneNumber" render={({ field }) => (
                  <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input type="tel" placeholder="e.g. 9876543210" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save and Continue"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
