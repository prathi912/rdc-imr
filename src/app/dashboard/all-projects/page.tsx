

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
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
import { Download, Calendar as CalendarIcon, Eye, Upload, Loader2, Edit, Search, ChevronDown } from 'lucide-react';
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
import { updateEmrFinalStatus, updateEmrInterestCoPis, updateEmrInterestDetails } from '@/app/emr-actions';
import { findUserByMisId } from '@/app/userfinding';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';


const STATUSES: Project['status'][] = ['Submitted', 'Under Review', 'Recommended', 'Not Recommended', 'In Progress', 'Completed', 'Pending Completion Approval', 'Sanctioned'];

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
  { id: 'faculty', label: 'Faculty' },
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
    sanctionDate: z.date().optional(),
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
            sanctionDate: interest.sanctionDate ? parseISO(interest.sanctionDate) : undefined,
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
            // First, update Co-PIs
            const coPiResult = await updateEmrInterestCoPis(interest.id, coPiList);
            if (!coPiResult.success) throw new Error(coPiResult.error);

            // Then, update status, proof, and sanction date
            const proofFile = values.finalProof?.[0];
            let proofDataUrl: string | undefined = interest.finalProofUrl;
            let fileName: string = 'existing_proof.pdf';

            if (proofFile) {
                proofDataUrl = await fileToDataUrl(proofFile);
                fileName = proofFile.name;
            }
            
            if (proofDataUrl) {
                const statusResult = await updateEmrFinalStatus(interest.id, values.status, proofDataUrl, fileName);
                if (!statusResult.success) throw new Error(statusResult.error);
            }
            
            // Finally, update other details like sanction date
            if (values.sanctionDate) {
                const detailsResult = await updateEmrInterestDetails(interest.id, { sanctionDate: values.sanctionDate.toISOString() });
                 if (!detailsResult.success) throw new Error(detailsResult.error);
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
                                name="sanctionDate"
                                control={form.control}
                                render={({ field }) => ( 
                                <FormItem className="flex flex-col">
                                    <FormLabel>Date of Sanction</FormLabel>
                                    <Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal w-full", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP") : (<span>Pick a date</span>)}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar captionLayout="dropdown-buttons" fromYear={2015} toYear={new Date().getFullYear() + 5} mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover>
                                    <FormMessage />
                                </FormItem> 
                            )} />
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [allImrProjects, setAllImrProjects] = useState<Project[]>([]);
  const [allEmrProjects, setAllEmrProjects] = useState<EmrInterest[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [facultyFilter, setFacultyFilter] = useState<string[]>(searchParams.get('faculty')?.split(',').filter(Boolean) || []);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'imr');

  const isMobile = useIsMobile();

  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportDateRange, setExportDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedExportColumns, setSelectedExportColumns] = useState<string[]>(IMR_EXPORT_COLUMNS.map(c => c.id));
  const [projectToEdit, setProjectToEdit] = useState<EmrInterest | null>(null);
  
  const updateUrlParams = useCallback((newValues: { q?: string; status?: string; faculty?: string, tab?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newValues).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

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
        const isIqac = user?.role === 'IQAC';
        const isCro = user?.role === 'CRO';
        const isPrincipal = user?.designation === 'Principal';
        const isHod = user?.designation === 'HOD';

        let imrQuery;
        let emrQuery;

        if (isSuperAdmin || isAdmin || isIqac) {
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
       if (parsedUser.role === 'CRO' || parsedUser.role === 'Super-admin' || parsedUser.role === 'admin') {
         setFacultyFilter(searchParams.get('faculty')?.split(',').filter(Boolean) || []);
       }
    } else {
      setLoading(false);
    }
  }, [searchParams]);
  
  useEffect(() => {
      setSelectedExportColumns(activeTab === 'imr' ? IMR_EXPORT_COLUMNS.map(c => c.id) : EMR_EXPORT_COLUMNS.map(c => c.id));
      updateUrlParams({ tab: activeTab });
  }, [activeTab, updateUrlParams]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);
  
  const hasAdminView = ['Super-admin', 'admin', 'CRO', 'IQAC'].includes(user?.role || '') || user?.designation === 'Principal' || user?.designation === 'HOD';
  const canEditCoPis = user?.role === 'Super-admin';

  const allFaculties = useMemo(() => {
    const facultySet = new Set<string>();
    allImrProjects.forEach(p => p.faculty && facultySet.add(p.faculty));
    allEmrProjects.forEach(p => p.faculty && facultySet.add(p.faculty));
    return Array.from(facultySet).sort();
  }, [allImrProjects, allEmrProjects]);

  const filteredImrProjects = useMemo(() => {
    return allImrProjects.filter(project => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'Recommended') {
          if (!['Recommended', 'Sanctioned', 'SANCTIONED'].includes(project.status)) return false;
        } else if (project.status !== statusFilter) {
          return false;
        }
      }
      if (facultyFilter.length > 0 && !facultyFilter.includes(project.faculty)) return false;
      if (!searchTerm) return true;
      
      const lowerCaseSearch = searchTerm.toLowerCase();
      const sanctionNumber = project.grant?.sanctionNumber || '';
      const installmentRefNumbers = project.grant?.phases?.map(p => p.installmentRefNumber || '').join(' ') || '';

      return (
        project.title.toLowerCase().includes(lowerCaseSearch) ||
        project.pi.toLowerCase().includes(lowerCaseSearch) ||
        (project.pi_email && project.pi_email.toLowerCase().includes(lowerCaseSearch)) ||
        (sanctionNumber && sanctionNumber.toLowerCase().includes(lowerCaseSearch)) ||
        (installmentRefNumbers && installmentRefNumbers.toLowerCase().includes(lowerCaseSearch))
      );
    });
  }, [allImrProjects, searchTerm, statusFilter, facultyFilter]);
  
  const filteredEmrProjects = useMemo(() => {
      return allEmrProjects.filter(project => {
          if (facultyFilter.length > 0 && project.faculty && !facultyFilter.includes(project.faculty)) return false;
          if (!searchTerm) return true;
          const lowerCaseSearch = searchTerm.toLowerCase();
          const title = project.callTitle || '';
          return title.toLowerCase().includes(lowerCaseSearch) || project.userName.toLowerCase().includes(lowerCaseSearch) || (project.agency || '').toLowerCase().includes(lowerCaseSearch);
      })
  }, [allEmrProjects, searchTerm, facultyFilter]);

  let pageTitle = "All Projects";
  let pageDescription = "Browse and manage all projects in the system.";
  
  if (user?.designation === 'Principal' && user?.institute) pageTitle = `Projects from ${user.institute}`;
  if (user?.designation === 'HOD' && user?.department) pageTitle = `Projects from ${user.department}`;
  if (user?.role === 'CRO' && facultyFilter.length === 1) pageTitle = `Projects from ${facultyFilter[0]}`;
  if (user?.role === 'CRO' && facultyFilter.length > 1) pageTitle = `Projects from multiple faculties`;


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
        if (column) row[column.label] = { title: p.title, type: p.type, submissionDate: new Date(p.submissionDate).toLocaleDateString(), abstract: p.abstract, pi: p.pi, pi_email: p.pi_email, pi_phoneNumber: p.pi_phoneNumber, misId: userDetails?.misId, designation: userDetails?.designation, faculty: p.faculty, institute: p.institute, departmentName: p.departmentName, status: p.status, coPiNames: coPiNames || 'N/A' }[colId];
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
      let projectsToExport = [...filteredEmrProjects];
      if (projectsToExport.length === 0) {
          toast({ variant: 'destructive', title: "No Data", description: "No EMR projects to export." }); return;
      }
      const usersMap = new Map(users.map(u => [u.uid, u]));
      const dataToExport = projectsToExport.map(p => {
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
       toast({ title: "Export Started", description: `Downloading ${projectsToExport.length} EMR projects.` });
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
                                        <PopoverContent className="w-auto p-0" align="start"><Calendar captionLayout="dropdown-buttons" fromYear={2015} toYear={new Date().getFullYear()} initialFocus mode="range" defaultMonth={exportDateRange?.from} selected={exportDateRange} onSelect={setExportDateRange} /></PopoverContent>
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
        <Input placeholder="Filter by Title, PI, Email, or Sanction No..." value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); updateUrlParams({ q: event.target.value || undefined }); }} className="w-full sm:w-auto sm:flex-grow md:flex-grow-0 md:max-w-xs" />
        <div className="w-full sm:w-auto flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); updateUrlParams({ status: value === 'all' ? undefined : value }); }} disabled={activeTab === 'emr'}>
                <SelectTrigger className="w-full sm:w-[220px]"><SelectValue placeholder="Filter by status" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Statuses</SelectItem>{STATUSES.map(status => (<SelectItem key={status} value={status}>{status}</SelectItem>))}</SelectContent>
            </Select>
            {(user?.role === 'CRO' || user?.role === 'Super-admin' || user?.role === 'admin') && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full sm:w-[280px] justify-between">
                            {facultyFilter.length === 0 ? "Filter by faculty" : facultyFilter.length === 1 ? facultyFilter[0] : `${facultyFilter.length} faculties selected`}
                            <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
                        {(user?.role === 'CRO' ? user.faculties : allFaculties)?.map(faculty => (
                            <DropdownMenuCheckboxItem
                                key={faculty}
                                checked={facultyFilter.includes(faculty)}
                                onCheckedChange={checked => {
                                    const newFilter = checked ? [...facultyFilter, faculty] : facultyFilter.filter(f => f !== faculty);
                                    setFacultyFilter(newFilter);
                                    updateUrlParams({ faculty: newFilter.length > 0 ? newFilter.join(',') : undefined });
                                }}
                            >
                                {faculty}
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
      </div>
      <div className="text-sm text-muted-foreground mb-4">
        Showing {activeTab === 'imr' ? filteredImrProjects.length : filteredEmrProjects.length} projects.
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
                                    <TableHeader><TableRow><TableHead>Project Title</TableHead><TableHead>PI</TableHead><TableHead>Co-PIs</TableHead><TableHead>Agency</TableHead><TableHead>Sanction Date</TableHead><TableHead>Amount</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
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
                                            <TableCell>{p.sanctionDate ? format(parseISO(p.sanctionDate), 'PPP') : 'N/A'}</TableCell>
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

