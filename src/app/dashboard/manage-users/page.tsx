
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, ArrowUpDown, ChevronDown } from "lucide-react";
import Link from 'next/link';
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
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator
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
import { db } from '@/lib/config';
import { collection, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import type { User, IncentiveClaim } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { getDefaultModulesForRole } from '@/lib/modules';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ROLES: User['role'][] = ['faculty', 'admin', 'CRO'];
const SUPER_ADMIN_ROLE: User['role'] = 'Super-admin';
const PRIMARY_SUPER_ADMIN_EMAIL = 'rathipranav07@gmail.com';
type SortableKeys = keyof Pick<User, 'name' | 'email' | 'role' | 'faculty'> | 'claimsCount';

const faculties = [
    "Faculty of Engineering & Technology", "Faculty of Diploma Studies", "Faculty of Applied Sciences",
    "Faculty of Computer Applications", "Faculty of Agriculture", "Faculty of Architecture & Planning",
    "Faculty of Design", "Faculty of Fine Arts", "Faculty of Arts", "Faculty of Commerce",
    "Faculty of Social Work", "Faculty of Management Studies", "Faculty of Hotel Management & Catering Technology",
    "Faculty of Law", "Faculty of Medicine", "Faculty of Homoeopathy", "Faculty of Ayurveda",
    "Faculty of Nursing", "Faculty of Pharmacy", "Faculty of Physiotherapy", "Faculty of Public Health", 
    "Parul Sevashram Hospital", "RDC", "University Office", "Parul Aarogya Seva Mandal"
];

function ProfileDetailsDialog({ user, open, onOpenChange }: { user: User | null, open: boolean, onOpenChange: (open: boolean) => void }) {
    if (!user) return null;

    const renderDetail = (label: string, value?: string | number | string[]) => {
        if (!value && value !== 0) return null;
        let displayValue = Array.isArray(value) ? value.join(', ') : String(value);

        return (
            <div className="grid grid-cols-3 gap-2 py-1.5">
                <dt className="font-semibold text-muted-foreground col-span-1">{label}</dt>
                <dd className="col-span-2">{displayValue}</dd>
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
                      {renderDetail("Designation", user.designation)}
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-base mb-2">Academic Details</h4>
                      {renderDetail("MIS ID", user.misId)}
                      {renderDetail("ORCID ID", user.orcidId)}
                      {renderDetail("Primary Faculty", user.faculty)}
                      {renderDetail("Assigned Faculties", user.faculties)}
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

interface UserWithClaims extends User {
  claimsCount: number;
}


export default function ManageUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [claimsCount, setClaimsCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [userToView, setUserToView] = useState<User | null>(null);
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' }>({ key: 'name', direction: 'ascending' });

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
  }, []);

  const fetchUsersAndClaims = useCallback(async () => {
    setLoading(true);
    try {
      const usersCollection = collection(db, 'users');
      const userSnapshot = await getDocs(usersCollection);
      const userList = userSnapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as User));
      setUsers(userList);

      const claimsCollection = collection(db, 'incentiveClaims');
      const claimsSnapshot = await getDocs(claimsCollection);
      const claimsList = claimsSnapshot.docs.map(doc => doc.data() as IncentiveClaim);
      
      const counts: Record<string, number> = {};
      for (const claim of claimsList) {
          counts[claim.uid] = (counts[claim.uid] || 0) + 1;
      }
      setClaimsCount(counts);

    } catch (error) {
      console.error("Error fetching users or claims:", error);
      toast({ variant: 'destructive', title: "Error", description: "Could not fetch users or claims data." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUsersAndClaims();
  }, [fetchUsersAndClaims]);
  
  const usersWithClaims = useMemo(() => {
    return users.map(user => ({
      ...user,
      claimsCount: claimsCount[user.uid] || 0
    }));
  }, [users, claimsCount]);
  
  const sortedAndFilteredUsers = useMemo(() => {
    let filtered: UserWithClaims[] = [...usersWithClaims];

    if (roleFilter !== 'all') {
      filtered = filtered.filter(user => user.role === roleFilter);
    }

    if (searchTerm) {
      const lowerCaseSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(user =>
        user.name.toLowerCase().includes(lowerCaseSearch) ||
        user.email.toLowerCase().includes(lowerCaseSearch)
      );
    }

    filtered.sort((a, b) => {
        const key = sortConfig.key;
        let aValue, bValue;

        if (key === 'claimsCount') {
          aValue = a.claimsCount;
          bValue = b.claimsCount;
        } else {
          aValue = a[key as keyof User] || '';
          bValue = b[key as keyof User] || '';
        }

        if (aValue < bValue) {
            return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
            return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
    });

    return filtered;
  }, [usersWithClaims, searchTerm, roleFilter, sortConfig]);

  const requestSort = (key: SortableKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
        direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const handleDeleteUser = useCallback(async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'users', uid));
      toast({ title: 'User Deleted', description: 'The user has been successfully deleted.' });
      fetchUsersAndClaims(); // Refresh the list
    } catch (error) {
       console.error("Error deleting user:", error);
       toast({ variant: 'destructive', title: "Error", description: "Could not delete user." });
    } finally {
      setUserToDelete(null);
    }
  }, [fetchUsersAndClaims, toast]);

  const handleRoleChange = useCallback(async (uid: string, newRole: User['role'], extraData?: Record<string, any>) => {
    try {
      const userDocRef = doc(db, 'users', uid);
      
      const newDesignation = newRole === 'Super-admin' ? 'Super-admin' : (extraData?.designation || 'faculty');
      const defaultModules = getDefaultModulesForRole(newRole, newDesignation);
      
      const updatePayload: Partial<User> = {
        role: newRole,
        allowedModules: defaultModules,
        designation: newDesignation,
        ...extraData
      };
      
      await updateDoc(userDocRef, updatePayload);
      
      toast({ title: 'Role Updated', description: "The user's role and permissions have been changed." });
      fetchUsersAndClaims();
    } catch (error) {
       console.error("Error updating role:", error);
       toast({ variant: 'destructive', title: "Error", description: "Could not update role." });
    }
  }, [fetchUsersAndClaims, toast]);
  
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

  const isCurrentUserSuperAdmin = currentUser?.role === 'Super-admin';
  const availableRoles = isCurrentUserSuperAdmin ? [...ROLES, SUPER_ADMIN_ROLE] : ROLES;

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Manage Users" description="View and manage user roles and permissions." />
      
      <div className="flex items-center py-4 gap-4">
          <Input
              placeholder="Filter by name or email..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="max-w-sm"
          />
          <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {availableRoles.map(role => (
                      <SelectItem key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</SelectItem>
                  ))}
              </SelectContent>
          </Select>
      </div>

      <div className="mt-4">
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                     <Button variant="ghost" onClick={() => requestSort('name')}>
                        Name <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                     <Button variant="ghost" onClick={() => requestSort('email')}>
                        Email <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>
                     <Button variant="ghost" onClick={() => requestSort('role')}>
                        Role <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                   <TableHead>
                     <Button variant="ghost" onClick={() => requestSort('faculty')}>
                        Faculty <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAndFilteredUsers.map((user) => {
                   const isPrimarySuperAdmin = user.email === PRIMARY_SUPER_ADMIN_EMAIL;
                   const isCurrentUserLoggedIn = user.uid === currentUser?.uid;
                   const isActionsDisabled = isCurrentUserLoggedIn || (isPrimarySuperAdmin && currentUser?.email !== PRIMARY_SUPER_ADMIN_EMAIL);

                   return (
                    <TableRow key={user.uid}>
                      <TableCell className="font-medium">
                        {user.misId ? (
                            <Link href={`/profile/${user.misId}`} className="hover:underline" target="_blank" rel="noopener noreferrer">
                                {user.name}
                            </Link>
                        ) : (
                            user.name
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'admin' || user.role === 'Super-admin' ? 'default' : 'secondary'}>{user.role}</Badge>
                      </TableCell>
                       <TableCell className="hidden sm:table-cell">{user.faculty || 'N/A'}</TableCell>
                      <TableCell className="text-right">
                         <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button aria-haspopup="true" size="icon" variant="ghost" disabled={isActionsDisabled}>
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Toggle menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => setUserToView(user)}>View Details</DropdownMenuItem>
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>Change Role</DropdownMenuSubTrigger>
                                <DropdownMenuPortal>
                                    <DropdownMenuSubContent>
                                        {availableRoles.map(role => (
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
                            {isCurrentUserSuperAdmin && user.role === 'CRO' && (
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>Assign Faculties</DropdownMenuSubTrigger>
                                    <DropdownMenuPortal>
                                        <DropdownMenuSubContent>
                                            <DropdownMenuLabel>Faculties</DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            {faculties.map(faculty => (
                                                <DropdownMenuCheckboxItem
                                                    key={faculty}
                                                    checked={user.faculties?.includes(faculty)}
                                                    onCheckedChange={(checked) => {
                                                        const currentFaculties = user.faculties || [];
                                                        const newFaculties = checked
                                                            ? [...currentFaculties, faculty]
                                                            : currentFaculties.filter(f => f !== faculty);
                                                        handleRoleChange(user.uid, user.role, { faculties: newFaculties });
                                                    }}
                                                >
                                                    {faculty}
                                                </DropdownMenuCheckboxItem>
                                            ))}
                                        </DropdownMenuSubContent>
                                    </DropdownMenuPortal>
                                </DropdownMenuSub>
                            )}
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

