'use client';

import { useState } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { AdminDashboard } from './admin-dashboard';
import { FacultyDashboard } from './faculty-dashboard';
import { EvaluatorDashboard } from './evaluator-dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export type Role = 'admin' | 'faculty' | 'evaluator';

export function DashboardClient() {
  const [role, setRole] = useState<Role>('faculty');

  return (
    <div className="flex flex-col gap-6">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>View As</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            defaultValue="faculty"
            onValueChange={(value: Role) => setRole(value)}
            className="flex items-center space-x-6"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="faculty" id="r-faculty" />
              <Label htmlFor="r-faculty">Faculty/Student</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="evaluator" id="r-evaluator" />
              <Label htmlFor="r-evaluator">Evaluator</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="admin" id="r-admin" />
              <Label htmlFor="r-admin">Admin</Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>
      
      <div className="transition-all duration-300">
        {role === 'admin' && <AdminDashboard />}
        {role === 'faculty' && <FacultyDashboard />}
        {role === 'evaluator' && <EvaluatorDashboard />}
      </div>
    </div>
  );
}
