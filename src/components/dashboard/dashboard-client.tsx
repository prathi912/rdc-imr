'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { AdminDashboard } from './admin-dashboard';
import { FacultyDashboard } from './faculty-dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import type { User } from '@/types';

interface DashboardClientProps {
  user: User;
  setUser: (user: User) => void;
  adminUser: User;
  facultyUser: User;
}

export function DashboardClient({ user, setUser, adminUser, facultyUser }: DashboardClientProps) {
  const handleRoleChange = (value: string) => {
    if (value === 'admin') {
      setUser(adminUser);
    } else {
      setUser(facultyUser);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>View As</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={user.role}
            onValueChange={handleRoleChange}
            className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:space-x-6 sm:space-y-0"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="faculty" id="r-faculty" />
              <Label htmlFor="r-faculty">Faculty ({facultyUser.email})</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="admin" id="r-admin" />
              <Label htmlFor="r-admin">Admin ({adminUser.email})</Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>
      
      <div className="transition-all duration-300">
        {user.role === 'admin' && <AdminDashboard />}
        {user.role === 'faculty' && <FacultyDashboard />}
      </div>
    </div>
  );
}
