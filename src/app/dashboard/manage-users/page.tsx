
'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import type { User } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { getDefaultModulesForRole } from '@/lib/modules';

const ROLES: User['role'][] = ['faculty', 'Evaluator', 'CRO', 'admin', 'Super-admin'];
const SUPER_ADMIN_EMAIL = 'rathipranav07@gmail.com';

function ProfileDetailsDialog({ user, open, onOpenChange }: { user: User | null, open: boolean, onOpenChange: (open: boolean) => void }) {
    if (!user) return null;

    const renderDetail = (label: string, value?: string | number) => {
        if (!value && value !== 0) return null;
        return (
            <div className="grid grid-cols-3 gap-2 py-1.5">
                <dt className="font-semibold text-muted-foreground col-span-1">{label}</dt>
                <dd className="col-span-2">{value}</dd>
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{user.name}'s Profile</DialogTitle>
                    <DialogDescription>Viewing full profile details for {user.email}.</DialogDescription>
                </DialogHeader>
                <div className="max-h-[70vh] overflow-y-auto pr-4 space-y-4 text-sm">
                    <div>
                      <h4 className="font-semibold text-base mb-2">Personal & Contact</h4>
                      {renderDetail("Full Name", user.name)}
                      {renderDetail("Email", user.email)}
                      {renderDetail("Phone", user.phoneNumber)}
                      {renderDetail("Role", user.role)}
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-base mb-2">Academic Details</h4>
                      {renderDetail("MIS ID", user.misId)}
                      {renderDetail("Faculty", user.faculty)}
                      {renderDetail("Institute", user.institute)}
                      {renderDetail("Department", user.department)}
                    </div>
                    
                    {user.bankDetails ? (
                        <div className="border-t pt-4">
                            <h4 className="font-semibold text-base mb-2">Bank Account Details</h4>
                            {renderDetail("Beneficiary Name", user.bankDetails.beneficiaryName)}
                            {renderDetail("Account Number", user.bankDetails.accountNumber)}
                            {renderDetail("Bank Name", user.bankDetails.bankName)}
                            {renderDetail("Branch Name", user.bankDetails.branchName)}
                            {renderDetail("City", user.bankDetails.city)}
                            {renderDetail("IFSC Code", user.bankDetails.ifscCode)}
                        </div>
                    ) : (
                       <div className="border-t pt-4">
                            <h4 className="font-semibold text-base mb-2">Bank Account Details</h4>
                            <p className="text-muted-foreground">No bank details have been added by this user.</p>
                       </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default function ManageUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [userToView, setUserToView] = useState<User | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const usersCollection = collection(db, 'users');
      const userSnapshot = await getDocs(usersCollection);
      const userList = userSnapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as User));
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

  const handleDeleteUser = useCallback(async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'users', uid));
      toast({ title: 'User Deleted', description: 'The user has been successfully deleted.' });
      fetchUsers(); // Refresh the list
    } catch (error) {
       console.error("Error deleting user:", error);
       toast({ variant: 'destructive', title: "Error", description: "Could not delete user." });
    } finally {
      setUserToDelete(null);
    }
  }, [fetchUsers, toast]);


  const handleRoleChange = useCallback(async (uid: string, newRole: User['role']) => {
    try {
      const userDoc = doc(db, 'users', uid);
      // When role changes, also update their default module access list
      const defaultModules = getDefaultModulesForRole(newRole);
      await updateDoc(userDoc, { 
        role: newRole,
        allowedModules: defaultModules
      });
      toast({ title: 'Role Updated', description: "The user's role and permissions have been changed." });
      fetchUsers(); // Refresh the list
    } catch (error) {
       console.error("Error updating role:", error);
       toast({ variant: 'destructive', title: "Error", description: "Could not update role." });
    }
  }, [fetchUsers, toast]);
  
  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Manage Users" description="View and manage user roles and permissions." />
        <div className="mt-8">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              </CardContent>
            </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Manage Users" description="View and manage user roles and permissions." />
      <div className="mt-8">
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                   const isSuperAdminUser = user.email === SUPER_ADMIN_EMAIL;
                   const isCurrentUser = user.uid === currentUser?.uid;

                   return (
                    <TableRow key={user.uid}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell className="hidden sm:table-cell">{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'admin' || user.role === 'Super-admin' ? 'default' : 'secondary'}>{user.role}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                         <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button aria-haspopup="true" size="icon" variant="ghost" disabled={isCurrentUser || isSuperAdminUser}>
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Toggle menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => setUserToView(user)}>View Profile</DropdownMenuItem>
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>Change Role</DropdownMenuSubTrigger>
                                <DropdownMenuPortal>
                                    <DropdownMenuSubContent>
                                        {ROLES.map(role => (
                                            <DropdownMenuItem 
                                                key={role} 
                                                onClick={() => handleRoleChange(user.uid, role)}
                                                disabled={user.role === role}
                                            >
                                               {role.charAt(0).toUpperCase() + role.slice(1)}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuSubContent>
                                </DropdownMenuPortal>
                            </DropdownMenuSub>
                            <DropdownMenuItem className="text-destructive" onSelect={() => setUserToDelete(user)}>
                              Delete User
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
       <ProfileDetailsDialog user={userToView} open={!!userToView} onOpenChange={() => setUserToView(null)} />
       {userToDelete && (
          <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
              <AlertDialogContent>
                  <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete the user account for <span className="font-bold">{userToDelete.name}</span>.
                      </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                          onClick={() => handleDeleteUser(userToDelete.uid)}
                          className="bg-destructive hover:bg-destructive/90"
                      >
                          Continue
                      </AlertDialogAction>
                  </AlertDialogFooter>
              </AlertDialogContent>
          </AlertDialog>
      )}
    </div>
  );
}
