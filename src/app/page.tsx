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
import { auth, db } from '@/lib/firebase';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { User } from '@/types';
import { useState } from 'react';

const loginSchema = z.object({
  email: z
    .string()
    .email('Invalid email address.')
    .refine(
      (email) => email.endsWith('@paruluniversity.ac.in') || email === 'rathipranav07@gmail.com',
      'Only emails from paruluniversity.ac.in are allowed.'
    ),
  password: z.string().min(1, 'Password is required.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const processSignIn = async (firebaseUser: FirebaseUser) => {
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    const userDocSnap = await getDoc(userDocRef);
    let user: User;

    if (userDocSnap.exists()) {
      user = { uid: firebaseUser.uid, ...userDocSnap.data() } as User;
    } else {
      // Create new user if they don't exist in Firestore (e.g., first Google sign-in)
      user = {
        uid: firebaseUser.uid,
        name: firebaseUser.displayName || firebaseUser.email!.split('@')[0],
        email: firebaseUser.email!,
        role: firebaseUser.email === 'rathipranav07@gmail.com' ? 'Super-admin' : 'faculty',
        profileComplete: false,
      };
      await setDoc(userDocRef, user);
    }
    
    // Ensure admin user always has Super-admin role and bypasses profile setup
    if (user.email === 'rathipranav07@gmail.com' && (!user.profileComplete || user.role !== 'Super-admin')) {
      user.role = 'Super-admin';
      user.profileComplete = true;
      await setDoc(userDocRef, user, { merge: true });
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(user));
    }
    
    if (user.profileComplete) {
      toast({
        title: 'Login Successful',
        description: 'Redirecting to your dashboard...',
      });
      router.push('/dashboard');
    } else {
       toast({
        title: 'Profile Setup Required',
        description: 'Please complete your profile to continue.',
      });
      router.push('/profile-setup');
    }
  };

  const onEmailSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
      await processSignIn(userCredential.user);
    } catch (error: any) {
      console.error('Login error:', error);
      toast({
        variant: 'destructive',
        title: 'Login Failed',
        description: error.code === 'auth/invalid-credential'
          ? 'Invalid email or password.'
          : error.message || 'An unknown error occurred.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;

      const isAllowed = firebaseUser.email && (firebaseUser.email.endsWith('@paruluniversity.ac.in') || firebaseUser.email === 'rathipranav07@gmail.com');
      
      if (!isAllowed) {
        await signOut(auth);
        toast({
            variant: 'destructive',
            title: 'Access Denied',
            description: 'Access is restricted to Parul University members.',
        });
        setIsSubmitting(false);
        return;
      }

      await processSignIn(firebaseUser);
    } catch (error: any) {
        console.error('Google Sign-in error:', error);
        toast({
            variant: 'destructive',
            title: 'Sign In Failed',
            description: error.message || 'Could not sign in with Google. Please try again.',
        });
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-6 flex justify-center">
              <Logo />
            </div>
            <CardTitle className="text-2xl font-bold">Welcome Back!</CardTitle>
            <CardDescription>
              Sign in to access the Research Portal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onEmailSubmit)} className="space-y-4">
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
                       <div className="flex items-center justify-between">
                        <FormLabel>Password</FormLabel>
                        <Link href="/forgot-password" passHref>
                           <Button variant="link" className="p-0 h-auto text-xs">Forgot password?</Button>
                        </Link>
                      </div>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} disabled={isSubmitting} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Signing In..." : "Sign In"}
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
            <Button variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={isSubmitting}>
              <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="mr-2 h-4 w-4">
                <title>Google</title>
                <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.85 3.18-1.73 4.1-1.02 1.02-2.62 1.9-4.63 1.9-3.87 0-7-3.13-7-7s3.13-7 7-7c2.18 0 3.66.87 4.53 1.73l2.43-2.38C18.04 2.33 15.47 1 12.48 1 7.01 1 3 5.02 3 9.98s4.01 8.98 9.48 8.98c2.96 0 5.42-1 7.15-2.68 1.78-1.74 2.37-4.24 2.37-6.52 0-.6-.05-1.18-.15-1.72H12.48z" />
              </svg>
              Sign in with Google
            </Button>
          </CardContent>
          <CardFooter className="justify-center text-sm">
            <p className="text-muted-foreground">Don't have an account?&nbsp;</p>
            <Link href="/signup" passHref>
                <Button variant="link" className="p-0 h-auto">Sign Up</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
