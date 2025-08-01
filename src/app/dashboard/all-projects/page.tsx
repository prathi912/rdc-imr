
'use client';

import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { format, isAfter, isBefore, startOfToday, parseISO } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { db } from '@/lib/config';
import { collection, getDocs, query, where, orderBy, or } from 'firebase/firestore';
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
import { createDebugInfo, logDebugInfo, findInstituteMatches } from '@/lib/debug-utils';
import { useIsMobile } from '@/hooks/use-mobile';


const STATUSES: Project['status'][] = ['Submitted', 'Under Review', 'Recommended', 'Not Recommended', 'In Progress', 'Completed', 'Pending Completion Approval'];

const EXPORT_COLUMNS = [
  { id: 'title', label: 'Project Title' },
  { id: 'type', label: 'Category' },
  { id: 'submissionDate', label: 'Submission Date' },
  { id: 'abstract', label: 'Abstract' },
  { id: 'pi', label: 'Principal Investigator' },
  { id: 'pi_email', label: 'PI Email' },
  { id: 'pi_phoneNumber', label: 'PI Phone' },
  { id: 'misId', label: 'MIS ID' },
  { id: 'designation', label: 'Designation' },
  { id: 'institute', label: 'Institute' },
  { id: 'departmentName', label: 'Department' },
  { id: 'status', label: 'Status' },
  { id: 'coPiNames', label: 'Co-PI Names' },
];

