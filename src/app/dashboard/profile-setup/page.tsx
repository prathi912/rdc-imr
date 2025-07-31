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
import { auth, db } from '@/lib/config';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { uploadFileToServer, checkMisIdExists, fetchOrcidData } from '@/app/actions';
import type { User } from '@/types';
import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Bot, Loader2, Search } from 'lucide-react';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { Combobox } from '@/components/ui/combobox';

const profileSetupSchema = z.object({
  faculty: z.string().min(1, 'Please select a faculty.'),
  institute: z.string().min(1, 'Please select an institute.'),
  department: z.string().optional(),
  designation: z.string().min(2, 'Designation is required.'),
  misId: z.string().min(1, 'MIS ID is required.'),
  orcidId: z.string().optional(),
  scopusId: z.string().optional(),
  vidwanId: z.string().optional(),
  googleScholarId: z.string().optional(),
  phoneNumber: z.string().min(10, 'A valid 10-digit phone number is required.').max(10, 'A valid 10-digit phone number is required.'),
});

type ProfileSetupFormValues = z.infer<typeof profileSetupSchema>;


const faculties = [
    "Faculty of Engineering & Technology", "Faculty of Diploma Studies", "Faculty of Applied Sciences",
    "Faculty of IT & Computer & Science", "Faculty of Agriculture", "Faculty of Architecture & Planning",
    "Faculty of Design", "Faculty of Fine Arts", "Faculty of Arts", "Faculty of Commerce",
    "Faculty of Social Work", "Faculty of Management Studies", "Faculty of Hotel Management & Catering Technology",
    "Faculty of Law", "Faculty of Medicine", "Faculty of Homoeopathy", "Faculty of Ayurved",
    "Faculty of Nursing", "Faculty of Pharmacy", "Faculty of Physiotherapy", "Faculty of Public Health", 
    "Parul Sevashram Hospital", "RDC", "University Office", "Parul Aarogya Seva Mandal"
];

