
'use client';

import { useState, useEffect } from 'react';
import type { User, IncentiveClaim, Project } from '@/types';
import { getResearchDomain } from '@/app/actions';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, Loader2 } from 'lucide-react';

function ProfileDetail({ label, value }: { label: string; value?: string }) {
    if (!value) return null;
    return (
        <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-base">{value}</p>
        </div>
    );
}

export function ProfileClient({ user, claims, projects }: { user: User; claims: IncentiveClaim[]; projects: Project[] }) {
    const [domain, setDomain] = useState<string | null>(null);
    const [loadingDomain, setLoadingDomain] = useState(false);

    useEffect(() => {
        const fetchDomain = async () => {
            if (projects.length > 0) {
                setLoadingDomain(true);
                try {
                    const titles = projects.map(p => p.title);
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
    }, [projects]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
            <div className="lg:col-span-1 space-y-6">
                <Card>
                    <CardContent className="p-6 text-center">
                        <Avatar className="h-28 w-28 mx-auto mb-4">
                            <AvatarImage src={user.photoURL || undefined} alt={user.name} />
                            <AvatarFallback>{user.name?.[0].toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <h1 className="text-2xl font-bold">{user.name}</h1>
                        <p className="text-muted-foreground break-words">{user.email}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <ProfileDetail label="Designation" value={user.designation} />
                        <ProfileDetail label="MIS ID" value={user.misId} />
                        <ProfileDetail label="ORCID ID" value={user.orcidId} />
                        <ProfileDetail label="Scopus ID" value={user.scopusId} />
                        <ProfileDetail label="Vidwan ID" value={user.vidwanId} />
                        <ProfileDetail label="Google Scholar ID" value={user.googleScholarId} />
                        <ProfileDetail label="Faculty" value={user.faculty} />
                        <ProfileDetail label="Institute" value={user.institute} />
                        <ProfileDetail label="Department" value={user.department} />
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                          <Bot className="h-5 w-5" />
                          <CardTitle>Core Research Domain</CardTitle>
                        </div>
                        <CardDescription>AI-suggested domain based on publications.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loadingDomain ? (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Analyzing...</span>
                            </div>
                        ) : domain ? (
                            <Badge variant="secondary" className="text-base">{domain}</Badge>
                        ) : (
                            <p className="text-sm text-muted-foreground">Not enough data to determine a domain.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
            <div className="lg:col-span-3">
                <Tabs defaultValue="projects" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="projects">Projects ({projects.length})</TabsTrigger>
                        <TabsTrigger value="claims">Incentive Claims ({claims.length})</TabsTrigger>
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
                                <Card><CardContent className="p-6 text-center text-muted-foreground">No projects found.</CardContent></Card>
                            )}
                        </div>
                    </TabsContent>
                    <TabsContent value="claims">
                        <div className="space-y-4 mt-4">
                             {claims.length > 0 ? claims.map(claim => (
                                <Card key={claim.id}>
                                    <CardContent className="p-4">
                                        <p className="font-semibold">{claim.paperTitle}</p>
                                        {claim.journalName && <p className="text-sm text-muted-foreground">Journal: {claim.journalName}</p>}
                                        <p className="text-sm text-muted-foreground">Submitted: {new Date(claim.submissionDate).toLocaleDateString()}</p>
                                        <Badge variant={claim.status === 'Accepted' ? 'default' : claim.status === 'Rejected' ? 'destructive' : 'secondary'} className="mt-2">{claim.status}</Badge>
                                    </CardContent>
                                </Card>
                            )) : (
                                <Card><CardContent className="p-6 text-center text-muted-foreground">No incentive claims found.</CardContent></Card>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
