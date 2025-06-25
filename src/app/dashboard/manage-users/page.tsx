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
import { User } from '@/types';

const users: User[] = [
    { uid: 'admin-id', name: 'Pranav Rathi', email: 'rathipranav07@gmail.com', role: 'admin' },
    { uid: 'faculty-id', name: 'Faculty Member', email: 'faculty.member@paruluniversity.ac.in', role: 'faculty' },
    { uid: 'faculty-2', name: 'Jane Doe', email: 'jane.doe@paruluniversity.ac.in', role: 'faculty' },
    { uid: 'faculty-3', name: 'John Smith', email: 'john.smith@paruluniversity.ac.in', role: 'faculty' },
    { uid: 'faculty-4', name: 'Emily White', email: 'emily.white@paruluniversity.ac.in', role: 'faculty' },
    { uid: 'faculty-5', name: 'Michael Brown', email: 'michael.brown@paruluniversity.ac.in', role: 'faculty' },
];

export default function ManageUsersPage() {
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
                          <Button aria-haspopup="true" size="icon" variant="ghost">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Toggle menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem>Edit Role</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">Delete User</DropdownMenuItem>
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
