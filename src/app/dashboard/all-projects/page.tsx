
'use client';

import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { format, isAfter, isBefore, startOfToday } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { db } from '@/lib/config';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import type { Project, User } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Calendar as CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const STATUSES: Project['status'][] = ['Submitted', 'Under Review', 'Approved', 'Rejected', 'In Progress', 'Completed', 'Pending Completion Approval'];

const EXPORT_COLUMNS = [
  { id: 'id', label: 'Project ID' },
  { id: 'title', label: 'Project Title' },
  { id: 'type', label: 'Project Type' },
  { id: 'submissionDate', label: 'Submission Date' },
  { id: 'abstract', label: 'Abstract' },
  { id: 'pi', label: 'Principal Investigator' },
  { id: 'pi_email', label: 'PI Email' },
  { id: 'pi_phoneNumber', label: 'PI Phone' },
  { id: 'misId', label: 'MIS ID' },
  { id: 'designation', label: 'Designation' },
  { id: 'faculty', label: 'Faculty' },
  { id: 'institute', label: 'Institute' },
  { id: 'departmentName', label: 'Department' },
  { id: 'status', label: 'Status' },
];

export default function AllProjectsPage() {
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // State for export dialog
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportDateRange, setExportDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedExportColumns, setSelectedExportColumns] = useState<string[]>(EXPORT_COLUMNS.map(c => c.id));

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
    pageTitle = `Projects from ${user?.faculty}`;
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

  const handleColumnSelectionChange = (columnId: string, checked: boolean) => {
    setSelectedExportColumns(prev => {
      if (checked) {
        return [...prev, columnId];
      } else {
        return prev.filter(id => id !== columnId);
      }
    });
  };

  const handleConfirmExport = () => {
    let projectsToExport = [...filteredProjects];

    if (exportDateRange?.from && exportDateRange?.to) {
      projectsToExport = projectsToExport.filter(p => {
        const submissionDate = new Date(p.submissionDate);
        return isAfter(submissionDate, exportDateRange.from!) && isBefore(submissionDate, exportDateRange.to!);
      });
    }

    if (projectsToExport.length === 0) {
      toast({ variant: 'destructive', title: "No Data", description: "There are no projects to export with the selected filters." });
      return;
    }
    
    const userDetailsMap = new Map(users.map(u => [u.uid, { misId: u.misId || '', designation: u.designation || '' }]));
    
    const dataToExport = projectsToExport.map(p => {
      const userDetails = userDetailsMap.get(p.pi_uid);
      const projectData: { [key: string]: any } = {
        id: p.id,
        title: p.title,
        type: p.type,
        submissionDate: new Date(p.submissionDate).toLocaleDateString(),
        abstract: p.abstract,
        pi: p.pi,
        pi_email: p.pi_email || 'N/A',
        pi_phoneNumber: p.pi_phoneNumber || 'N/A',
        misId: userDetails?.misId || 'N/A',
        designation: userDetails?.designation || 'N/A',
        faculty: p.faculty,
        institute: p.institute,
        departmentName: p.departmentName,
        status: p.status,
      };

      const row: { [key: string]: any } = {};
      selectedExportColumns.forEach(colId => {
        const column = EXPORT_COLUMNS.find(c => c.id === colId);
        if (column) {
            row[column.label] = projectData[colId];
        }
      });
      return row;
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
    toast({ title: "Export Started", description: `Downloading ${projectsToExport.length} projects.` });
    setIsExportDialogOpen(false);
  };


  return (
    <div className="container mx-auto py-10">
      <PageHeader title={pageTitle} description={pageDescription}>
        {(isAdmin || isCro || isSpecialUser) && (
            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
                <DialogTrigger asChild>
                    <Button disabled={loading || filteredProjects.length === 0}>
                        <Download className="mr-2 h-4 w-4" />
                        Export XLSX
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Custom Export</DialogTitle>
                        <DialogDescription>Select filters and columns for your Excel export.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6 py-4">
                        <div>
                            <Label>Filter by Submission Date</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                <Button
                                    id="date"
                                    variant={"outline"}
                                    className={cn("w-full justify-start text-left font-normal mt-2", !exportDateRange && "text-muted-foreground")}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {exportDateRange?.from ? (
                                    exportDateRange.to ? (
                                        <>
                                        {format(exportDateRange.from, "LLL dd, y")} -{" "}
                                        {format(exportDateRange.to, "LLL dd, y")}
                                        </>
                                    ) : (
                                        format(exportDateRange.from, "LLL dd, y")
                                    )
                                    ) : (
                                    <span>Pick a date range</span>
                                    )}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={exportDateRange?.from}
                                    selected={exportDateRange}
                                    onSelect={setExportDateRange}
                                    numberOfMonths={2}
                                />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div>
                            <Label>Select Columns to Export</Label>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-2 p-4 border rounded-md max-h-60 overflow-y-auto">
                                {EXPORT_COLUMNS.map(column => (
                                    <div key={column.id} className="flex items-center space-x-2">
                                        <Checkbox 
                                            id={`col-${column.id}`} 
                                            checked={selectedExportColumns.includes(column.id)}
                                            onCheckedChange={(checked) => handleColumnSelectionChange(column.id, !!checked)}
                                        />
                                        <label htmlFor={`col-${column.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                            {column.label}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                        <Button onClick={handleConfirmExport}>Confirm & Export</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
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