const institutes = [
    "Parul Institute of Technology",
    "Parul Institute of Technology-Diploma studies",
    "Ahmedabad Homoeopathic Medical College", "Ahmedabad Physiotherapy College",
    "College of Agriculture", "Parul Institute of Allied & Healthcare Sciences", "Faculty of Library & Information Science",
    "Institute of Pharmaceutical Sciences", "Jawaharlal Nehru Homoeopathic Medical College", "Parul College of Pharmacy & Research",
    "Parul Institute of Applied Sciences (Ahmedabad Campus)", "Parul Institute of Applied Sciences (Vadodara Campus)", "Parul Institute of Architecture & Research",
    "Parul Institute of Arts", "Parul Institute of Ayurveda", "Parul Institute of Ayurveda & Research", "Parul Institute of Business Administration",
    "Parul Institute of Commerce", "Parul Institute of Computer Application", "Parul Institute of Design", "Parul Institute of Engineering & Technology",
    "Parul Institute of Engineering & Technology (Diploma Studies)", "Parul Institute of Fine Arts", "Parul Institute of Homeopathy & Research",
    "Parul Institute of Hotel Management & Catering Technology", "Parul Institute of Law", "Parul Institute of Management", "Parul Institute of Management & Research",
    "Parul Institute of Medical Sciences & Research", "Parul Institute of Nursing", "Parul Institute of Performing Arts",
    "Parul Institute of Pharmaceutical Education & Research", "Parul Institute of Pharmacy", "Parul Institute of Pharmacy & Research",
    "Parul Institute of Physiotherapy", "Parul Institute of Physiotherapy and Research", "Parul Institute of Social Work",
    "Parul Institute of Vocational Education", "Parul Medical Institute & Hospital", "Parul Polytechnic Institute", "Parul Institute of Public Health",
    "Parul Sevashram Hospital", "Rajkot Homoeopathic Medical College", "RDC", "School of Pharmacy", "University Office", "Parul Aarogya Seva Mandal",
];

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
  const [isFetchingOrcid, setIsFetchingOrcid] = useState(false);
  const [isPrefilling, setIsPrefilling] = useState(false);
  const [misIdToFetch, setMisIdToFetch] = useState('');
  const [userType, setUserType] = useState<'faculty' | 'CRO' | 'Institutional' | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);

  const form = useForm<ProfileSetupFormValues>({
    resolver: zodResolver(profileSetupSchema),
    defaultValues: {
      faculty: '',
      institute: '',
      department: '',
      designation: '',
      misId: '',
      orcidId: '',
      scopusId: '',
      vidwanId: '',
      googleScholarId: '',
      phoneNumber: '',
    },
  });

  const prefillData = useCallback(async (misId: string) => {
      if (!misId) return;
      setIsPrefilling(true);
      try {
          const res = await fetch(`/api/get-staff-data?misId=${misId}`);
          const result = await res.json();
          if (result.success) {
            form.reset(result.data);
            setUserType(result.data.type);
            toast({ title: 'Profile Pre-filled', description: 'Your information has been pre-filled. Please review and save.' });
          } else {
             toast({ variant: 'destructive', title: 'Not Found', description: "Could not find your details using that MIS ID. Please enter them manually." });
          }
      } catch (error) {
          console.error("Failed to fetch prefill data", error);
          toast({ variant: 'destructive', title: 'Error', description: "Could not fetch your data. Please try again or enter manually." });
      } finally {
          setIsPrefilling(false);
      }
  }, [form, toast]);


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

          // Pre-fetch user type based on email to determine if MIS ID is needed.
          const staffRes = await fetch(`/api/get-staff-data?email=${appUser.email!}`);
          const staffResult = await staffRes.json();
          if (staffResult.success) {
              setUserType(staffResult.data.type || 'faculty');
          } else {
              setUserType('faculty'); // Default to faculty if not found
          }
          
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
  }, [router, toast]);

  useEffect(() => {
    async function fetchDepartments() {
      try {
        const res = await fetch('/api/get-departments');
        const result = await res.json();
        if (result.success) {
          setDepartments(result.data);
        }
      } catch (error) {
        console.error("Failed to fetch departments", error);
      }
    }
    fetchDepartments();
  }, []);


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
      // MIS ID is mandatory for faculty/CRO types
      if (userType !== 'Institutional' && (!data.misId || data.misId.trim() === '')) {
         form.setError("misId", { type: "manual", message: "MIS ID is mandatory for your account type." });
         setIsSubmitting(false);
         return;
      }
      
      if (data.misId) {
        const misIdCheck = await checkMisIdExists(data.misId, user.uid);
        if (misIdCheck.exists) {
            form.setError("misId", {
                type: "manual",
                message: "This MIS ID is already registered. If you need help, contact helpdesk.rdc@paruluniversity.ac.in."
            });
            toast({
            variant: 'destructive',
            title: 'MIS ID Already Registered',
            description: 'This MIS ID is already associated with another account.',
            duration: 8000,
            });
            setIsSubmitting(false);
            return;
        }
      }

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
      
      const updateData: Partial<User> = {
        ...data,
        photoURL: photoURL,
        profileComplete: true,
      };

      // Sanitize data: Ensure optional fields that are empty strings are not sent as undefined
      for (const key in updateData) {
        if ((updateData as any)[key] === undefined) {
          (updateData as any)[key] = null;
        }
      }

      await updateDoc(userDocRef, updateData as any);
      
      const updatedUser = { ...user, ...updateData };
      localStorage.setItem('user', JSON.stringify(updatedUser));

      toast({ title: 'Profile Updated!', description: 'Redirecting to your dashboard.' });
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Profile update error:', error);
      toast({ variant: 'destructive', title: 'Update Failed', description: error.message || 'Could not update your profile.' });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleFetchOrcid = async () => {
    const orcidId = form.getValues('orcidId');
    if (!orcidId) {
        toast({ variant: 'destructive', title: 'ORCID iD Missing', description: 'Please enter an ORCID iD to fetch data.' });
        return;
    }
    setIsFetchingOrcid(true);
    try {
        const result = await fetchOrcidData(orcidId);
        if (result.success && result.data) {
            toast({ title: 'ORCID iD Verified', description: `Successfully verified ORCID iD for ${result.data.name}.` });
        } else {
            toast({ variant: 'destructive', title: 'Verification Failed', description: result.error });
        }
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'An unexpected error occurred.' });
    } finally {
        setIsFetchingOrcid(false);
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

  const departmentOptions = departments.map(dept => ({ label: dept, value: dept }));

  return (
    <div className="flex flex-col min-h-screen bg-background dark:bg-transparent">
      <main className="flex-1 flex min-h-screen items-center justify-center bg-muted/40 p-4">
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
               {userType !== 'Institutional' && (
                <div className="space-y-4 mb-6 p-4 border rounded-lg bg-muted/50">
                  <Label>Fetch Details with MIS ID (Mandatory)</Label>
                   <div className="flex items-center gap-2">
                      <Input
                        placeholder="Enter your MIS ID"
                        value={misIdToFetch}
                        onChange={(e) => setMisIdToFetch(e.target.value)}
                      />
                      <Button type="button" onClick={() => prefillData(misIdToFetch)} disabled={isPrefilling || !misIdToFetch}>
                        {isPrefilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                         <span className="ml-2 hidden sm:inline">Fetch My Details</span>
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Faculty and CROs must use their MIS ID to pre-fill the form.
                    </p>
                </div>
               )}
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
                  
                  <div className="space-y-2">
                      <Label>Full Name</Label>
                      <Input value={user.name} disabled />
                      <p className="text-sm text-muted-foreground">
                          This name was set from your sign-up details. It can be changed in Settings after setup.
                      </p>
                  </div>

                  <h3 className="text-lg font-semibold border-t pt-4">Academic & Contact Details</h3>
                  <FormField name="faculty" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>Faculty</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select your faculty" /></SelectTrigger></FormControl><SelectContent>{faculties.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                  )} />
                  <FormField name="institute" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>Institute</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select your institute" /></SelectTrigger></FormControl><SelectContent>{institutes.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                  )} />
                  {userType !== 'Institutional' && (
                     <FormField
                      control={form.control}
                      name="department"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Department</FormLabel>
                          <Combobox
                            options={departmentOptions}
                            value={field.value || ''}
                            onChange={field.onChange}
                            placeholder="Select your department"
                            searchPlaceholder="Search departments..."
                            emptyPlaceholder="No department found."
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField control={form.control} name="designation" render={({ field }) => (
                    <FormItem><FormLabel>Designation</FormLabel><FormControl><Input placeholder="e.g., Professor" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="phoneNumber" render={({ field }) => (
                    <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input type="tel" placeholder="e.g. 9876543210" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  
                  <Separator />
                  <h3 className="text-md font-semibold pt-2">Academic & Researcher IDs</h3>
                  
                  {userType !== 'Institutional' && (
                    <FormField control={form.control} name="misId" render={({ field }) => (
                      <FormItem><FormLabel>MIS ID</FormLabel><FormControl><Input placeholder="Your MIS ID" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  )}
                   <FormField control={form.control} name="orcidId" render={({ field }) => (
                      <FormItem>
                          <FormLabel>ORCID iD</FormLabel>
                          <div className="flex items-center gap-2">
                              <FormControl>
                                  <Input placeholder="e.g., 0000-0001-2345-6789" {...field} />
                              </FormControl>
                              <Button type="button" variant="outline" size="icon" onClick={handleFetchOrcid} disabled={isFetchingOrcid} title="Verify ORCID iD">
                                  {isFetchingOrcid ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                              </Button>
                          </div>
                          <FormMessage />
                      </FormItem>
                  )} />
                  <FormField control={form.control} name="scopusId" render={({ field }) => (
                      <FormItem><FormLabel>Scopus ID (Optional)</FormLabel><FormControl><Input placeholder="Your Scopus Author ID" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="vidwanId" render={({ field }) => (
                      <FormItem><FormLabel>Vidwan ID (Optional)</FormLabel><FormControl><Input placeholder="Your Vidwan-ID" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="googleScholarId" render={({ field }) => (
                      <FormItem><FormLabel>Google Scholar ID (Optional)</FormLabel><FormControl><Input placeholder="Your Google Scholar Profile ID" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  
                  <Button type="submit" className="w-full !mt-8" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save and Continue"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </main>
       <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} Parul University. All rights reserved.</p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link className="text-xs hover:underline underline-offset-4" href="/help">
            Help
          </Link>
          <Link className="text-xs hover:underline underline-offset-4" href="/terms-of-use">
            Terms of Service
          </Link>
          <Link className="text-xs hover:underline underline-offset-4" href="/privacy-policy">
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  );
}
