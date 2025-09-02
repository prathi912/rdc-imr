
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { format, isAfter, isBefore, startOfToday, parseISO } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { db } from '@/lib/config';
import { collection, getDocs, query, where, orderBy, or } from 'firebase/firestore';
import type { Project, User, EmrInterest, FundingCall, CoPiDetails } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Calendar as CalendarIcon, Eye, Upload, Loader2, Edit, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import * as z from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { updateEmrFinalStatus, updateEmrInterestCoPis } from '@/app/emr-actions';
import { findUserByMisId } from '@/app/userfinding';


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

const editEmrSchema = z.object({
    status: z.enum(['Sanctioned', 'Not Sanctioned'], { required_error: 'Please select a final status.' }),
    finalProof: z.any().optional(),
});

function EditEmrProjectDialog({ interest, isOpen, onOpenChange, onActionComplete }: { interest: EmrInterest; isOpen: boolean; onOpenChange: (open: boolean) => void; onActionComplete: () => void; }) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [coPiSearchTerm, setCoPiSearchTerm] = useState('');
    const [foundCoPis, setFoundCoPis] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [coPiList, setCoPiList] = useState<CoPiDetails[]>(interest.coPiDetails || []);
    const [isSelectionOpen, setIsSelectionOpen] = useState(false);

    const form = useForm<z.infer<typeof editEmrSchema>>({
        resolver: zodResolver(editEmrSchema),
        defaultValues: {
            status: interest.status === 'Sanctioned' || interest.status === 'Not Sanctioned' ? interest.status : undefined,
        }
    });

    const fileToDataUrl = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });
    };

    const handleSearchCoPi = async () => {
        if (!coPiSearchTerm) return;
        setIsSearching(true);
        try {
            const result = await findUserByMisId(coPiSearchTerm);
            if (result.success && result.users && result.users.length > 0) {
                if (result.users.length === 1) {
                    handleAddCoPi(result.users[0]);
                } else {
                    setFoundCoPis(result.users);
                    setIsSelectionOpen(true);
                }
            } else {
                toast({ variant: 'destructive', title: 'User Not Found', description: result.error });
            }
        } finally { setIsSearching(false); }
    };

    const handleAddCoPi = (selectedUser: any) => {
        if (selectedUser && !coPiList.some(c => c.email === selectedUser.email)) {
            setCoPiList(prev => [...prev, selectedUser]);
        }
        setCoPiSearchTerm('');
        setFoundCoPis([]);
        setIsSelectionOpen(false);
    };

    const handleRemoveCoPi = (email: string) => {
        setCoPiList(prev => prev.filter(c => c.email !== email));
    };

    const handleSave = async (values: z.infer<typeof editEmrSchema>) => {
        setIsSubmitting(true);
        try {
            const coPiResult = await updateEmrInterestCoPis(interest.id, coPiList);
            if (!coPiResult.success) {
                throw new Error(coPiResult.error);
            }

            const proofFile = values.finalProof?.[0];
            if (proofFile) {
                const dataUrl = await fileToDataUrl(proofFile);
                const statusResult = await updateEmrFinalStatus(interest.id, values.status, dataUrl, proofFile.name);
                if (!statusResult.success) {
                    throw new Error(statusResult.error);
                }
            } else if (values.status !== interest.status && interest.finalProofUrl) {
                // If status is changed but no new file, it implies proof is already there or not needed.
                // We should probably have a separate action just for status, but for now this is a simple path.
                // For safety, let's just assume this means "update status".
                // A better implementation would separate these concerns.
                 const statusResult = await updateEmrFinalStatus(interest.id, values.status, interest.finalProofUrl, 'existing_proof.pdf');
                 if (!statusResult.success) throw new Error(statusResult.error);
            }

            toast({ title: 'Success', description: 'EMR project details updated.' });
            onActionComplete();
            onOpenChange(false);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Edit EMR Project: {interest.callTitle}</DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-6 max-h-[60vh] overflow-y-auto pr-4">
                    <div>
                        <Label>Manage Co-PIs</Label>
                        <div className="flex gap-2 mt-1">
                            <Input placeholder="Search & Add Co-PI by MIS ID..." value={coPiSearchTerm} onChange={e => setCoPiSearchTerm(e.target.value)} />
                            <Button onClick={handleSearchCoPi} disabled={isSearching}>{isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}</Button>
                        </div>
                         <div className="space-y-2 mt-2">
                            {coPiList.map(coPi => (
                                <div key={coPi.email} className="flex justify-between items-center p-2 bg-muted rounded-md text-sm">
                                    <span>{coPi.name}</span>
                                    <Button variant="ghost" size="sm" onClick={() => handleRemoveCoPi(coPi.email)}>Remove</Button>
                                </div>
                            ))}
                        </div>
                    </div>
                    <Form {...form}>
                         <form id="edit-emr-form" onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
                             <FormField
                                name="status"
                                control={form.control}
                                render={({ field }) => (
                                    <FormItem className="space-y-3">
                                    <FormLabel>Final Status</FormLabel>
                                    <FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex space-x-4"><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="Sanctioned" /></FormControl><FormLabel className="font-normal">Sanctioned</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="Not Sanctioned" /></FormControl><FormLabel className="font-normal">Not Sanctioned</FormLabel></FormItem></RadioGroup></FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                name="finalProof"
                                control={form.control}
                                render={({ field: { onChange, value, ...rest }}) => (
                                    <FormItem>
                                        <FormLabel>Upload/Replace Proof Document (PDF)</FormLabel>
                                        <FormControl><Input type="file" accept=".pdf" onChange={(e) => onChange(e.target.files)} {...rest} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                         </form>
                    </Form>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" form="edit-emr-form" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Changes'}</Button>
                </DialogFooter>
                 <Dialog open={isSelectionOpen} onOpenChange={setIsSelectionOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Multiple Users Found</DialogTitle>
                            <DialogDescription>Please select the correct user to add.</DialogDescription>
                        </DialogHeader>
                        <RadioGroup onValueChange={(value) => handleAddCoPi(JSON.parse(value))} className="py-4 space-y-2">
                            {foundCoPis.map((user, i) => (
                                <div key={i} className="flex items-center space-x-2 border rounded-md p-3">
                                    <RadioGroupItem value={JSON.stringify(user)} id={`user-${i}`} />
                                    <Label htmlFor={`user-${i}`} className="flex flex-col">
                                        <span className="font-semibold">{user.name}</span>
                                        <span className="text-muted-foreground text-xs">{user.email} ({user.campus})</span>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </DialogContent>
                </Dialog>
            </DialogContent>
        </Dialog>
    );
}

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
  const [projectToEdit, setProjectToEdit] = useState<EmrInterest | null>(null);
  
  const fetchAllData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

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
            emrQuery = query(emrInterestsCol, where('isBulkUploaded', '==', true));
        } else if (isCro && user.faculties && user.faculties.length > 0) {
            imrQuery = query(projectsCol, where('faculty', 'in', user.faculties), orderBy('submissionDate', 'desc'));
            emrQuery = query(emrInterestsCol, where('faculty', 'in', user.faculties), where('isBulkUploaded', '==', true));
        } else if (isPrincipal && user.institute) {
            imrQuery = query(projectsCol, where('institute', '==', user.institute), orderBy('submissionDate', 'desc'));
            emrQuery = query(emrInterestsCol, where('faculty', '==', user.faculty), where('isBulkUploaded', '==', true)); // Assuming institute is tied to faculty
        } else if (isHod && user.department && user.institute) {
             imrQuery = query(
                projectsCol, 
                where('departmentName', '==', user.department), 
                where('institute', '==', user.institute),
                orderBy('submissionDate', 'desc')
            );
            emrQuery = query(emrInterestsCol, where('department', '==', user.department), where('isBulkUploaded', '==', true));
        } else {
            imrQuery = query(projectsCol, where('pi_uid', '==', user.uid), orderBy('submissionDate', 'desc'));
            emrQuery = query(emrInterestsCol, where('userId', '==', user.uid), where('isBulkUploaded', '==', true));
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
  }, [user, toast]);

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
    fetchAllData();
  }, [fetchAllData]);
  
  const hasAdminView = user?.role === 'Super-admin' || user?.role === 'admin' || user?.role === 'CRO' || user?.designation === 'Principal' || user?.designation === 'HOD';
  const canEditCoPis = user?.role === 'Super-admin';

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
    <>
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
                                    <TableHeader><TableRow><TableHead>Project Title</TableHead><TableHead>PI</TableHead><TableHead>Co-PIs</TableHead><TableHead>Agency</TableHead><TableHead>Amount</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                                    <TableBody>{filteredEmrProjects.map(p => {
                                        const pi = users.find(u => u.uid === p.userId);
                                        const proofLink = p.finalProofUrl || p.proofUrl;
                                        return (
                                        <TableRow key={p.id}>
                                            <TableCell className="font-medium">
                                                {proofLink ? (
                                                    <a href={proofLink} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">
                                                        {p.callTitle || 'N/A'}
                                                    </a>
                                                ) : (
                                                    p.callTitle || 'N/A'
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {pi?.misId ? (
                                                    <Link href={`/profile/${pi.misId}`} className="hover:underline text-primary" target="_blank" rel="noopener noreferrer">
                                                        {p.userName}
                                                    </Link>
                                                ) : p.userName}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col text-xs">
                                                    {(p.coPiDetails || []).map(copi => {
                                                        const coPiUser = users.find(u => u.uid === copi.uid);
                                                        return (
                                                            <div key={copi.email}>
                                                                {coPiUser?.misId ? (
                                                                    <Link href={`/profile/${coPiUser.misId}`} className="hover:underline text-primary" target="_blank" rel="noopener noreferrer">
                                                                        {copi.name}
                                                                    </Link>
                                                                ) : copi.name}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </TableCell>
                                            <TableCell>{p.agency || 'N/A'}</TableCell>
                                            <TableCell>{p.durationAmount || 'N/A'}</TableCell>
                                            <TableCell className="flex items-center gap-2">
                                                {canEditCoPis && p.isBulkUploaded && (
                                                    <Button variant="outline" size="sm" onClick={() => setProjectToEdit(p)}>
                                                        <Edit className="h-4 w-4 mr-2" /> Edit
                                                    </Button>
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
    {projectToEdit && (
        <EditEmrProjectDialog
            interest={projectToEdit}
            isOpen={!!projectToEdit}
            onOpenChange={() => setProjectToEdit(null)}
            onActionComplete={fetchAllData}
        />
    )}
    </>
  );
}
