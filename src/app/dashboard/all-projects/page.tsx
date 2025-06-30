
'use client';

import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { db } from '@/lib/config';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import type { Project, User } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STATUSES: Project['status'][] = ['Submitted', 'Under Review', 'Approved', 'Rejected', 'In Progress', 'Completed', 'Pending Completion Approval'];

export default function AllProjectsPage() {
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    async function getProjectsAndUsers() {
      setLoading(true);
      try {
        const usersCol = collection(db, 'users');
        const userSnapshot = await getDocs(usersCol);
        const userList = userSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
        setUsers(userList);

        const projectsCol = collection(db, 'projects');
        let q;

        const isAdmin = ['admin', 'Super-admin'].includes(user.role);
        const isCro = user.role === 'CRO';
        const isSpecialUser = user.email === 'unnati.joshi22950@paruluniversity.ac.in';

        if (isSpecialUser) {
          q = query(
            projectsCol, 
            where('faculty', '==', 'Faculty of Engineering & Technology'),
            orderBy('submissionDate', 'desc')
          );
        } else if (isAdmin) {
          q = query(projectsCol, orderBy('submissionDate', 'desc'));
        } else if (isCro) {
          q = query(
            projectsCol, 
            where('faculty', '==', user.faculty),
            orderBy('submissionDate', 'desc')
          );
        } else {
          setAllProjects([]);
          setLoading(false);
          return;
        }

        const projectSnapshot = await getDocs(q);
        const projectList = projectSnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id,
        } as Project));
        setAllProjects(projectList);
      } catch (error) {
        console.error("Error fetching data: ", error);
      } finally {
        setLoading(false);
      }
    }
    getProjectsAndUsers();
  }, [user]);
  
  const isAdmin = user?.role === 'admin' || user?.role === 'Super-admin';
  const isCro = user?.role === 'CRO';
  const isSpecialUser = user?.email === 'unnati.joshi22950@paruluniversity.ac.in';
  
  let pageTitle = "All Projects";
  let pageDescription = "Browse and manage all projects in the system.";

  if (isSpecialUser) {
    pageTitle = "Projects from Faculty of Engineering & Technology";
    pageDescription = "Browse all projects submitted from the Faculty of Engineering & Technology.";
  } else if (isCro) {
    pageTitle = `Projects from ${user.faculty}`;
    pageDescription = "Browse all projects submitted from your faculty.";
  }

  const filteredProjects = useMemo(() => {
    return allProjects
      .filter(project => {
        if (statusFilter !== 'all' && project.status !== statusFilter) {
          return false;
        }
        if (searchTerm === '') {
          return true;
        }
        const lowerCaseSearch = searchTerm.toLowerCase();
        return (
          project.title.toLowerCase().includes(lowerCaseSearch) ||
          project.pi.toLowerCase().includes(lowerCaseSearch)
        );
      });
  }, [allProjects, searchTerm, statusFilter]);

  const handleExport = () => {
    if (filteredProjects.length === 0) {
      toast({ variant: 'destructive', title: "No Data", description: "There are no projects to export in the current view." });
      return;
    }
    
    const userDetailsMap = new Map(users.map(u => [u.uid, { misId: u.misId || '', designation: u.designation || '' }]));
    
    const dataToExport = filteredProjects.map(p => {
      const userDetails = userDetailsMap.get(p.pi_uid);
      return {
        'Project ID': p.id,
        'Project Title': p.title,
        'Project Type': p.type,
        'Submission Date': new Date(p.submissionDate).toLocaleDateString(),
        'Abstract': p.abstract,
        'Principal Investigator': p.pi,
        'PI Email': p.pi_email || 'N/A',
        'PI Phone': p.pi_phoneNumber || 'N/A',
        'MIS ID': userDetails?.misId || 'N/A',
        'Designation': userDetails?.designation || 'N/A',
        'Faculty': p.faculty,
        'Institute': p.institute,
        'Department': p.departmentName,
        'Status': p.status,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Projects");

    let fileName = `all_projects_${new Date().toISOString().split('T')[0]}.xlsx`;
    if (isCro && user?.faculty) {
        fileName = `projects_${user.faculty.replace(/[ &]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    } else if (isSpecialUser) {
        fileName = `projects_Eng_Tech_${new Date().toISOString().split('T')[0]}.xlsx`;
    }
    
    XLSX.writeFile(workbook, fileName);
    toast({ title: "Export Started", description: `Downloading ${filteredProjects.length} projects.` });
  };


  return (
    <div className="container mx-auto py-10">
      <PageHeader title={pageTitle} description={pageDescription}>
        {(isAdmin || isCro || isSpecialUser) && (
            <Button onClick={handleExport} disabled={loading || filteredProjects.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Export XLSX
            </Button>
        )}
      </PageHeader>
      
      <div className="flex items-center py-4 gap-4">
        <Input
            placeholder="Filter by title or PI..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUSES.map(status => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
            </SelectContent>
        </Select>
      </div>

      <div className="mt-4">
        {loading ? (
           <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </CardContent>
          </Card>
        ) : (
          <ProjectList projects={filteredProjects} userRole={isSpecialUser ? 'CRO' : user!.role} />
        )}
      </div>
    </div>
  );
}
