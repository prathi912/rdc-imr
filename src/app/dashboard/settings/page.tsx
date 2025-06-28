
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
import { db, auth, storage } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { User } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { onAuthStateChanged, type User as FirebaseUser, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from 'firebase/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Banknote } from 'lucide-react';

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  email: z.string().email(),
  faculty: z.string().min(1, 'Please select a faculty.'),
  institute: z.string().min(1, 'Please select an institute.'),
  department: z.string().min(2, 'Department name is required.'),
  designation: z.string().min(1, 'Please select a designation.'),
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

const bankDetailsSchema = z.object({
  beneficiaryName: z.string().min(2, "Beneficiary's name is required."),
  accountNumber: z.string().min(5, "A valid account number is required."),
  bankName: z.string().min(1, "Please select a bank."),
  branchName: z.string().min(2, "Branch name is required."),
  city: z.string().min(2, "City is required."),
  ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code format."),
});
type BankDetailsFormValues = z.infer<typeof bankDetailsSchema>;

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

const salaryBanks = ["AU Bank", "HDFC Bank", "Central Bank of India"];

const designations = ["Professor", "Associate Professor", "Assistant Professor", "Lecturer", "Head of Department", "Dean", "Research Associate"];

export default function SettingsPage() {
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [isSubmittingBank, setIsSubmittingBank] = useState(false);
  const [profilePicFile, setProfilePicFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      email: '',
      faculty: '',
      institute: '',
      department: '',
      designation: '',
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
  
  const bankForm = useForm<BankDetailsFormValues>({
    resolver: zodResolver(bankDetailsSchema),
    defaultValues: {
      beneficiaryName: '',
      accountNumber: '',
      bankName: '',
      branchName: '',
      city: '',
      ifscCode: '',
    },
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const appUser = { uid: firebaseUser.uid, ...userDocSnap.data() } as User;
          setUser(appUser);
          setPreviewUrl(appUser.photoURL || null);
          profileForm.reset({
            name: appUser.name || '',
            email: appUser.email || '',
            faculty: appUser.faculty || '',
            institute: appUser.institute || '',
            department: appUser.department || '',
            designation: appUser.designation || '',
            misId: appUser.misId || '',
            phoneNumber: appUser.phoneNumber || '',
          });
          if (appUser.bankDetails) {
            bankForm.reset(appUser.bankDetails);
          }
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
  
  async function onBankDetailsSubmit(data: BankDetailsFormValues) {
    if (!user) return;
    setIsSubmittingBank(true);
    try {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, { bankDetails: data });
        
        const updatedUser = { ...user, bankDetails: data };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setUser(updatedUser);

        toast({ title: 'Bank details updated successfully!' });
    } catch (error) {
        console.error("Bank details update error:", error);
        toast({ variant: 'destructive', title: 'Update Failed', description: 'Could not update your bank details.' });
    } finally {
        setIsSubmittingBank(false);
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
      if (error.code === 'auth/invalid-credential') {
        passwordForm.setError("currentPassword", {
            type: "manual",
            message: "The current password you entered is incorrect."
        });
      } else if (error.code === 'auth/requires-recent-login') {
        toast({
            variant: 'destructive',
            title: 'Update Failed',
            description: 'For security, please log out and sign in again before changing your password.'
        });
      } else {
        toast({
            variant: 'destructive',
            title: 'Update Failed',
            description: 'Could not update your password. Please try again.'
        });
      }
    } finally {
      setIsSubmittingPassword(false);
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        setProfilePicFile(file);
        setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handlePictureUpdate = async () => {
    if (!profilePicFile || !user) return;
    setIsUploading(true);
    try {
        const storageRef = ref(storage, `profile-pictures/${user.uid}`);
        await uploadBytes(storageRef, profilePicFile);
        const photoURL = await getDownloadURL(storageRef);

        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, { photoURL });

        const updatedUser = { ...user, photoURL };
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));

        toast({ title: 'Profile picture updated!' });
        setProfilePicFile(null);
    } catch (error) {
        console.error("Error updating profile picture: ", error);
        toast({ variant: 'destructive', title: 'Update Failed', description: 'Could not update your profile picture.' });
    } finally {
        setIsUploading(false);
    }
  };


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
        <Card>
          <CardHeader>
            <CardTitle>Profile Picture</CardTitle>
            <CardDescription>Update your profile picture.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-6">
            <Avatar className="h-20 w-20">
              <AvatarImage src={previewUrl || user?.photoURL || undefined} alt={user?.name || ''} />
              <AvatarFallback>{user?.name?.[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="space-y-2">
                <Input id="picture" type="file" onChange={handleFileChange} accept="image/png, image/jpeg" className="max-w-xs" />
                <p className="text-xs text-muted-foreground">PNG or JPG. 2MB max.</p>
            </div>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button onClick={handlePictureUpdate} disabled={isUploading || !profilePicFile}>
              {isUploading ? 'Uploading...' : 'Save Picture'}
            </Button>
          </CardFooter>
        </Card>

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
                <FormField name="designation" control={profileForm.control} render={({ field }) => (
                  <FormItem><FormLabel>Designation</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select your designation" /></SelectTrigger></FormControl><SelectContent>{designations.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
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
        
        <Form {...bankForm}>
          <form onSubmit={bankForm.handleSubmit(onBankDetailsSubmit)}>
            <Card>
              <CardHeader>
                 <div className="flex items-center gap-2">
                    <Banknote />
                    <CardTitle>Salary Bank Account Details</CardTitle>
                </div>
                <CardDescription>This information is required for incentive claims and grant disbursal.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                 <FormField name="beneficiaryName" control={bankForm.control} render={({ field }) => ( <FormItem><FormLabel>Beneficiary Name</FormLabel><FormControl><Input placeholder="Name as per bank records" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="accountNumber" control={bankForm.control} render={({ field }) => ( <FormItem><FormLabel>Account Number</FormLabel><FormControl><Input placeholder="Your bank account number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="bankName" control={bankForm.control} render={({ field }) => ( <FormItem><FormLabel>Bank Name</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select your bank" /></SelectTrigger></FormControl><SelectContent>{salaryBanks.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField name="branchName" control={bankForm.control} render={({ field }) => ( <FormItem><FormLabel>Branch Name</FormLabel><FormControl><Input placeholder="e.g., Akota" {...field} /></FormControl><FormMessage /></FormItem> )} />
                  <FormField name="city" control={bankForm.control} render={({ field }) => ( <FormItem><FormLabel>City</FormLabel><FormControl><Input placeholder="e.g., Vadodara" {...field} /></FormControl><FormMessage /></FormItem> )} />
                </div>
                <FormField name="ifscCode" control={bankForm.control} render={({ field }) => ( <FormItem><FormLabel>IFSC Code</FormLabel><FormControl><Input placeholder="e.g., HDFC0000001" {...field} /></FormControl><FormMessage /></FormItem> )} />
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button type="submit" disabled={isSubmittingBank}>{isSubmittingBank ? 'Saving...' : 'Save Bank Details'}</Button>
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
