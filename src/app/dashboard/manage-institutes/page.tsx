
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { Loader2, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { INSTITUTES } from '@/lib/constants';

const formSchema = z.object({
  mappings: z.array(z.object({
    institute: z.string(),
    email: z.string().email({ message: "Invalid email." }).optional().or(z.literal('')),
  })),
});

type FormValues = z.infer<typeof formSchema>;

export default function ManageInstitutesPage() {
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mappings: [],
    },
  });

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: "mappings",
  });

  const fetchMappings = useCallback(async () => {
    setLoading(true);
    try {
      const mappingsRef = collection(db, 'institute_mappings');
      const mappingsSnapshot = await getDocs(mappingsRef);
      const existingMappings = new Map<string, string>();
      mappingsSnapshot.forEach(doc => {
        existingMappings.set(doc.id, doc.data().email);
      });

      const newFields = INSTITUTES.map(institute => ({
        institute: institute,
        email: existingMappings.get(institute) || '',
      }));

      replace(newFields);
    } catch (error) {
      console.error("Error fetching institute mappings:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch existing mappings.' });
    } finally {
      setLoading(false);
    }
  }, [toast, replace]);

  useEffect(() => {
    fetchMappings();
  }, [fetchMappings]);

  const onSubmit = async (data: FormValues) => {
    setIsSaving(true);
    try {
        const batch = writeBatch(db);
        data.mappings.forEach(({ institute, email }) => {
            const docRef = doc(db, 'institute_mappings', institute);
            if (email && email.trim() !== '') {
                batch.set(docRef, { email: email.trim() });
            } else {
                batch.delete(docRef);
            }
        });
        await batch.commit();
        toast({ title: 'Success', description: 'Institute mappings have been saved.' });
        fetchMappings();
    } catch (error) {
        console.error("Error saving mappings:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not save mappings.' });
    } finally {
        setIsSaving(false);
    }
  };

  if (loading) {
      return (
          <div className="container mx-auto py-10">
              <PageHeader title="Manage Institutes" description="Assign email addresses to institutional heads." />
              <Card className="mt-8">
                <CardHeader>
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-4 w-3/4" />
                </CardHeader>
                <CardContent className="space-y-4">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </CardContent>
              </Card>
          </div>
      )
  }

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Manage Institutes" description="Assign a unique faculty email address to each institute. This will automatically configure their account upon sign-up." />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
            <Card className="mt-8">
                <CardHeader>
                    <CardTitle>Institute Email Mapping</CardTitle>
                    <CardDescription>
                        When a user signs up with a mapped email, their profile will be pre-configured as a Principal for that institute. Leave the email blank to unmap.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                        {fields.map((field, index) => (
                            <FormField
                                key={field.id}
                                control={form.control}
                                name={`mappings.${index}.email`}
                                render={({ field: renderField }) => (
                                    <FormItem>
                                        <FormLabel>{field.institute}</FormLabel>
                                        <FormControl>
                                            <Input 
                                                placeholder={`principal.email@paruluniversity.ac.in`}
                                                {...renderField} 
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        ))}
                    </div>
                </CardContent>
                 <CardFooter className="border-t px-6 py-4">
                    <Button type="submit" disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Mappings
                    </Button>
                </CardFooter>
            </Card>
        </form>
      </Form>
    </div>
  );
}
