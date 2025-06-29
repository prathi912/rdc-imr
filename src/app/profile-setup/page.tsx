
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
import { uploadFileToServer } from '@/app/actions';
import type { User, UserBankDetails } from '@/types';
import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';

const profileSetupSchema = z.object({
  // Profile
  faculty: z.string().min(1, 'Please select a faculty.'),
  institute: z.string().min(1, 'Please select an institute.'),
  department: z.string().min(2, 'Department name is required.'),
  designation: z.string().min(2, 'Designation is required.'),
  misId: z.string().min(1, 'MIS ID is required.'),
  phoneNumber: z.string().min(10, 'A valid 10-digit phone number is required.').max(10, 'A valid 10-digit phone number is required.'),
  // Bank Details
  beneficiaryName: z.string().min(2, "Beneficiary's name is required."),
  accountNumber: z.string().min(5, "A valid account number is required."),
  bankName: z.string().min(1, "Please select a bank."),
  branchName: z.string().min(2, "Branch name is required."),
  city: z.string().min(2, "City is required."),
  ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code format."),
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

const salaryBanks = ["AU Bank", "HDFC Bank", "Central Bank of India"];

const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};

export default function ProfileSetupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profilePicFile, setProfilePicFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const form = useForm<ProfileSetupFormValues>({
    resolver: zodResolver(profileSetupSchema),
    defaultValues: {
      faculty: '',
      institute: '',
      department: '',
      designation: '',
      misId: '',
      phoneNumber: '',
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
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const appUser = { uid: firebaseUser.uid, ...userDoc.data() } as User;
          if (appUser.profileComplete) {
            router.replace('/dashboard');
            return;
          }
          setUser(appUser);
          setPreviewUrl(appUser.photoURL || null);
          form.reset({
            faculty: appUser.faculty || '',
            institute: appUser.institute || '',
            department: appUser.department || '',
            designation: appUser.designation || '',
            misId: appUser.misId || '',
            phoneNumber: appUser.phoneNumber || '',
            beneficiaryName: appUser.bankDetails?.beneficiaryName || '',
            accountNumber: appUser.bankDetails?.accountNumber || '',
            bankName: appUser.bankDetails?.bankName || '',
            branchName: appUser.bankDetails?.branchName || '',
            city: appUser.bankDetails?.city || '',
            ifscCode: appUser.bankDetails?.ifscCode || '',
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        setProfilePicFile(file);
        setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const onSubmit = async (data: ProfileSetupFormValues) => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      let photoURL = user.photoURL || '';

      if (profilePicFile) {
        const dataUrl = await fileToDataUrl(profilePicFile);
        const path = `profile-pictures/${user.uid}`;
        const result = await uploadFileToServer(dataUrl, path);
        if (!result.success || !result.url) {
            throw new Error(result.error || "File upload failed");
        }
        photoURL = result.url;
      }
      
      const bankDetails: UserBankDetails = {
          bankName: data.bankName,
          accountNumber: data.accountNumber,
          beneficiaryName: data.beneficiaryName,
          city: data.city,
          branchName: data.branchName,
          ifscCode: data.ifscCode,
      };

      const updateData = {
        faculty: data.faculty,
        institute: data.institute,
        department: data.department,
        designation: data.designation,
        misId: data.misId,
        phoneNumber: data.phoneNumber,
        photoURL: photoURL,
        profileComplete: true,
        bankDetails: bankDetails,
      };

      await updateDoc(userDocRef, updateData);
      
      const updatedUser = { ...user, ...updateData };
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
                <div className="flex flex-col items-center space-y-4 pt-4 pb-6">
                    <Avatar className="h-24 w-24">
                        <AvatarImage src={previewUrl || undefined} alt={user.name} />
                        <AvatarFallback>{user.name?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                    </Avatar>
                    <FormControl>
                        <Input id="picture" type="file" onChange={handleFileChange} accept="image/png, image/jpeg" className="max-w-xs" />
                    </FormControl>
                </div>
                
                <h3 className="text-lg font-semibold border-t pt-4">Academic Details</h3>
                <FormField name="faculty" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Faculty</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select your faculty" /></SelectTrigger></FormControl><SelectContent>{faculties.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                <FormField name="institute" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Institute</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select your institute" /></SelectTrigger></FormControl><SelectContent>{institutes.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="department" render={({ field }) => (
                  <FormItem><FormLabel>Department</FormLabel><FormControl><Input placeholder="e.g., Computer Science" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="designation" render={({ field }) => (
                  <FormItem><FormLabel>Designation</FormLabel><FormControl><Input placeholder="e.g., Professor" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="misId" render={({ field }) => (
                  <FormItem><FormLabel>MIS ID</FormLabel><FormControl><Input placeholder="Your MIS ID" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="phoneNumber" render={({ field }) => (
                  <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input type="tel" placeholder="e.g. 9876543210" {...field} /></FormControl><FormMessage /></FormItem>
                )} />

                <h3 className="text-lg font-semibold border-t pt-4">Salary Bank Account Details</h3>
                <p className="text-sm text-muted-foreground -mt-3">These details are required for incentive claims.</p>
                <FormField name="beneficiaryName" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Beneficiary Name</FormLabel><FormControl><Input placeholder="Name as per bank records" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="accountNumber" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Account Number</FormLabel><FormControl><Input placeholder="Your bank account number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="bankName" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Bank Name</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select your bank" /></SelectTrigger></FormControl><SelectContent>{salaryBanks.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField name="branchName" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Branch Name</FormLabel><FormControl><Input placeholder="e.g., Akota" {...field} /></FormControl><FormMessage /></FormItem> )} />
                  <FormField name="city" control={form.control} render={({ field }) => ( <FormItem><FormLabel>City</FormLabel><FormControl><Input placeholder="e.g., Vadodara" {...field} /></FormControl><FormMessage /></FormItem> )} />
                </div>
                <FormField name="ifscCode" control={form.control} render={({ field }) => ( <FormItem><FormLabel>IFSC Code</FormLabel><FormControl><Input placeholder="e.g., HDFC0000001" {...field} /></FormControl><FormMessage /></FormItem> )} />
                
                <Button type="submit" className="w-full !mt-8" disabled={isSubmitting}>
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
