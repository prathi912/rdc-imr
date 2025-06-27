
'use client';

import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import type { Project, User } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function AllProjectsPage() {
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const { toast } = useToast();

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

    async function getProjects() {
      setLoading(true);
      try {
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
        console.error("Error fetching projects: ", error);
      } finally {
        setLoading(false);
      }
    }
    getProjects();
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

  const handleExport = () => {
    if (allProjects.length === 0) {
      toast({ variant: 'destructive', title: "No Data", description: "There are no projects to export." });
      return;
    }
    
    const dataToExport = allProjects.map(p => ({
      'Project ID': p.id,
      'Project Title': p.title,
      'Project Type': p.type,
      'Submission Date': new Date(p.submissionDate).toLocaleDateString(),
      'Abstract': p.abstract,
      'Principal Investigator': p.pi,
      'PI Email': p.pi_email || 'N/A',
      'PI Phone': p.pi_phoneNumber || 'N/A',
      'Faculty': p.faculty,
      'Institute': p.institute,
      'Department': p.departmentName,
      'Status': p.status,
    }));

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
    toast({ title: "Export Started", description: `Downloading ${allProjects.length} projects.` });
  };


  return (
    <div className="container mx-auto py-10">
      <PageHeader title={pageTitle} description={pageDescription}>
        {(isAdmin || isCro || isSpecialUser) && (
            <Button onClick={handleExport} disabled={loading || allProjects.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Export XLSX
            </Button>
        )}
      </PageHeader>
      <div className="mt-8">
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
          <ProjectList projects={allProjects} userRole={isSpecialUser ? 'CRO' : user!.role} />
        )}
      </div>
    </div>
  );
}
