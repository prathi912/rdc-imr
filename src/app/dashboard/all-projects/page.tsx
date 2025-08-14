
'use client';

import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { format, isAfter, isBefore, startOfToday, parseISO } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { db } from '@/lib/config';
import { collection, getDocs, query, where, orderBy, or } from 'firebase/firestore';
import type { Project, User, EmrInterest, FundingCall } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Calendar as CalendarIcon, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { createDebugInfo, logDebugInfo } from '@/lib/debug-utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';


const STATUSES: Project['status'][] = ['Submitted', 'Under Review', 'Recommended', 'Not Recommended', 'In Progress', 'Completed', 'Pending Completion Approval'];

const IMR_EXPORT_COLUMNS = [
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

const EMR_EXPORT_COLUMNS = [
    { id: 'callTitle', label: 'Project Title' },
    { id: 'agency', label: 'Funding Agency' },
    { id: 'piName', label: 'PI Name' },
    { id: 'piEmail', label: 'PI Email' },
    { id: 'piInstitute', label: 'PI Institute' },
    { id: 'piDepartment', label: 'PI Department' },
    { id: 'coPiNames', label: 'Co-PI Names' },
    { id: 'status', label: 'Status' },
    { id: 'sanctionDate', label: 'Sanction Date' },
    { id: 'durationAmount', label: 'Duration & Amount' },
];


export default function AllProjectsPage() {
  const [allImrProjects, setAllImrProjects] = useState<Project[]>([]);
  const [allEmrProjects, setAllEmrProjects] = useState<EmrInterest[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [facultyFilter, setFacultyFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('imr');
  const isMobile = useIsMobile();

  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportDateRange, setExportDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedExportColumns, setSelectedExportColumns] = useState<string[]>(IMR_EXPORT_COLUMNS.map(c => c.id));
  
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      if (parsedUser.role === 'CRO') {
        setFacultyFilter('all');
      }
    } else {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
      setSelectedExportColumns(activeTab === 'imr' ? IMR_EXPORT_COLUMNS.map(c => c.id) : EMR_EXPORT_COLUMNS.map(c => c.id));
  }, [activeTab]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const fetchAllData = async () => {
        try {
            const usersCol = collection(db, 'users');
            const userSnapshot = await getDocs(usersCol);
            const userList = userSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
            setUsers(userList);

            const projectsCol = collection(db, 'projects');
            const emrInterestsCol = collection(db, 'emrInterests');
            const isSuperAdmin = user?.role === 'Super-admin';
            const isAdmin = user?.role === 'admin';
            const isCro = user?.role === 'CRO';
            const isPrincipal = user?.designation === 'Principal';
            const isHod = user?.designation === 'HOD';

            let imrQuery;
            let emrQuery;

            if (isSuperAdmin || isAdmin) {
                imrQuery = query(projectsCol, orderBy('submissionDate', 'desc'));
                emrQuery = query(emrInterestsCol, where('status', 'in', ['Sanctioned', 'Process Complete']));
            } else if (isCro && user.faculties && user.faculties.length > 0) {
                imrQuery = query(projectsCol, where('faculty', 'in', user.faculties), orderBy('submissionDate', 'desc'));
                emrQuery = query(emrInterestsCol, where('faculty', 'in', user.faculties), where('status', 'in', ['Sanctioned', 'Process Complete']));
            } else if (isPrincipal && user.institute) {
                imrQuery = query(projectsCol, where('institute', '==', user.institute), orderBy('submissionDate', 'desc'));
                emrQuery = query(emrInterestsCol, where('faculty', '==', user.faculty), where('status', 'in', ['Sanctioned', 'Process Complete'])); // Assuming institute is tied to faculty
            } else if (isHod && user.department && user.institute) {
                 imrQuery = query(
                    projectsCol, 
                    where('departmentName', '==', user.department), 
                    where('institute', '==', user.institute),
                    orderBy('submissionDate', 'desc')
                );
                emrQuery = query(emrInterestsCol, where('department', '==', user.department), where('status', 'in', ['Sanctioned', 'Process Complete']));
            } else {
                imrQuery = query(projectsCol, where('pi_uid', '==', user.uid), orderBy('submissionDate', 'desc'));
                emrQuery = query(emrInterestsCol, where('userId', '==', user.uid), where('status', 'in', ['Sanctioned', 'Process Complete']));
            }

            const [imrSnapshot, emrSnapshot] = await Promise.all([
                getDocs(imrQuery),
                getDocs(emrQuery)
            ]);

            setAllImrProjects(imrSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project)));
            setAllEmrProjects(emrSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as EmrInterest)));

        } catch (error) {
            console.error("Error fetching projects: ", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch project data.' });
        } finally {
            setLoading(false);
        }
    };

    fetchAllData();
  }, [user, toast]);
  
  const hasAdminView = user?.role === 'Super-admin' || user?.role === 'admin' || user?.role === 'CRO' || user?.designation === 'Principal' || user?.designation === 'HOD';

  const filteredImrProjects = useMemo(() => {
    return allImrProjects.filter(project => {
      if (statusFilter !== 'all' && project.status !== statusFilter) return false;
      if (user?.role === 'CRO' && facultyFilter !== 'all' && project.faculty !== facultyFilter) return false;
      if (!searchTerm) return true;
      const lowerCaseSearch = searchTerm.toLowerCase();
      return project.title.toLowerCase().includes(lowerCaseSearch) || project.pi.toLowerCase().includes(lowerCaseSearch);
    });
  }, [allImrProjects, searchTerm, statusFilter, facultyFilter, user]);
  
  const filteredEmrProjects = useMemo(() => {
      return allEmrProjects.filter(project => {
          if (!searchTerm) return true;
          const lowerCaseSearch = searchTerm.toLowerCase();
          const title = project.callTitle || '';
          return title.toLowerCase().includes(lowerCaseSearch) || project.userName.toLowerCase().includes(lowerCaseSearch) || (project.agency || '').toLowerCase().includes(lowerCaseSearch);
      })
  }, [allEmrProjects, searchTerm]);

  let pageTitle = "All Projects";
  let pageDescription = "Browse and manage all projects in the system.";
  
  if (user?.designation === 'Principal' && user?.institute) pageTitle = `Projects from ${user.institute}`;
  if (user?.designation === 'HOD' && user?.department) pageTitle = `Projects from ${user.department}`;
  if (user?.role === 'CRO' && facultyFilter !== 'all') pageTitle = `Projects from ${facultyFilter}`;

  const EXPORT_COLUMNS = activeTab === 'imr' ? IMR_EXPORT_COLUMNS : EMR_EXPORT_COLUMNS;

  const handleConfirmExport = () => {
      if (activeTab === 'imr') {
          exportImrProjects();
      } else {
          exportEmrProjects();
      }
      setIsExportDialogOpen(false);
  };
  
  const exportImrProjects = () => {
    let projectsToExport = [...filteredImrProjects];
    if (exportDateRange?.from) {
      projectsToExport = projectsToExport.filter(p => isAfter(parseISO(p.submissionDate), exportDateRange.from!) && (!exportDateRange.to || isBefore(parseISO(p.submissionDate), exportDateRange.to!)));
    }
    if (projectsToExport.length === 0) {
      toast({ variant: 'destructive', title: "No Data", description: "No IMR projects to export with selected filters." }); return;
    }
    const usersMap = new Map(users.map(u => [u.uid, u]));
    const dataToExport = projectsToExport.map(p => {
      const userDetails = usersMap.get(p.pi_uid);
      const coPiNames = (p.coPiDetails || []).map(c => c.name).join(', ');
      const row: { [key: string]: any } = {};
      selectedExportColumns.forEach(colId => {
        const column = IMR_EXPORT_COLUMNS.find(c => c.id === colId);
        if (column) row[column.label] = { title: p.title, type: p.type, submissionDate: new Date(p.submissionDate).toLocaleDateString(), abstract: p.abstract, pi: p.pi, pi_email: p.pi_email, pi_phoneNumber: p.pi_phoneNumber, misId: userDetails?.misId, designation: userDetails?.designation, institute: p.institute, departmentName: p.departmentName, status: p.status, coPiNames: coPiNames || 'N/A' }[colId];
      });
      return row;
    });
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "IMR_Projects");
    XLSX.writeFile(workbook, `IMR_Projects_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: "Export Started", description: `Downloading ${projectsToExport.length} IMR projects.` });
  };
  
  const exportEmrProjects = () => {
      if (filteredEmrProjects.length === 0) {
          toast({ variant: 'destructive', title: "No Data", description: "No EMR projects to export." }); return;
      }
      const usersMap = new Map(users.map(u => [u.uid, u]));
      const dataToExport = filteredEmrProjects.map(p => {
          const userDetails = usersMap.get(p.userId);
          const row: { [key: string]: any } = {};
          selectedExportColumns.forEach(colId => {
               const column = EMR_EXPORT_COLUMNS.find(c => c.id === colId);
               if(column) row[column.label] = { callTitle: p.callTitle, agency: p.agency, piName: p.userName, piEmail: p.userEmail, piInstitute: userDetails?.institute, piDepartment: userDetails?.department, coPiNames: p.coPiNames?.join(', ') || 'N/A', status: p.status, sanctionDate: p.sanctionDate ? new Date(p.sanctionDate).toLocaleDateString() : 'N/A', durationAmount: p.durationAmount }[colId];
          });
          return row;
      });
       const worksheet = XLSX.utils.json_to_sheet(dataToExport);
       const workbook = XLSX.utils.book_new();
       XLSX.utils.book_append_sheet(workbook, worksheet, "EMR_Projects");
       XLSX.writeFile(workbook, `EMR_Projects_${new Date().toISOString().split('T')[0]}.xlsx`);
       toast({ title: "Export Started", description: `Downloading ${filteredEmrProjects.length} EMR projects.` });
  };

  const handleColumnSelectionChange = (columnId: string, checked: boolean) => {
    setSelectedExportColumns(prev => checked ? [...prev, columnId] : prev.filter(id => id !== columnId));
  };


  return (
    <div className="container mx-auto py-10">
      <PageHeader title={pageTitle} description={pageDescription}>
        {hasAdminView && (
            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
                <DialogTrigger asChild>
                    <Button disabled={loading || (activeTab === 'imr' && filteredImrProjects.length === 0) || (activeTab === 'emr' && filteredEmrProjects.length === 0)}>
                        <Download className="mr-2 h-4 w-4" /> Export XLSX
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Custom Export for {activeTab.toUpperCase()} Projects</DialogTitle>
                        <DialogDescription>Select filters and columns for your Excel export.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6 py-4">
                        {activeTab === 'imr' && (
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
                                        <PopoverTrigger asChild><Button id="date" variant={"outline"} className={cn("w-full justify-start text-left font-normal mt-2", !exportDateRange && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{exportDateRange?.from ? (exportDateRange.to ? (`${format(exportDateRange.from, "LLL dd, y")} - ${format(exportDateRange.to, "LLL dd, y")}`) : format(exportDateRange.from, "LLL dd, y")) : (<span>Pick a date range</span>)}</Button></PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start"><Calendar initialFocus mode="range" defaultMonth={exportDateRange?.from} selected={exportDateRange} onSelect={setExportDateRange} /></PopoverContent>
                                    </Popover>
                                )}
                            </div>
                        )}
                        <div>
                            <Label>Select Columns to Export</Label>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-2 p-4 border rounded-md max-h-60 overflow-y-auto">
                                {EXPORT_COLUMNS.map(column => (
                                    <div key={column.id} className="flex items-center space-x-2">
                                        <Checkbox id={`col-${column.id}`} checked={selectedExportColumns.includes(column.id)} onCheckedChange={(checked) => handleColumnSelectionChange(column.id, !!checked)} />
                                        <label htmlFor={`col-${column.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{column.label}</label>
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
        <Input placeholder="Filter by title or PI..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="w-full sm:w-auto sm:flex-grow md:flex-grow-0 md:max-w-xs" />
        <div className="w-full sm:w-auto flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter} disabled={activeTab === 'emr'}>
                <SelectTrigger className="w-full sm:w-[220px]"><SelectValue placeholder="Filter by status" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Statuses</SelectItem>{STATUSES.map(status => (<SelectItem key={status} value={status}>{status}</SelectItem>))}</SelectContent>
            </Select>
            {user?.role === 'CRO' && user.faculties && user.faculties.length > 1 && (
                 <Select value={facultyFilter} onValueChange={setFacultyFilter}>
                    <SelectTrigger className="w-full sm:w-[280px]"><SelectValue placeholder="Filter by faculty" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Assigned Faculties</SelectItem>{user.faculties.map(faculty => (<SelectItem key={faculty} value={faculty}>{faculty}</SelectItem>))}</SelectContent>
                </Select>
            )}
        </div>
      </div>

        {hasAdminView ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList><TabsTrigger value="imr">IMR Projects</TabsTrigger><TabsTrigger value="emr">EMR Projects</TabsTrigger></TabsList>
                <TabsContent value="imr" className="mt-4">
                    {loading ? <Skeleton className="h-64 w-full" /> : <ProjectList projects={filteredImrProjects} currentUser={user!} allUsers={users} />}
                </TabsContent>
                <TabsContent value="emr" className="mt-4">
                     {loading ? <Skeleton className="h-64 w-full" /> : (
                         <Card>
                            <CardContent className="pt-6">
                                <Table>
                                    <TableHeader><TableRow><TableHead>Project Title</TableHead><TableHead>PI</TableHead><TableHead>Agency</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                                    <TableBody>{filteredEmrProjects.map(p => {
                                        const pi = users.find(u => u.uid === p.userId);
                                        return (
                                        <TableRow key={p.id}>
                                            <TableCell className="font-medium">{p.callTitle || 'N/A'}</TableCell>
                                            <TableCell>{pi?.name || p.userName}</TableCell>
                                            <TableCell>{p.agency || 'N/A'}</TableCell>
                                            <TableCell><Badge>{p.status}</Badge></TableCell>
                                            <TableCell className="text-right">
                                                {pi?.misId && (
                                                    <Button asChild variant="outline" size="icon"><Link href={`/profile/${pi.misId}`}><Eye className="h-4 w-4" /></Link></Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )})}</TableBody>
                                </Table>
                            </CardContent>
                         </Card>
                     )}
                </TabsContent>
            </Tabs>
        ) : (
            <div className="mt-4">
                {loading ? <Skeleton className="h-64 w-full" /> : <ProjectList projects={filteredImrProjects} currentUser={user!} allUsers={users} />}
            </div>
        )}
    </div>
  );
}
