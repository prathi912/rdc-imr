
'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import type { User } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { ALL_MODULES } from '@/lib/modules';
import { Loader2 } from 'lucide-react';
import { updateUserModules } from '@/app/actions';


export default function ModuleManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUids, setSavingUids] = useState<string[]>([]);
  const [userModules, setUserModules] = useState<Record<string, string[]>>({});
  const { toast } = useToast();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const usersCollection = collection(db, 'users');
      const userSnapshot = await getDocs(usersCollection);
      const userList = userSnapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as User));
      
      const initialUserModules: Record<string, string[]> = {};
      userList.forEach(user => {
        initialUserModules[user.uid] = user.allowedModules || [];
      });
      
      setUserModules(initialUserModules);
      setUsers(userList);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({ variant: 'destructive', title: "Error", description: "Could not fetch users." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleModuleChange = (uid: string, moduleId: string, checked: boolean) => {
    setUserModules(prev => {
      const currentModules = prev[uid] || [];
      const newModules = checked
        ? [...currentModules, moduleId]
        : currentModules.filter(id => id !== moduleId);
      return { ...prev, [uid]: newModules };
    });
  };

  const handleSaveChanges = async (uid: string) => {
    setSavingUids(prev => [...prev, uid]);
    const modulesToSave = userModules[uid] || [];
    
    try {
      const result = await updateUserModules(uid, modulesToSave);

      if (!result.success) {
        throw new Error(result.error || 'An unknown error occurred.');
      }
      
      toast({ title: 'Permissions Updated', description: 'User modules have been saved successfully.' });
      await fetchUsers(); // Re-fetch users to reflect the changes in the UI
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
    } finally {
      setSavingUids(prev => prev.filter(id => id !== uid));
    }
  };
  
  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Module Management" description="Set module permissions for each user in the system." />
        <div className="mt-8">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              </CardContent>
            </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Module Management" description="Set module permissions for each user in the system." />
      <div className="mt-8">
        <Card>
          <CardHeader>
             <CardTitle>User Permissions</CardTitle>
             <CardDescription>Click on a user to expand and manage their module access.</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {users.map((user) => {
                const isSaving = savingUids.includes(user.uid);
                return (
                  <AccordionItem value={user.uid} key={user.uid}>
                    <AccordionTrigger className="hover:no-underline">
                        <div className="flex flex-col text-left">
                            <span className="font-semibold">{user.name}</span>
                            <span className="text-sm text-muted-foreground">{user.email}</span>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="p-4 bg-muted/50 rounded-lg">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
                          {ALL_MODULES.map((module) => (
                            <div key={module.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`${user.uid}-${module.id}`}
                                checked={userModules[user.uid]?.includes(module.id)}
                                onCheckedChange={(checked) => handleModuleChange(user.uid, module.id, !!checked)}
                              />
                              <Label htmlFor={`${user.uid}-${module.id}`} className="text-sm font-normal">
                                {module.label}
                              </Label>
                            </div>
                          ))}
                        </div>
                        <Button onClick={() => handleSaveChanges(user.uid)} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
