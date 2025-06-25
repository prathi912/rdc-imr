'use client';

import { useState, useEffect } from 'react';
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
} from "@/components/ui/dropdown-menu";
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import type { User } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

export default function ManageUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchUsers = async () => {
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
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDeleteUser = async (uid: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'users', uid));
      toast({ title: 'User Deleted', description: 'The user has been successfully deleted.' });
      fetchUsers(); // Refresh the list
    } catch (error) {
       console.error("Error deleting user:", error);
       toast({ variant: 'destructive', title: "Error", description: "Could not delete user." });
    }
  }

  // In a real app, you might have more roles.
  const handleRoleChange = async (uid: string, newRole: 'admin' | 'faculty') => {
    try {
      const userDoc = doc(db, 'users', uid);
      await updateDoc(userDoc, { role: newRole });
      toast({ title: 'Role Updated', description: "The user's role has been changed." });
      fetchUsers(); // Refresh the list
    } catch (error) {
       console.error("Error updating role:", error);
       toast({ variant: 'destructive', title: "Error", description: "Could not update role." });
    }
  }
  
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
                {users.map((user) => (
                  <TableRow key={user.uid}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>{user.role}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                       <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button aria-haspopup="true" size="icon" variant="ghost" disabled={user.email === 'rathipranav07@gmail.com'}>
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Toggle menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          {user.role === 'faculty' && <DropdownMenuItem onClick={() => handleRoleChange(user.uid, 'admin')}>Make Admin</DropdownMenuItem>}
                          {user.role === 'admin' && <DropdownMenuItem onClick={() => handleRoleChange(user.uid, 'faculty')}>Make Faculty</DropdownMenuItem>}
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteUser(user.uid)}>Delete User</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
