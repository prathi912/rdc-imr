
'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Logo } from '@/components/logo';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { auth, db } from '@/lib/config';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import type { User } from '@/types';
import { useState } from 'react';
import { getDefaultModulesForRole } from '@/lib/modules';
import { linkHistoricalData } from '@/app/actions';
import { CRO_EMAILS } from '@/lib/constants';
import { Eye, EyeOff } from 'lucide-react';

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  email: z
    .string()
    .email('Invalid email address.')
    .refine(
      (email) => email.endsWith('@paruluniversity.ac.in') || email === 'rathipranav07@gmail.com',
      'Only emails from paruluniversity.ac.in domain are allowed.'
    )
    .refine(
      (email) => {
        if (email === 'rathipranav07@gmail.com') return true;
        return !/^\d+$/.test(email.split('@')[0]);
      }, 'Access is for faculty members only. Student accounts are not permitted.'
    ),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
});


type SignupFormValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });
  
  const determineUserRoleAndDesignation = (email: string, institute?: string, faculty?: string): { role: User['role'], designation: User['designation'], profileComplete: boolean } => {
    if (email === 'rathipranav07@gmail.com') {
      return { role: 'Super-admin', designation: 'Super-admin', profileComplete: true };
    }
    if (CRO_EMAILS.includes(email)) {
      return { role: 'CRO', designation: 'CRO', profileComplete: true };
    }
    if (institute) { // If an institute is mapped, they are a Principal
        return { role: 'faculty', designation: 'Principal', profileComplete: true };
    }
    // New users are faculty by default. Super-admin can change roles.
    return { role: 'faculty', designation: 'faculty', profileComplete: false };
  }

  const processNewUser = async (firebaseUser: FirebaseUser, name?: string) => {
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      toast({
        title: 'Account Exists',
        description: 'This email is already registered. Please sign in.',
      });
      await signOut(auth);
      router.push('/login');
      return;
    }
    
    // Check if the email is mapped to an institute
    let mappedInstituteData: { institute: string; faculty: string } | null = null;
    try {
      const mappingsRef = collection(db, 'institute_mappings');
      const q = query(mappingsRef, where('email', '==', firebaseUser.email!));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
          const mappingDoc = querySnapshot.docs[0];
          const instituteName = mappingDoc.id;
          // Since we can't reliably know the faculty from just the institute mapping,
          // we'll assign a placeholder or leave it for the profile setup.
          // For now, let's assign a generic faculty and let them change it if needed.
          mappedInstituteData = { institute: instituteName, faculty: 'Unknown' };
      }
    } catch(e) {
      console.error("Could not check institute mappings:", e);
    }
    
    let { role, designation, profileComplete } = determineUserRoleAndDesignation(
        firebaseUser.email!,
        mappedInstituteData?.institute,
        mappedInstituteData?.faculty
    );
    
    let user: User = {
      uid: firebaseUser.uid,
      name: name || firebaseUser.displayName || firebaseUser.email!.split('@')[0],
      email: firebaseUser.email!,
      role,
      designation,
      profileComplete,
      allowedModules: [], // Will be set after role/designation is finalized
      faculty: mappedInstituteData?.faculty,
      institute: mappedInstituteData?.institute,
    };
    
    // Set modules based on the final, determined role
    user.allowedModules = getDefaultModulesForRole(user.role, user.designation);

    if (firebaseUser.photoURL) {
      user.photoURL = firebaseUser.photoURL;
    }
    
    await setDoc(userDocRef, user);

    // Back-fill pi_uid for migrated projects using a server action
    try {
      const result = await linkHistoricalData(user);
      if (result.success && result.count > 0) {
        console.log(`Successfully linked ${result.count} historical projects for new user ${user.email}.`);
      }
      if (!result.success) {
          console.error("Failed to link historical projects:", result.error);
      }
    } catch (e) {
      console.error("Error calling linkHistoricalData action:", e);
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(user));
    }
    
    if (user.profileComplete) {
       toast({
        title: 'Account Created',
        description: "Welcome! Redirecting to your dashboard.",
      });
      router.push('/dashboard/all-projects');
    } else {
       toast({
        title: 'Account Created',
        description: "Let's complete your profile to continue.",
      });
      router.push('/profile-setup');
    }
  };

  const onEmailSubmit = async (data: SignupFormValues) => {
    setIsSubmitting(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      await processNewUser(userCredential.user, data.name);
    } catch (error: any) {
      console.error('Signup Error:', error);
      toast({
        variant: 'destructive',
        title: 'Sign Up Failed',
        description: error.code === 'auth/email-already-in-use' 
          ? 'This email is already registered.'
          : error.message || 'An unknown error occurred.',
      });
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setIsSubmitting(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;
      const email = firebaseUser.email;

      const isAllowedDomain = email && (email.endsWith('@paruluniversity.ac.in') || email === 'rathipranav07@gmail.com');
      
      if (email && /^\d+$/.test(email.split('@')[0]) && email !== 'rathipranav07@gmail.com') {
        await signOut(auth);
        toast({ variant: 'destructive', title: 'Access Denied', description: 'Access is for faculty members only. Student accounts are not permitted.' });
        setIsSubmitting(false);
        return;
      }
      
      if (!isAllowedDomain) {
        await signOut(auth);
        toast({
            variant: 'destructive',
            title: 'Access Denied',
            description: 'Sign up is restricted to Parul University members.',
        });
        setIsSubmitting(false);
        return;
      }

      await processNewUser(firebaseUser);

    } catch (error: any) {
        console.error('Google Sign-up error:', error);
        toast({
            variant: 'destructive',
            title: 'Sign Up Failed',
            description: error.message || 'Could not sign up with Google. Please try again.',
        });
        setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background dark:bg-transparent">
      <main className="flex-1 flex min-h-screen items-center justify-center bg-muted/40 p-4 dark:bg-transparent">
        <div className="w-full max-w-md">
          <Card className="shadow-xl">
            <CardHeader className="text-center">
              <div className="mx-auto mb-6 flex justify-center">
                <Logo />
              </div>
              <CardTitle className="text-2xl font-bold">Create an Account</CardTitle>
              <CardDescription>
                Join the Parul University Research Portal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onEmailSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} disabled={isSubmitting} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>University Email</FormLabel>
                        <FormControl>
                          <Input placeholder="your.name@paruluniversity.ac.in" {...field} disabled={isSubmitting} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? 'text' : 'password'}
                              placeholder="••••••••"
                              {...field}
                              disabled={isSubmitting}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                              onClick={() => setShowPassword(!showPassword)}
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                             <Input
                              type={showConfirmPassword ? 'text' : 'password'}
                              placeholder="••••••••"
                              {...field}
                              disabled={isSubmitting}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            >
                              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? "Creating Account..." : "Sign Up with Email"}
                  </Button>
                </form>
              </Form>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    Or continue with
                  </span>
                </div>
              </div>
              <Button variant="outline" className="w-full" onClick={handleGoogleSignUp} disabled={isSubmitting}>
                 <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="mr-2 h-4 w-4">
                   <title>Google</title>
                   <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.85 3.18-1.73 4.1-1.02 1.02-2.62 1.9-4.63 1.9-3.87 0-7-3.13-7-7s3.13-7 7-7c2.18 0 3.66.87 4.53 1.73l2.43-2.38C18.04 2.33 15.47 1 12.48 1 7.01 1 3 5.02 3 9.98s4.01 8.98 9.48 8.98c2.96 0 5.42-1 7.15-2.68 1.78-1.74 2.37-4.24 2.37-6.52 0-.6-.05-1.18-.15-1.72H12.48z" />
                 </svg>
                Sign up with Google
              </Button>
            </CardContent>
            <CardFooter className="justify-center text-sm">
              <p className="text-muted-foreground">Already have an account?&nbsp;</p>
               <Link href="/login" passHref>
                  <Button variant="link" className="p-0 h-auto">Sign In</Button>
              </Link>
            </CardFooter>
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
