
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
import { doc, setDoc, getDoc, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import type { User } from '@/types';
import { useState } from 'react';
import { getDefaultModulesForRole } from '@/lib/modules';

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

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });
  
  const determineUserRole = (email: string): User['role'] => {
    if (email === 'rathipranav07@gmail.com') {
      return 'Super-admin';
    }
    // New users are faculty by default. Super-admin can change roles.
    return 'faculty';
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
    
    const role = determineUserRole(firebaseUser.email!);
    const user: User = {
      uid: firebaseUser.uid,
      name: name || firebaseUser.displayName || firebaseUser.email!.split('@')[0],
      email: firebaseUser.email!,
      photoURL: firebaseUser.photoURL || undefined,
      role: role,
      profileComplete: role !== 'faculty',
      allowedModules: getDefaultModulesForRole(role),
    };
    await setDoc(userDocRef, user);

    // Back-fill pi_uid for migrated projects
    try {
      const projectsRef = collection(db, 'projects');
      const q = query(projectsRef, where('pi_email', '==', user.email), where('pi_uid', '==', ''));
      const projectsSnapshot = await getDocs(q);

      if (!projectsSnapshot.empty) {
        const batch = writeBatch(db);
        projectsSnapshot.forEach(projectDoc => {
          batch.update(projectDoc.ref, { pi_uid: user.uid });
        });
        await batch.commit();
        console.log(`Updated ${projectsSnapshot.size} historical projects for new user ${user.email}`);
      }
    } catch (e) {
      console.error("Failed to back-fill historical projects for new user:", e);
      // Don't block signup for this, just log it.
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(user));
    }
    
    if (user.profileComplete) {
       toast({
        title: 'Account Created',
        description: "Welcome! Redirecting to your dashboard.",
      });
      router.push('/dashboard');
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
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4 dark:bg-transparent">
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
                        <Input type="password" placeholder="••••••••" {...field} disabled={isSubmitting} />
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
                        <Input type="password" placeholder="••••••••" {...field} disabled={isSubmitting} />
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
  );
}
