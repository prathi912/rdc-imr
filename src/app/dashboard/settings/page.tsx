'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import type { User } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { onAuthStateChanged, type User as FirebaseUser, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from 'firebase/auth';

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  email: z.string().email(),
  faculty: z.string().min(1, 'Please select a faculty.'),
  institute: z.string().min(1, 'Please select an institute.'),
  department: z.string().min(2, 'Department name is required.'),
  misId: z.string().min(1, 'MIS ID is required.'),
  phoneNumber: z.string().min(10, 'A valid 10-digit phone number is required.').max(10, 'A valid 10-digit phone number is required.'),
});
type ProfileFormValues = z.infer<typeof profileSchema>;

const passwordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required.'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters.'),
    confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
});
type PasswordFormValues = z.infer<typeof passwordSchema>;

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


export default function SettingsPage() {
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      email: '',
      faculty: '',
      institute: '',
      department: '',
      misId: '',
      phoneNumber: '',
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
      resolver: zodResolver(passwordSchema),
      defaultValues: {
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
      }
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const appUser = { uid: firebaseUser.uid, ...userDocSnap.data() } as User;
          setUser(appUser);
          profileForm.reset({
            name: appUser.name || '',
            email: appUser.email || '',
            faculty: appUser.faculty || '',
            institute: appUser.institute || '',
            department: appUser.department || '',
            misId: appUser.misId || '',
            phoneNumber: appUser.phoneNumber || '',
          });
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  async function onProfileSubmit(data: ProfileFormValues) {
    if (!user) return;
    setIsSubmittingProfile(true);
    try {
        const userDocRef = doc(db, 'users', user.uid);
        const { email, ...updateData } = data;
        await updateDoc(userDocRef, updateData);
        
        const updatedUser = { ...user, ...updateData };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setUser(updatedUser);

        toast({ title: 'Profile updated successfully!' });
    } catch (error) {
        console.error("Profile update error:", error);
        toast({ variant: 'destructive', title: 'Update Failed', description: 'Could not update your profile.' });
    } finally {
        setIsSubmittingProfile(false);
    }
  }

  async function onPasswordSubmit(data: PasswordFormValues) {
    setIsSubmittingPassword(true);
    const currentUser = auth.currentUser;

    if (!currentUser || !currentUser.email) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'Could not find the current user. Please log in again.',
      });
      setIsSubmittingPassword(false);
      return;
    }

    try {
      const credential = EmailAuthProvider.credential(currentUser.email, data.currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, data.newPassword);

      toast({ title: 'Password updated successfully!' });
      passwordForm.reset();

    } catch (error: any) {
      console.error("Password update error:", error);
      let description = 'Could not update your password. Please try again.';
      if (error.code === 'auth/wrong-password') {
        description = 'The current password you entered is incorrect.';
        passwordForm.setError("currentPassword", { type: "manual", message: description });
      } else if (error.code === 'auth/requires-recent-login') {
        description = 'For security, please log out and sign in again before changing your password.';
      }
      toast({ variant: 'destructive', title: 'Update Failed', description });
    } finally {
      setIsSubmittingPassword(false);
    }
  }

  if (loading) {
    return (
        <div className="container mx-auto py-10">
            <PageHeader title="Settings" description="Manage your account settings and preferences." />
            <div className="mt-8 space-y-8">
                <Card>
                    <CardHeader><CardTitle>Profile</CardTitle><CardDescription>Update your personal information.</CardDescription></CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </CardContent>
                    <CardFooter className="border-t px-6 py-4">
                        <Skeleton className="h-10 w-24" />
                    </CardFooter>
                </Card>
                 <Card>
                    <CardHeader><CardTitle>Password</CardTitle><CardDescription>Change your password.</CardDescription></CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-10 w-full" />
                         <Skeleton className="h-10 w-full" />
                          <Skeleton className="h-10 w-full" />
                    </CardContent>
                     <CardFooter className="border-t px-6 py-4">
                        <Skeleton className="h-10 w-32" />
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Settings" description="Manage your account settings and preferences." />
      <div className="mt-8 space-y-8">
        <Form {...profileForm}>
          <form onSubmit={profileForm.handleSubmit(onProfileSubmit)}>
            <Card>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Update your personal information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={profileForm.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input placeholder="Your name" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={profileForm.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel>Email</FormLabel><FormControl><Input placeholder="Your email" {...field} disabled /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                 <FormField name="faculty" control={profileForm.control} render={({ field }) => (
                  <FormItem><FormLabel>Faculty</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select your faculty" /></SelectTrigger></FormControl><SelectContent>{faculties.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                <FormField name="institute" control={profileForm.control} render={({ field }) => (
                  <FormItem><FormLabel>Institute</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select your institute" /></SelectTrigger></FormControl><SelectContent>{institutes.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                <FormField control={profileForm.control} name="department" render={({ field }) => (
                  <FormItem><FormLabel>Department</FormLabel><FormControl><Input placeholder="e.g., Computer Science" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={profileForm.control} name="misId" render={({ field }) => (
                    <FormItem><FormLabel>MIS ID</FormLabel><FormControl><Input placeholder="Your MIS ID" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={profileForm.control} name="phoneNumber" render={({ field }) => (
                    <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input type="tel" placeholder="e.g. 9876543210" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button type="submit" disabled={isSubmittingProfile}>{isSubmittingProfile ? 'Saving...' : 'Save Changes'}</Button>
              </CardFooter>
            </Card>
          </form>
        </Form>

         <Form {...passwordForm}>
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}>
            <Card>
              <CardHeader>
                <CardTitle>Password</CardTitle>
                <CardDescription>Change your password. Please enter your current password to confirm.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                 <FormField
                  control={passwordForm.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Password</FormLabel>
                      <FormControl><Input type="password" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Separator />
                 <FormField
                  control={passwordForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl><Input type="password" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl><Input type="password" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button type="submit" disabled={isSubmittingPassword}>{isSubmittingPassword ? 'Updating...' : 'Update Password'}</Button>
              </CardFooter>
            </Card>
          </form>
        </Form>
      </div>
    </div>
  );
}
