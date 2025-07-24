
'use client';

import { useState, useEffect } from 'react';
import type { User, Project, EmrInterest, FundingCall } from '@/types';
import { getResearchDomain, addResearchPaper, fetchResearchPapersByUserUid } from '@/app/actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, Loader2, Mail, Briefcase, Building2, BookCopy, Phone, Plus, UserPlus, X } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { useToast } from '@/hooks/use-toast';

function ProfileDetail({ label, value, icon: Icon }: { label: string; value?: string; icon: React.ElementType }) {
    if (!value) return null;
    return (
        <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
                <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-sm text-muted-foreground">{value}</p>
            </div>
        </div>
    );
}

export function ProfileClient({ user, projects, emrInterests, fundingCalls }: { user: User; projects: Project[], emrInterests: EmrInterest[], fundingCalls: FundingCall[] }) {
    const [domain, setDomain] = useState<string | null>(null);
    const [loadingDomain, setLoadingDomain] = useState(false);
    const [researchPapers, setResearchPapers] = useState<any[]>([]);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [newPaperTitle, setNewPaperTitle] = useState('');
    const [newCoAuthorEmail, setNewCoAuthorEmail] = useState('');
    const [coAuthorEmails, setCoAuthorEmails] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        const fetchPapers = async () => {
            try {
                const result = await fetchResearchPapersByUserUid(user.uid);
                if (result.success) {
                    setResearchPapers(result.papers || []);
                }
            } catch (error) {
                console.error("Error fetching research papers:", error);
            }
        };
        fetchPapers();
    }, [user.uid]);

    useEffect(() => {
        const fetchDomain = async () => {
            const titles = [...projects.map(p => p.title), ...researchPapers.map(p => p.title)];
            if (titles.length > 0) {
                setLoadingDomain(true);
                try {
                    const result = await getResearchDomain({ paperTitles: titles });
                    if (result.success) {
                        setDomain(result.domain);
                    }
                } catch (error) {
                    console.error("Error fetching research domain:", error);
                } finally {
                    setLoadingDomain(false);
                }
            }
        };
        fetchDomain();
    }, [projects, researchPapers]);

    const getCallTitle = (callId: string) => {
        return fundingCalls.find(c => c.id === callId)?.title || callId;
    };

    const StatItem = ({ value, label }: { value: number | string; label: string }) => (
        <div className="flex flex-col items-center">
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
        </div>
    );

    const addCoAuthorEmail = () => {
        const email = newCoAuthorEmail.trim().toLowerCase();
        if (email && !coAuthorEmails.includes(email)) {
            setCoAuthorEmails([...coAuthorEmails, email]);
            setNewCoAuthorEmail('');
        }
    };

    const removeCoAuthorEmail = (email: string) => {
        setCoAuthorEmails(coAuthorEmails.filter(e => e !== email));
    };

    const handleAddPaper = async () => {
        if (!newPaperTitle.trim()) {
            toast({ title: "Paper title is required", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        try {
            const result = await addResearchPaper(newPaperTitle.trim(), user.uid, coAuthorEmails);
            if (result.success) {
                toast({ title: "Research paper added successfully" });
                // Optimistically update the UI
                const newPaper = { id: result.paperId, title: newPaperTitle.trim(), coAuthorEmails };
                setResearchPapers(prevPapers => [...prevPapers, newPaper]);
                setNewPaperTitle('');
                setCoAuthorEmails([]);
                setIsAddDialogOpen(false);
            } else {
                toast({ title: "Failed to add research paper", description: result.error, variant: "destructive" });
            }
        } catch (error) {
            toast({ title: "Error adding research paper", variant: "destructive" });
            console.error("Error adding research paper:", error);
        } finally {
            setIsSubmitting(false);
        }
    };


    return (
        <div className="flex flex-col items-center">
            <Card className="w-full max-w-4xl shadow-xl border-0 bg-card/80 backdrop-blur-lg">
                <CardContent className="p-6 md:p-8">
                    <div className="flex flex-col md:flex-row items-center gap-6">
                        {/* Avatar */}
                        <div className="flex-shrink-0">
                            <Avatar className="h-28 w-28 md:h-32 md:w-32 border-4 border-background shadow-lg">
                                <AvatarImage src={user.photoURL || undefined} alt={user.name} />
                                <AvatarFallback className="text-4xl">{user.name?.[0].toUpperCase()}</AvatarFallback>
                            </Avatar>
                        </div>

                        {/* Details Section */}
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
                        <TabsTrigger value="papers">Research Papers ({researchPapers.length})</TabsTrigger>
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
                            {emrInterests.length > 0 ? emrInterests.map(interest => (
                                <Card key={interest.id}>
                                    <CardContent className="p-4">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="font-semibold">{getCallTitle(interest.callId)}</p>
                                            {interest.userId === user.uid ? (
                                                <Badge variant="secondary">PI</Badge>
                                            ) : (
                                                <Badge variant="outline">Co-PI</Badge>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground">Registered on: {format(new Date(interest.registeredAt), 'PPP')}</p>
                                        <Badge variant={interest.status === 'Recommended' ? 'default' : 'secondary'} className="mt-2">{interest.status}</Badge>
                                    </CardContent>
                                </Card>
                            )) : (
                                <Card><CardContent className="p-6 text-center text-muted-foreground">No registered EMR interests found.</CardContent></Card>
                            )}
                        </div>
                    </TabsContent>
                    <TabsContent value="papers">
                        <div className="space-y-4 mt-4">
                            <Button onClick={() => setIsAddDialogOpen(true)} className="mb-4" variant="outline" size="sm">
                                <Plus className="mr-2 h-4 w-4" />
                                Add Research Paper
                            </Button>
                            {researchPapers.length > 0 ? researchPapers.map(paper => (
                                <Card key={paper.id}>
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between mb-1">
                                            <p className="font-semibold">{paper.title}</p>
                                        </div>
                                        <p className="text-sm text-muted-foreground">Co-Authors: {paper.coAuthorEmails?.join(', ') || 'None'}</p>
                                    </CardContent>
                                </Card>
                            )) : (
                                <Card><CardContent className="p-6 text-center text-muted-foreground">No research papers found.</CardContent></Card>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Research Paper</DialogTitle>
                        <DialogDescription>
                            Add the title of your research paper and co-authors by their email addresses.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="paperTitle" className="block text-sm font-medium">Paper Title</label>
                            <Input
                                id="paperTitle"
                                value={newPaperTitle}
                                onChange={(e) => setNewPaperTitle(e.target.value)}
                                placeholder="Enter paper title"
                                className="mt-1 block w-full"
                            />
                        </div>
                        <div>
                            <label htmlFor="coAuthorEmail" className="block text-sm font-medium">Add Co-Author Email</label>
                            <div className="flex gap-2 mt-1">
                                <Input
                                    id="coAuthorEmail"
                                    value={newCoAuthorEmail}
                                    onChange={(e) => setNewCoAuthorEmail(e.target.value)}
                                    placeholder="Enter co-author email"
                                    className="flex-grow"
                                />
                                <Button onClick={addCoAuthorEmail} variant="outline" size="icon" disabled={!newCoAuthorEmail.trim()}>
                                    <UserPlus className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {coAuthorEmails.map(email => (
                                    <Badge key={email} variant="secondary" className="flex items-center gap-1">
                                        {email}
                                        <X className="cursor-pointer h-3 w-3" onClick={() => removeCoAuthorEmail(email)} />
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleAddPaper} disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Add Paper'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