export default function AllProjectsPage() {
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [facultyFilter, setFacultyFilter] = useState('all');
  const isMobile = useIsMobile();

  // State for export dialog
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportDateRange, setExportDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedExportColumns, setSelectedExportColumns] = useState<string[]>(EXPORT_COLUMNS.map(c => c.id));
  
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      // For CROs, default to showing all their assigned faculties.
      if (parsedUser.role === 'CRO') {
        setFacultyFilter('all');
      }
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    setLoading(true);

    const usersCol = collection(db, 'users');
    getDocs(usersCol).then(userSnapshot => {
        const userList = userSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
        setUsers(userList);
    }).catch(error => {
        console.error("Error fetching users:", error);
    });

    async function fetchProjects() {
        try {
            const projectsCol = collection(db, 'projects');
            const isSuperAdmin = user?.role === 'Super-admin';
            const isAdmin = user?.role === 'admin';
            const isCro = user?.role === 'CRO';
            const isPrincipal = user?.designation === 'Principal';
            const isHod = user?.designation === 'HOD';
            const isSpecialPitUser = user?.email === 'pit@paruluniversity.ac.in';


            let projectList: Project[] = [];

            if (isSuperAdmin || isAdmin) {
                const q = query(projectsCol, orderBy('submissionDate', 'desc'));
                const snapshot = await getDocs(q);
                projectList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project));
            } else if (isCro && user.faculties && user.faculties.length > 0) {
                // Fetch projects for all assigned faculties
                const croFaculties = user.faculties;
                const q = query(projectsCol, where('faculty', 'in', croFaculties), orderBy('submissionDate', 'desc'));
                const snapshot = await getDocs(q);
                projectList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project));
            } else if (isHod && user.department && user.institute) {
                const q = query(
                    projectsCol, 
                    where('departmentName', '==', user.department), 
                    where('institute', '==', user.institute),
                    orderBy('submissionDate', 'desc')
                );
                const snapshot = await getDocs(q);
                projectList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project));
            } else if (isSpecialPitUser) {
                 const q = query(projectsCol, where('institute', 'in', ['Parul Institute of Technology', 'Parul Institute of Technology-Diploma studies']), orderBy('submissionDate', 'desc'));
                 const snapshot = await getDocs(q);
                 projectList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project));
            }
            else if (isPrincipal && user.institute) {
                // First, try an exact match.
                const exactQuery = query(projectsCol, where('institute', '==', user.institute), orderBy('submissionDate', 'desc'));
                let snapshot = await getDocs(exactQuery);

                if (snapshot.empty) {
                    // Fallback to client-side filtering if exact match yields no results
                    const allProjectsSnapshot = await getDocs(query(projectsCol, orderBy('submissionDate', 'desc')));
                    projectList = allProjectsSnapshot.docs
                        .map(doc => ({ ...doc.data(), id: doc.id } as Project))
                        .filter(p => p.institute && p.institute.toLowerCase() === user!.institute!.toLowerCase());

                    // Logging for debug purposes
                    const allProjectInstitutes = allProjectsSnapshot.docs.map(d => d.data().institute);
                    const debugInfo = createDebugInfo(user, projectList);
                    logDebugInfo(debugInfo, 'All Projects Fallback');

                } else {
                    projectList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project));
                }

            } else {
                const q = query(projectsCol, where('pi_uid', '==', user.uid), orderBy('submissionDate', 'desc'));
                 const snapshot = await getDocs(q);
                projectList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project));
            }
            
            setAllProjects(projectList);
        } catch (error) {
            console.error("Error fetching projects: ", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch project data.' });
        } finally {
            setLoading(false);
        }
    }

    fetchProjects();
}, [user, toast]);
  
  const isSuperAdmin = user?.role === 'Super-admin';
  const isAdmin = user?.role === 'admin';
  const isCro = user?.role === 'CRO';
  const isPrincipal = user?.designation === 'Principal';
  const isHod = user?.designation === 'HOD';
  const hasExportAccess = isSuperAdmin || isAdmin || isCro || isPrincipal || isHod;
  
  let pageTitle = "All Projects";
  let pageDescription = "Browse and manage all projects in the system.";
  let exportFileName = 'all_projects';

  if (user?.email === 'pit@paruluniversity.ac.in') {
      pageTitle = `Projects from Parul Institute of Technology`;
      pageDescription = "Browse all projects from Parul Institute of Technology and its Diploma studies wing.";
      exportFileName = `projects_PIT_Combined`;
  }
  else if (isPrincipal && user?.institute) {
    pageTitle = `Projects from ${user.institute}`;
    pageDescription = "Browse all projects submitted from your institute.";
    exportFileName = `projects_${user.institute.replace(/[ &]/g, '_')}`;
  } else if (isPrincipal && !user?.institute) {
    pageTitle = "All Projects (Principal - No Institute Set)";
    pageDescription = "Your institute information is not configured. Please update your profile to see institute-specific projects.";
    exportFileName = 'principal_all_projects';
  } else if (isHod && user?.department) {
    pageTitle = `Projects from ${user.department}`;
    pageDescription = `Browse all projects submitted from your department within ${user.institute}.`;
    exportFileName = `projects_${user.department.replace(/[ &]/g, '_')}`;
  } else if (isCro && user?.faculties) {
      if (facultyFilter === 'all' || !facultyFilter) {
          pageTitle = `Projects from All Your Faculties`;
      } else {
          pageTitle = `Projects from ${facultyFilter}`;
      }
      pageDescription = "Browse all projects submitted from your assigned faculties.";
      exportFileName = `projects_${facultyFilter.replace(/[ &]/g, '_')}`;
  }

  const filteredProjects = useMemo(() => {
    return allProjects
      .filter(project => {
        if (statusFilter !== 'all' && project.status !== statusFilter) {
          return false;
        }
        if (isCro && facultyFilter !== 'all' && project.faculty !== facultyFilter) {
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
  }, [allProjects, searchTerm, statusFilter, facultyFilter, isCro]);

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

    if (exportDateRange?.from) {
      projectsToExport = projectsToExport.filter(p => {
        const submissionDate = parseISO(p.submissionDate);
        // If there's an end date, check the range. Otherwise just check 'after from'.
        return isAfter(submissionDate, exportDateRange.from!) && (!exportDateRange.to || isBefore(submissionDate, exportDateRange.to!));
      });
    }

    if (projectsToExport.length === 0) {
      toast({ variant: 'destructive', title: "No Data", description: "There are no projects to export with the selected filters." });
      return;
    }
    
    const usersMap = new Map(users.map(u => [u.uid, u]));
    
    const dataToExport = projectsToExport.map(p => {
      const userDetails = usersMap.get(p.pi_uid);
      const coPiNames = (p.coPiUids || [])
        .map(uid => usersMap.get(uid)?.name)
        .filter(Boolean)
        .join(', ');

      const projectData: { [key: string]: any } = {
        title: p.title,
        type: p.type,
        submissionDate: new Date(p.submissionDate).toLocaleDateString(),
        abstract: p.abstract,
        pi: p.pi,
        pi_email: p.pi_email || 'N/A',
        pi_phoneNumber: p.pi_phoneNumber || 'N/A',
        misId: userDetails?.misId || 'N/A',
        designation: userDetails?.designation || 'N/A',
        institute: p.institute,
        departmentName: p.departmentName,
        status: p.status,
        coPiNames: coPiNames || 'N/A',
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
    
    XLSX.writeFile(workbook, `${exportFileName}_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: "Export Started", description: `Downloading ${projectsToExport.length} projects.` });
    setIsExportDialogOpen(false);
  };


  return (
    <div className="container mx-auto py-10">
      <PageHeader title={pageTitle} description={pageDescription}>
        {hasExportAccess && (
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
                             {isMobile ? (
                                <div className="flex items-center gap-2 mt-2">
                                  <Input type="date" value={exportDateRange?.from ? format(exportDateRange.from, 'yyyy-MM-dd') : ''} onChange={(e) => setExportDateRange(prev => ({ ...prev, from: e.target.value ? parseISO(e.target.value) : undefined }))} />
                                  <span>-</span>
                                  <Input type="date" value={exportDateRange?.to ? format(exportDateRange.to, 'yyyy-MM-dd') : ''} onChange={(e) => setExportDateRange(prev => ({ ...prev, to: e.target.value ? parseISO(e.target.value) : undefined }))} />
                                </div>
                             ) : (
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
                                    />
                                    </PopoverContent>
                                </Popover>
                             )}
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
      
      <div className="flex flex-col sm:flex-row flex-wrap items-center py-4 gap-2 sm:gap-4">
        <Input
            placeholder="Filter by title or PI..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full sm:w-auto sm:flex-grow md:flex-grow-0 md:max-w-xs"
        />
        <div className="w-full sm:w-auto flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[220px]">
                    <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {STATUSES.map(status => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {isCro && user && user.faculties && user.faculties.length > 1 && (
                 <Select value={facultyFilter} onValueChange={setFacultyFilter}>
                    <SelectTrigger className="w-full sm:w-[280px]">
                        <SelectValue placeholder="Filter by faculty" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Assigned Faculties</SelectItem>
                        {user.faculties.map(faculty => (
                            <SelectItem key={faculty} value={faculty}>{faculty}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
        </div>
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
          <ProjectList projects={filteredProjects} userRole={user!.role} allUsers={users} />
        )}
      </div>
    </div>
  );
}
