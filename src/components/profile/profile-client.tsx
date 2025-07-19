
'use client';

import { useState, useEffect } from 'react';
import type { User, Project, EmrInterest, FundingCall } from '@/types';
import { getResearchDomain } from '@/app/actions';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, Loader2, Mail, Briefcase, Building2, BookCopy } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '../ui/button';

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
    
    const getCallTitle = (callId: string) => {
        return fundingCalls.find(c => c.id === callId)?.title || callId;
    }

    const StatItem = ({ value, label }: { value: number | string; label: string }) => (
        <div className="flex flex-col items-center">
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
        </div>
    );


    return (
        <div className="flex flex-col items-center">
            <div className="w-full h-20" />
            <Card className="w-full max-w-4xl -mt-20 mx-auto shadow-xl border-0 bg-card/80 backdrop-blur-lg">
                <CardContent className="p-6 md:p-8">
                    <div className="relative flex flex-col items-center md:flex-row md:items-start md:justify-between -mt-24 md:-mt-16">
                         <Avatar className="h-32 w-32 border-4 border-background">
                            <AvatarImage src={user.photoURL || undefined} alt={user.name} />
                            <AvatarFallback className="text-4xl">{user.name?.[0].toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="mt-4 md:mt-0 md:ml-auto flex items-center gap-2">
                             <Button asChild variant="outline">
                                <a href={`mailto:${user.email}`}>
                                    <Mail className="mr-2 h-4 w-4" /> Email
                                </a>
                            </Button>
                        </div>
                    </div>
                    
                    <div className="text-center md:text-left md:ml-36 md:-mt-12 space-y-1">
                        <h1 className="text-3xl font-bold">{user.name}</h1>
                        <p className="text-muted-foreground">{user.designation}</p>
                        <p className="text-muted-foreground">{user.department}, {user.institute}</p>
                    </div>

                    <div className="flex justify-center md:justify-start md:ml-36 gap-8 my-6">
                        <StatItem value={projects.length} label="IMR Projects" />
                        <StatItem value={emrInterests.length} label="EMR Interests" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 pt-6 border-t">
                        <div className="space-y-4">
                            <h3 className="font-semibold text-lg">Academic Details</h3>
                            <div className="space-y-4">
                                <ProfileDetail label="Faculty" value={user.faculty} icon={Building2} />
                                <ProfileDetail label="Institute" value={user.institute} icon={Building2} />
                                <ProfileDetail label="Department" value={user.department} icon={Briefcase} />
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
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="projects">IMR Projects ({projects.length})</TabsTrigger>
                        <TabsTrigger value="emr">EMR Interests ({emrInterests.length})</TabsTrigger>
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
                </Tabs>
            </div>
        </div>
    );
}
