"use client";

import React, { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Combobox } from "@/components/ui/combobox";
import { db } from "@/lib/config";
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

const paperSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters."),
  coAuthors: z.array(z.string().email("Invalid email address")).optional(),
});

type PaperFormValues = z.infer<typeof paperSchema>;

interface PaperFormProps {
  userId: string;
  onPaperAdded: () => void;
}

export function PaperForm({ userId, onPaperAdded }: PaperFormProps) {
  const { toast } = useToast();
  const [emailSearchResults, setEmailSearchResults] = useState<{ label: string; value: string }[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  const form = useForm<PaperFormValues>({
    resolver: zodResolver(paperSchema),
    defaultValues: {
      title: "",
      coAuthors: [],
    },
  });

  const handleEmailSearch = async (query: string) => {
    if (!query || query.length < 3) {
      setEmailSearchResults([]);
      return;
    }
    setLoadingSearch(true);
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", ">=", query), where("email", "<=", query + "\uf8ff"));
      const querySnapshot = await getDocs(q);
      const emails: { label: string; value: string }[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.email && !form.getValues("coAuthors")?.includes(data.email)) {
          emails.push({ label: data.email, value: data.email });
        }
      });
      setEmailSearchResults(emails);
    } catch (error) {
      console.error("Error searching emails:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to search emails." });
    } finally {
      setLoadingSearch(false);
    }
  };

  const onSubmit = async (data: PaperFormValues) => {
    try {
      // Add paper to user's document in Firestore
      const userDocRef = doc(db, "users", userId);
      const paperData = {
        title: data.title,
        coAuthors: data.coAuthors || [],
        createdAt: new Date().toISOString(),
      };
      await updateDoc(userDocRef, {
        papers: arrayUnion(paperData),
      });

      // Also add paper to co-authors' documents
      if (data.coAuthors && data.coAuthors.length > 0) {
        for (const email of data.coAuthors) {
          const usersRef = collection(db, "users");
          const q = query(usersRef, where("email", "==", email), limit(1));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            const coAuthorDoc = querySnapshot.docs[0];
            await updateDoc(coAuthorDoc.ref, {
              papers: arrayUnion(paperData),
            });
          }
        }
      }

      toast({ title: "Paper added successfully." });
      form.reset();
      onPaperAdded();
    } catch (error) {
      console.error("Error adding paper:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to add paper." });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Research Paper Title</FormLabel>
              <FormControl>
                <Input placeholder="Enter paper title" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="coAuthors"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Co-Authors (by email)</FormLabel>
              <Controller
                control={form.control}
                name="coAuthors"
                render={({ field: { value, onChange } }) => (
                  <Combobox
                    options={emailSearchResults}
                    value={value || []}
                    onChange={onChange}
                    placeholder="Search and add co-author emails"
                    multiple
                    onInputChange={handleEmailSearch}
                    loading={loadingSearch}
                    emptyPlaceholder="No emails found"
                  />
                )}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Add Paper</Button>
      </form>
    </Form>
  );
}
