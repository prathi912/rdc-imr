'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { type User } from '@/types';
import { calculateArpsForUser } from '@/app/arps-actions';
import { ArpsResultsDisplay, type ArpsData } from '@/components/dashboard/arps/arps-results-display';
import { useRouter } from 'next/navigation';
import { getAllUsers } from '@/app/actions';
import { Combobox } from '@/components/ui/combobox';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { getDefaultModulesForRole } from '@/lib/modules';
import { Download } from 'lucide-react';

export default function ArpsCalculatorPage() {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
    const [loading, setLoading] = useState(true);
    const [isCalculating, setIsCalculating] = useState(false);
    const [results, setResults] = useState<ArpsData | null>(null);
    const router = useRouter();
    const { toast } = useToast();

    const isSuperAdmin = currentUser?.role === 'Super-admin';

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const parsedUser = JSON.parse(storedUser);
            setCurrentUser(parsedUser);
            if (parsedUser.role !== 'Super-admin') {
                setSelectedUserId(parsedUser.uid);
            }
        } else {
            router.push('/login');
        }
    }, [router]);

    useEffect(() => {
        async function loadData() {
            if (currentUser) {
                if (currentUser.role === 'Super-admin') {
                    const users = await getAllUsers();
                    setAllUsers(users.filter(u => {
                        const userModules = u.allowedModules || getDefaultModulesForRole(u.role, u.designation);
                        const hasClaimModule = userModules.includes('incentive-claim');
                        const isEligibleRole = (u.role === 'faculty' || u.role === 'CRO' || u.role === 'Super-admin');
                        return isEligibleRole && hasClaimModule;
                    }));
                }
                setLoading(false);
            }
        }
        loadData();
    }, [currentUser]);

    const handleCalculate = async () => {
        if (!selectedUserId || !selectedYear) {
            toast({
                variant: 'destructive',
                title: 'Selection Required',
                description: 'Please select a user and a year.',
            });
            return;
        }
        setIsCalculating(true);
        setResults(null);
        const result = await calculateArpsForUser(selectedUserId, parseInt(selectedYear, 10));
        if (result.success) {
            setResults(result.data!);
        } else {
            toast({
                variant: 'destructive',
                title: 'Error Calculating Score',
                description: result.error || 'An unexpected error occurred.',
            });
        }
        setIsCalculating(false);
    };

    const handleDownloadReport = async () => {
        if (!results) return;

        try {
            const [{ jsPDF }, { default: autoTable }] = await Promise.all([
                import('jspdf'),
                import('jspdf-autotable'),
            ]);

            const selectedUser = isSuperAdmin
                ? allUsers.find(u => u.uid === selectedUserId)
                : currentUser;

            const getFullInstituteName = (institute?: string) => {
                if (!institute) return 'N/A';
                const normalized = institute.trim();
                const shortToFullMap: Record<string, string> = {
                    RDC: 'Research & Development Cell (RDC)',
                };
                return shortToFullMap[normalized] || normalized;
            };
            const instituteFullName = getFullInstituteName(selectedUser?.institute);

            const evaluationWindow = `01-Jun-${selectedYear} to 31-May-${Number(selectedYear) + 1}`;
            const safeName = (selectedUser?.name || 'faculty').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '_');

            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 12;

            const svgToPngDataUrl = async (url: string, targetWidth = 180, targetHeight = 48): Promise<string> => {
                const svgText = await fetch(url).then(res => res.text());
                const svgBase64 = btoa(unescape(encodeURIComponent(svgText)));
                const img = new Image();
                img.src = `data:image/svg+xml;base64,${svgBase64}`;

                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });

                const canvas = document.createElement('canvas');
                canvas.width = targetWidth * 4;
                canvas.height = targetHeight * 4;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('Failed to render logo');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                return canvas.toDataURL('image/png');
            };

            const logoUrl = 'https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/RDC-PU-LOGO-BLACK.svg';
            try {
                const logoPng = await svgToPngDataUrl(logoUrl);
                doc.addImage(logoPng, 'PNG', margin, 8, 100, 16);
            } catch {
                // Fallback if logo fetch/render fails
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.text('ARPS Calculation Report', pageWidth - margin, 16, { align: 'right' });
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, pageWidth - margin, 21, { align: 'right' });

            let currentY = 30;

            autoTable(doc, {
                startY: currentY,
                head: [['Field', 'Value']],
                body: [
                    ['Faculty Name', selectedUser?.name || 'N/A'],
                    ['MIS ID', selectedUser?.misId || 'N/A'],
                    ['Institute (Full Name)', instituteFullName],
                    ['Department', selectedUser?.department || 'N/A'],
                    ['Evaluation Year', selectedYear],
                    ['Evaluation Window', evaluationWindow],
                    ['Total ARPS', results.totalArps.toFixed(2)],
                    ['Grade', results.grade],
                ],
                theme: 'grid',
                headStyles: { fillColor: [15, 23, 42], textColor: 255 },
                styles: { fontSize: 9, cellPadding: 2 },
                margin: { left: margin, right: margin },
                columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 'auto' } },
            });

            currentY = ((doc as any).lastAutoTable?.finalY || currentY) + 6;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text('Score Summary', margin, currentY);
            currentY += 2;

            autoTable(doc, {
                startY: currentY,
                head: [['Component', 'Raw', 'Weighted', 'Final']],
                body: [
                    ['Publications', results.publications.raw.toFixed(2), results.publications.weighted.toFixed(2), results.publications.final.toFixed(2)],
                    ['Patents', results.patents.raw.toFixed(2), results.patents.weighted.toFixed(2), results.patents.final.toFixed(2)],
                    ['EMR Projects', results.emr.raw.toFixed(2), results.emr.weighted.toFixed(2), results.emr.final.toFixed(2)],
                ],
                foot: [['Total', (results.publications.raw + results.patents.raw + results.emr.raw).toFixed(2), (results.publications.weighted + results.patents.weighted + results.emr.weighted).toFixed(2), results.totalArps.toFixed(2)]],
                theme: 'grid',
                headStyles: { fillColor: [30, 41, 59], textColor: 255 },
                footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: 'bold' },
                styles: { fontSize: 9, cellPadding: 2 },
                margin: { left: margin, right: margin },
            });

            const addSection = (title: string, head: string[], body: (string | number)[][]) => {
                let y = ((doc as any).lastAutoTable?.finalY || 20) + 8;
                if (y > pageHeight - 40) {
                    doc.addPage();
                    y = 20;
                }

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                doc.text(title, margin, y);

                autoTable(doc, {
                    startY: y + 2,
                    head: [head],
                    body: body.length ? body : [['No records found', '', '', '', '', '', '', '']],
                    theme: 'striped',
                    headStyles: { fillColor: [51, 65, 85], textColor: 255 },
                    styles: { fontSize: 8, cellPadding: 1.8, overflow: 'linebreak' },
                    margin: { left: margin, right: margin },
                });
            };

            addSection(
                'Publications Details',
                ['Claim ID', 'Title', 'Type', 'Quartile', 'Author Pos.', 'Base', 'Multiplier', 'Raw Score'],
                results.publications.contributingClaims.map(({ claim, score, calculation }) => [
                    claim.claimId || claim.id,
                    claim.paperTitle || claim.publicationTitle || '',
                    claim.publicationType || '',
                    claim.journalClassification || '',
                    claim.authorPosition || '',
                    calculation.base.toFixed(2),
                    String(calculation.multiplier ?? calculation.quartileMultiplier ?? 1),
                    score.toFixed(2),
                ])
            );

            addSection(
                'Patents Details',
                ['Claim ID', 'Title', 'Status', 'Locale', 'Sole Applicant', 'Base', 'Multiplier', 'Raw Score'],
                results.patents.contributingClaims.map(({ claim, score, calculation }) => [
                    claim.claimId || claim.id,
                    claim.patentTitle || '',
                    claim.currentStatus || '',
                    claim.patentLocale || '',
                    claim.isPuSoleApplicant ? 'Yes' : 'No',
                    calculation.base.toFixed(2),
                    String(calculation.applicantMultiplier ?? ''),
                    score.toFixed(2),
                ])
            );

            addSection(
                'EMR Projects Details',
                ['Project ID', 'Project Title', 'Amount/Duration', 'Raw Score', '', '', '', ''],
                results.emr.contributingProjects.map(({ project, score }) => [
                    project.interestId || project.id,
                    project.callTitle || '',
                    project.durationAmount || '',
                    score.toFixed(2),
                    '',
                    '',
                    '',
                    '',
                ])
            );

            const totalPages = doc.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(100);
                doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
            }

            doc.save(`ARPS_Report_${safeName}_${selectedYear}.pdf`);
            toast({ title: 'Report Downloaded', description: 'ARPS report PDF generated successfully.' });
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'PDF Export Failed',
                description: error?.message || 'Could not generate the PDF report.',
            });
        }
    };

    const yearOptions = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());
    const userOptions = allUsers.map(u => ({ label: u.name, value: u.uid }));

    if (loading || !currentUser) {
        return (
            <div className="container mx-auto py-10">
                <PageHeader
                    title="ARPS Calculator"
                    description="Calculate the Annual Research Performance Score."
                />
                 <div className="flex justify-center items-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-10">
            <PageHeader
                title="ARPS Calculator"
                description="Calculate the Annual Research Performance Score for an evaluation year (June 1st to May 31st)."
            />
            <Card className="mt-8">
                <CardHeader>
                    <CardTitle>Calculate Score</CardTitle>
                    <CardDescription>Select a user and evaluation year to calculate the ARPS based on approved claims and projects.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {isSuperAdmin ? (
                        <Combobox
                            options={userOptions}
                            value={selectedUserId}
                            onChange={setSelectedUserId}
                            placeholder="Select a faculty member..."
                            searchPlaceholder="Search faculty..."
                            emptyPlaceholder="No user found."
                        />
                    ) : (
                        <Input value={currentUser.name} disabled />
                    )}
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                        <SelectTrigger><SelectValue placeholder="Select year..." /></SelectTrigger>
                        <SelectContent>
                            {yearOptions.map(year => (
                                <SelectItem key={year} value={year}>{year}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button onClick={handleCalculate} disabled={!selectedUserId || !selectedYear || isCalculating}>
                        {isCalculating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isSuperAdmin ? 'Calculate ARPS' : 'Calculate My ARPS'}
                    </Button>
                </CardContent>
            </Card>

            {isCalculating && (
                <div className="flex justify-center items-center p-8 mt-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-4 text-muted-foreground">Calculating score...</p>
                </div>
            )}
            
            {results && (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <Button type="button" variant="outline" onClick={handleDownloadReport}>
                            <Download className="mr-2 h-4 w-4" />
                            Download PDF Report
                        </Button>
                    </div>
                    <ArpsResultsDisplay results={results} />
                </div>
            )}
        </div>
    );
}
