

'use client';

import { useState, useEffect } from 'react';
import type { User, Project, EmrInterest, FundingCall, ResearchPaper, Author, CoPiDetails } from '@/types';
import { getResearchDomain, addResearchPaper, checkUserOrStaff, updateResearchPaper, deleteResearchPaper, findUserByMisId, updateEmrInterestDetails, uploadFileToServer } from '@/app/actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, Loader2, Mail, Briefcase, Building2, BookCopy, Phone, Plus, UserPlus, X, Edit, Trash2, Search, FileUp, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

function ProfileDetail({ label, value, icon: Icon }: { label: string; value?: string; icon: React.ElementType }) {
    if (!value) return null;
    return (
        <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
                <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-sm text-muted-foreground break-all">{value}</p>
            </div>
        </div>
    );
}

const AUTHOR_ROLES: Author['role'][] = ['First Author', 'Corresponding Author', 'Co-Author'];

function AddEditPaperDialog({ 
    isOpen, 
    onOpenChange, 
    onSuccess, 
    user, 
    existingPaper 
}: { 
    isOpen: boolean; 
    onOpenChange: (open: boolean) => void;
    onSuccess: (paper: ResearchPaper, isNew: boolean) => void;
    user: User;
    existingPaper?: ResearchPaper | null;
}) {
    const { toast } = useToast();
    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');
    const [authors, setAuthors] = useState<Author[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // State for adding co-authors
    const [coPiSearchTerm, setCoPiSearchTerm] = useState('');
    const [foundCoPi, setFoundCoPi] = useState<{ uid: string; name: string; email: string; isRegistered: boolean } | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [externalAuthorName, setExternalAuthorName] = useState('');
    const [externalAuthorEmail, setExternalAuthorEmail] = useState('');
    
    useEffect(() => {
        if (isOpen) {
            if (existingPaper) {
                setTitle(existingPaper.title);
                setUrl(existingPaper.url);
                setAuthors(existingPaper.authors);
            } else {
                setTitle('');
                setUrl('');
                setAuthors([{ email: user.email, name: user.name, role: 'First Author', isExternal: false, uid: user.uid }]);
            }
        }
    }, [isOpen, existingPaper, user]);

    const handleSearchCoPi = async () => {
        if (!coPiSearchTerm) return;
        setIsSearching(true);
        setFoundCoPi(null);
        try {
            const result = await findUserByMisId(coPiSearchTerm);
            if (result.success) {
                if (result.user) {
                    setFoundCoPi({ ...result.user, isRegistered: true });
                } else if (result.staff) {
                    setFoundCoPi({ ...result.staff, uid: '', isRegistered: false });
                }
            } else {
                toast({ variant: 'destructive', title: 'User Not Found', description: result.error });
            }
        } catch (error) {
            toast({ variant: 'destructive', title: 'Search Failed', description: 'An error occurred while searching.' });
        } finally {
            setIsSearching(false);
        }
    };
    
    const addInternalAuthor = () => {
        if (foundCoPi && !authors.some(a => a.email === foundCoPi.email)) {
            if (user && foundCoPi.email === user.email) {
                toast({ variant: 'destructive', title: 'Cannot Add Self', description: 'You cannot add yourself as a Co-PI.' });
                return;
            }
            setAuthors([...authors, { 
                uid: foundCoPi.isRegistered ? foundCoPi.uid : undefined, 
                name: foundCoPi.name, 
                email: foundCoPi.email, 
                role: 'Co-Author', 
                isExternal: false 
            }]);
            setFoundCoPi(null);
            setCoPiSearchTerm('');
        }
    };

    const addExternalAuthor = () => {
        const name = externalAuthorName.trim();
        const email = externalAuthorEmail.trim().toLowerCase();
        if (!name || !email) {
            toast({ title: 'Name and email are required for external authors', variant: 'destructive' });
            return;
        }
         if (authors.some(a => a.email === email)) {
            toast({ title: 'Author already added', variant: 'destructive' });
            return;
        }
        setAuthors([...authors, { name, email, role: 'Co-Author', isExternal: true }]);
        setExternalAuthorName('');
        setExternalAuthorEmail('');
    };


    const removeAuthor = (email: string) => {
        if (email === user.email) {
            toast({ title: 'Cannot remove the main author', variant: 'destructive' });
            return;
        }
        setAuthors(authors.filter(ca => ca.email !== email));
    };

    const updateAuthorRole = (email: string, role: Author['role']) => {
        setAuthors(authors.map(ca => ca.email === email ? { ...ca, role } : ca));
    };

    const handleSubmit = async () => {
        if (!title.trim() || !url.trim()) {
            toast({ title: "Paper title and URL are required", variant: "destructive" });
            return;
        }
        if (!url.trim().startsWith('https://')) {
            toast({ title: "Invalid URL", description: "URL must start with 'https://'", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        try {
            let result;
            if (existingPaper) {
                result = await updateResearchPaper(existingPaper.id, user.uid, { title: title.trim(), url: url.trim(), authors });
            } else {
                result = await addResearchPaper(title.trim(), url.trim(), user.uid, authors);
            }

            if (result.success && result.paper) {
                toast({ title: `Research paper ${existingPaper ? 'updated' : 'added'} successfully` });
                onSuccess(result.paper, !existingPaper);
                onOpenChange(false);
            } else {
                toast({ title: `Failed to ${existingPaper ? 'update' : 'add'} research paper`, description: result.error, variant: "destructive" });
            }
        } catch (error) {
            toast({ title: `Error ${existingPaper ? 'updating' : 'adding'} research paper`, variant: "destructive" });
            console.error(`Error ${existingPaper ? 'updating' : 'adding'} research paper:`, error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{existingPaper ? 'Edit' : 'Add'} Research Paper</DialogTitle>
                    <DialogDescription>Add the title, URL, and authors of your published paper.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-4">
                    <div><Label htmlFor="paperTitle" className="block text-sm font-medium">Paper Title</Label><Input id="paperTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter paper title" className="mt-1"/></div>
                    <div><Label htmlFor="paperUrl" className="block text-sm font-medium">Published Paper URL</Label><Input id="paperUrl" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://doi.org/..." className="mt-1"/></div>
                    
                    <div><Label className="block text-sm font-medium mb-1">Authors</Label>
                        <div className="space-y-2">
                            {authors.map((author) => (
                                <div key={author.email} className="flex items-center gap-2 p-2 border rounded-md">
                                    <div className="flex-grow">
                                        <p className="font-medium text-sm">{author.name} {author.isExternal && <span className="text-xs text-muted-foreground">(External)</span>}</p>
                                        <p className="text-xs text-muted-foreground">{author.email}</p>
                                    </div>
                                    <Select value={author.role} onValueChange={(value) => updateAuthorRole(author.email, value as Author['role'])}>
                                        <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue/></SelectTrigger>
                                        <SelectContent>{AUTHOR_ROLES.map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent>
                                    </Select>
                                    {author.email !== user.email && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeAuthor(author.email)}><X className="h-4 w-4"/></Button>}
                                </div>
                            ))}
                        </div>
                    </div>
                    <Separator />
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="internal-author" className="text-sm font-medium">Add Internal Co-Author</Label>
                            <div className="flex gap-2 mt-1">
                                <Input id="internal-author" value={coPiSearchTerm} onChange={(e) => setCoPiSearchTerm(e.target.value)} placeholder="Search by MIS ID"/>
                                <Button onClick={handleSearchCoPi} variant="outline" size="icon" disabled={!coPiSearchTerm.trim() || isSearching}>{isSearching ? <Loader2 className="h-4 w-4 animate-spin"/> : <Search className="h-4 w-4"/>}</Button>
                            </div>
                            {foundCoPi && (
                                <div className="flex items-center justify-between p-2 border rounded-md mt-2">
                                    <div>
                                        <p className="text-sm">{foundCoPi.name}</p>
                                        {!foundCoPi.isRegistered && <p className="text-xs text-muted-foreground">Not registered, but found in staff data.</p>}
                                    </div>
                                    <Button size="sm" onClick={addInternalAuthor}>Add</Button>
                                </div>
                            )}
                        </div>
                        <div>
                            <Label className="text-sm font-medium">Add External Co-Author</Label>
                             <div className="flex gap-2 mt-1">
                                <Input value={externalAuthorName} onChange={(e) => setExternalAuthorName(e.target.value)} placeholder="External author's name"/>
                                <Input value={externalAuthorEmail} onChange={(e) => setExternalAuthorEmail(e.target.value)} placeholder="External author's email"/>
                                <Button onClick={addExternalAuthor} variant="outline" size="icon" disabled={!externalAuthorName.trim() || !externalAuthorEmail.trim()}><UserPlus className="h-4 w-4"/></Button>
                            </div>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={() => onOpenChange(false)} variant="outline">Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (existingPaper ? 'Save Changes' : 'Add Paper')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
};

function EditEmrInterestDialog({
    isOpen,
    onOpenChange,
    onSuccess,
    user,
    interest
}: {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    user: User;
    interest: EmrInterest;
}) {
    const { toast } = useToast();
    const [callTitle, setCallTitle] = useState(interest.callTitle || '');
    const [coPiList, setCoPiList] = useState<CoPiDetails[]>(interest.coPiDetails || []);
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [coPiSearchTerm, setCoPiSearchTerm] = useState('');
    const [foundCoPi, setFoundCoPi] = useState<{ uid?: string; name: string; email: string; } | null>(null);
    const [isSearching, setIsSearching] = useState(false);

    const handleSearchCoPi = async () => {
        if (!coPiSearchTerm) return;
        setIsSearching(true);
        setFoundCoPi(null);
        try {
            const result = await findUserByMisId(coPiSearchTerm);
            if (result.success) {
                if (result.user) setFoundCoPi(result.user);
                else if (result.staff) setFoundCoPi(result.staff);
            } else {
                toast({ variant: 'destructive', title: 'User Not Found', description: result.error });
            }
        } catch (error) { toast({ variant: 'destructive', title: 'Search Failed' }); } finally { setIsSearching(false); }
    };
    
    const handleAddCoPi = () => {
        if (foundCoPi && !coPiList.some(coPi => coPi.email === foundCoPi.email)) {
            if (user && foundCoPi.email === user.email) {
                toast({ variant: 'destructive', title: 'Cannot Add Self' });
                return;
            }
            setCoPiList([...coPiList, foundCoPi]);
        }
        setFoundCoPi(null);
        setCoPiSearchTerm('');
    };

    const handleRemoveCoPi = (emailToRemove: string) => {
        setCoPiList(coPiList.filter(coPi => coPi.email !== emailToRemove));
    };

    const handleSubmit = async () => {
        if (!callTitle.trim()) {
            toast({ title: "Project title is required", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        try {
            let proofUrl: string | undefined = interest.proofUrl;
            if (proofFile) {
                if (proofFile.size > 5 * 1024 * 1024) { // 5MB limit
                    toast({ title: "File is too large", description: "Proof must be under 5MB.", variant: "destructive" });
                    setIsSubmitting(false);
                    return;
                }
                const dataUrl = await fileToDataUrl(proofFile);
                const path = `emr-proofs/${interest.userId}/${interest.id}/${proofFile.name}`;
                const result = await uploadFileToServer(dataUrl, path);
                if (result.success && result.url) {
                    proofUrl = result.url;
                } else {
                    throw new Error(result.error || "Proof upload failed.");
                }
            }

            const result = await updateEmrInterestDetails(interest.id, user.uid, {
                callTitle,
                coPiDetails: coPiList,
                proofUrl
            });

            if (result.success) {
                toast({ title: "EMR Project Updated" });
                onSuccess();
                onOpenChange(false);
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            toast({ title: "Error updating EMR project", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Edit EMR Project Details</DialogTitle>
                    <DialogDescription>Update the details for this sanctioned EMR project.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-4">
                    <div><Label>Project Title</Label><Input value={callTitle} onChange={(e) => setCallTitle(e.target.value)} /></div>
                    <div className="space-y-2">
                        <Label>Co-PIs</Label>
                        <div className="flex gap-2"><Input value={coPiSearchTerm} onChange={(e) => setCoPiSearchTerm(e.target.value)} placeholder="Search by MIS ID"/><Button onClick={handleSearchCoPi} variant="outline" size="icon" disabled={!coPiSearchTerm.trim() || isSearching}>{isSearching ? <Loader2 className="h-4 w-4 animate-spin"/> : <Search className="h-4 w-4"/>}</Button></div>
                        {foundCoPi && <div className="flex items-center justify-between p-2 border rounded-md"><p>{foundCoPi.name}</p><Button size="sm" onClick={handleAddCoPi}>Add</Button></div>}
                        <div className="space-y-2 pt-2">{coPiList.map(coPi => (<div key={coPi.email} className="flex items-center justify-between p-2 bg-secondary rounded-md"><p className="text-sm font-medium">{coPi.name}</p><Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveCoPi(coPi.email)}>Remove</Button></div>))}</div>
                    </div>
                     <div>
                        <Label>Proof Document (PDF, JPG, PNG)</Label>
                        <Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setProofFile(e.target.files?.[0] || null)} />
                        {interest.proofUrl && <a href={interest.proofUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline mt-1 block">View current proof</a>}
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={() => onOpenChange(false)} variant="outline">Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting}>{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Changes'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function ProfileClient({ user, projects, emrInterests, fundingCalls }: { user: User; projects: Project[], emrInterests: EmrInterest[], fundingCalls: FundingCall[] }) {
    const [domain, setDomain] = useState<string | null>(user.researchDomain || null);
    const [loadingDomain, setLoadingDomain] = useState(false);
    const [researchPapers, setResearchPapers] = useState<ResearchPaper[]>([]);
    const [isAddEditDialogOpen, setIsAddEditDialogOpen] = useState(false);
    const [paperToEdit, setPaperToEdit] = useState<ResearchPaper | null>(null);
    const [paperToDelete, setPaperToDelete] = useState<ResearchPaper | null>(null);
    const [interestToEdit, setInterestToEdit] = useState<EmrInterest | null>(null);
    const { toast } = useToast();
    const [sessionUser, setSessionUser] = useState<User | null>(null);

    const fetchPapers = async () => {
        try {
            const res = await fetch(`/api/get-research-papers?userUid=${user.uid}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) { setResearchPapers(data.papers || []); }
                 else { setResearchPapers([]); }
            } else { setResearchPapers([]); }
        } catch (paperError) { setResearchPapers([]); }
    };

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) { setSessionUser(JSON.parse(storedUser)); }
        fetchPapers();
    }, [user.uid]);

    useEffect(() => {
        const fetchDomain = async () => {
            const titles = [...projects.map(p => p.title), ...researchPapers.map(p => p.title)];
            if (titles.length > 0 && !user.researchDomain) {
                setLoadingDomain(true);
                try {
                    const result = await getResearchDomain({ paperTitles: titles });
                    if (result.success) { setDomain(result.domain); }
                } catch (error) { console.error("Error fetching research domain:", error); } 
                finally { setLoadingDomain(false); }
            }
        };
        fetchDomain();
    }, [projects, researchPapers, user.researchDomain]);
    
    const handlePaperSuccess = (paper: ResearchPaper, isNew: boolean) => {
        if (isNew) { setResearchPapers(prev => [paper, ...prev]); } 
        else { setResearchPapers(prev => prev.map(p => p.id === paper.id ? paper : p)); }
        if (paper.domain) setDomain(paper.domain);
    };

    const handleDeletePaper = async () => {
        if (!paperToDelete || !sessionUser) return;
        const result = await deleteResearchPaper(paperToDelete.id, sessionUser.uid);
        if (result.success) {
            toast({ title: "Paper Deleted" });
            setResearchPapers(prev => prev.filter(p => p.id !== paperToDelete.id));
            setPaperToDelete(null);
        } else {
            toast({ title: "Error", description: result.error, variant: "destructive" });
        }
    };
    
    const isOwner = sessionUser?.uid === user.uid;

    const parseAdminRemarks = (remarks?: string) => {
        if (!remarks) return { amount: 'N/A', duration: 'N/A' };
        const amountMatch = remarks.match(/Amount: ([\d,]+)/);
        const durationMatch = remarks.match(/Duration: (.+)/);
        return {
            amount: amountMatch ? `₹${amountMatch[1]}` : 'N/A',
            duration: durationMatch ? durationMatch[1] : 'N/A',
        };
    };

    const StatItem = ({ value, label }: { value: number | string; label: string }) => (
        <div className="flex flex-col items-center">
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
        </div>
    );
    
    return (
        <div className="flex flex-col items-center">
            <Card className="w-full max-w-4xl shadow-xl border-0 bg-card/80 backdrop-blur-lg">
                <CardContent className="p-6 md:p-8">
                    <div className="flex flex-col md:flex-row items-center gap-6">
                        <div className="flex-shrink-0">
                            <Avatar className="h-28 w-28 md:h-32 md:w-32 border-4 border-background shadow-lg">
                                <AvatarImage src={user.photoURL || undefined} alt={user.name} className="object-cover" />
                                <AvatarFallback className="text-4xl">{user.name?.[0].toUpperCase()}</AvatarFallback>
                            </Avatar>
                        </div>
                        <div className="flex flex-col items-center md:items-start text-center md:text-left w-full">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full">
                                <h1 className="text-3xl font-bold">{user.name}</h1>
                                <Button asChild variant="outline" className="mt-4 sm:mt-0">
                                    <a href={`mailto:${user.email}`}>
                                        <Mail className="mr-2 h-4 w-4" /> Email
                                    </a>
                                </Button>
                            </div>
                            <p className="text-muted-foreground mt-1">{user.designation}</p>
                            <p className="text-muted-foreground">{user.department}, {user.institute}</p>
                            <div className="flex justify-center md:justify-start gap-8 my-4">
                                <StatItem value={projects.length} label="IMR Projects" />
                                <StatItem value={emrInterests.length} label="EMR Interests" />
                                <StatItem value={researchPapers.length} label="Research Papers" />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 pt-6 mt-6 border-t">
                        <div className="space-y-4">
                            <h3 className="font-semibold text-lg">Academic & Contact Details</h3>
                            <div className="space-y-4">
                                <ProfileDetail label="Faculty" value={user.faculty} icon={Building2} />
                                <ProfileDetail label="Institute" value={user.institute} icon={Building2} />
                                <ProfileDetail label="Department" value={user.department} icon={Briefcase} />
                                <ProfileDetail label="Email" value={user.email} icon={Mail} />
                                <ProfileDetail label="Phone" value={user.phoneNumber} icon={Phone} />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h3 className="font-semibold text-lg">Researcher IDs</h3>
                            <div className="space-y-4">
                                <ProfileDetail label="ORCID iD" value={user.orcidId} icon={BookCopy} />
                                <ProfileDetail label="Scopus ID" value={user.scopusId} icon={BookCopy} />
                                <ProfileDetail label="Vidwan ID" value={user.vidwanId} icon={BookCopy} />
                                <ProfileDetail label="Google Scholar ID" value={user.googleScholarId} icon={BookCopy} />
                            </div>
                        </div>
                        <div className="space-y-4 md:col-span-2">
                            <h3 className="font-semibold text-lg flex items-center gap-2"><Bot className="h-5 w-5" /> AI-Suggested Research Domain</h3>
                            {loadingDomain ? (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Analyzing publications...</span>
                                </div>
                            ) : domain ? (
                                <Badge variant="secondary" className="text-base">{domain}</Badge>
                            ) : (
                                <p className="text-sm text-muted-foreground">Not enough data to determine a domain.</p>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="w-full max-w-4xl mt-8">
                <Tabs defaultValue="projects" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="projects">IMR Projects ({projects.length})</TabsTrigger>
                        <TabsTrigger value="emr">EMR Interests ({emrInterests.length})</TabsTrigger>
                        <TabsTrigger value="papers">Paper Publications ({researchPapers.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="projects">
                        <div className="space-y-4 mt-4">
                            {projects.length > 0 ? projects.map(project => (
                                <Card key={project.id}>
                                    <CardContent className="p-4">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="font-semibold">{project.title}</p>
                                            {project.pi_uid === user.uid ? (
                                                <Badge variant="secondary">PI</Badge>
                                            ) : (
                                                <Badge variant="outline">Co-PI</Badge>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground">Submitted: {new Date(project.submissionDate).toLocaleDateString()}</p>
                                        <Badge variant="outline" className="mt-2">{project.status}</Badge>
                                    </CardContent>
                                </Card>
                            )) : (
                                <Card><CardContent className="p-6 text-center text-muted-foreground">No intramural research projects found.</CardContent></Card>
                            )}
                        </div>
                    </TabsContent>
                    <TabsContent value="emr">
                        <div className="space-y-4 mt-4">
                           {emrInterests.length > 0 ? emrInterests.map(interest => {
                                const { amount, duration } = parseAdminRemarks(interest.adminRemarks);
                                return (
                                <Card key={interest.id}>
                                    <CardContent className="p-4 space-y-2">
                                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                                            <div className="flex-1">
                                                <p className="font-semibold">{interest.callTitle}</p>
                                                <p className="text-sm text-muted-foreground">{interest.userId === user.uid ? 'Role: PI' : 'Role: Co-PI'}</p>
                                            </div>
                                            {isOwner && interest.isBulkUploaded && <Button variant="outline" size="sm" onClick={() => setInterestToEdit(interest)}><Edit className="mr-2 h-4 w-4"/>Edit</Button>}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-4 text-sm pt-2 border-t">
                                            <span><strong className="text-muted-foreground">Agency:</strong> {interest.callTitle?.split(' - ')[1] || 'N/A'}</span>
                                            <span><strong className="text-muted-foreground">Amount:</strong> {amount}</span>
                                            <span><strong className="text-muted-foreground">Duration:</strong> {duration}</span>
                                        </div>
                                        {!interest.proofUrl && <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3"/> Proof Required</Badge>}
                                    </CardContent>
                                </Card>
                                )
                            }) : (
                                <Card><CardContent className="p-6 text-center text-muted-foreground">No registered EMR interests found.</CardContent></Card>
                            )}
                        </div>
                    </TabsContent>
                    <TabsContent value="papers">
                        <div className="space-y-4 mt-4">
                            {isOwner && (
                                <Button onClick={() => { setPaperToEdit(null); setIsAddEditDialogOpen(true); }} className="mb-4" variant="outline" size="sm">
                                    <Plus className="mr-2 h-4 w-4" /> Add Research Paper
                                </Button>
                            )}
                            {researchPapers.length > 0 ? researchPapers.map(paper => {
                                const myRole = paper.authors.find((a: Author) => a.uid === user.uid)?.role;
                                return (
                                <Card key={paper.id}>
                                    <CardContent className="p-4 space-y-2">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <a href={paper.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">{paper.title}</a>
                                                {myRole && <Badge variant="secondary" className="ml-2">{myRole}</Badge>}
                                            </div>
                                            {isOwner && paper.mainAuthorUid === user.uid && (
                                                <TooltipProvider>
                                                <div className="flex gap-2">
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setPaperToEdit(paper); setIsAddEditDialogOpen(true); }}><Edit className="h-4 w-4"/></Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent><p>Edit Paper</p></TooltipContent>
                                                    </Tooltip>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setPaperToDelete(paper)}><Trash2 className="h-4 w-4"/></Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent><p>Delete Paper</p></TooltipContent>
                                                    </Tooltip>
                                                </div>
                                                </TooltipProvider>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-2 items-center">
                                            {paper.authors.map((author: Author) => (
                                                <Badge key={author.email} variant={author.role === 'First Author' ? 'default' : 'secondary'}>
                                                    {author.name} {author.isExternal && '(Ext)'}
                                                </Badge>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}) : (
                                <Card><CardContent className="p-6 text-center text-muted-foreground">No research papers found.</CardContent></Card>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {isOwner && (
                <AddEditPaperDialog 
                    isOpen={isAddEditDialogOpen}
                    onOpenChange={setIsAddEditDialogOpen}
                    onSuccess={handlePaperSuccess}
                    user={user}
                    existingPaper={paperToEdit}
                />
            )}
             {isOwner && interestToEdit && (
                <EditEmrInterestDialog
                    isOpen={!!interestToEdit}
                    onOpenChange={() => setInterestToEdit(null)}
                    onSuccess={() => {
                        // A full reload might be easier than trying to patch state here
                        window.location.reload();
                    }}
                    user={user}
                    interest={interestToEdit}
                />
            )}
            
            <AlertDialog open={!!paperToDelete} onOpenChange={() => setPaperToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently delete the research paper "{paperToDelete?.title}". This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeletePaper} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
