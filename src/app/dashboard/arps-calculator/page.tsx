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

export default function ArpsCalculatorPage() {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
    const [loading, setLoading] = useState(true);
    const [isCalculating, setIsCalculating] = useState(false);
    const [results, setResults] = useState<ArpsData | null>(null);
    const router = useRouter();

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const parsedUser = JSON.parse(storedUser);
            setCurrentUser(parsedUser);
        } else {
            router.push('/login');
        }
        setLoading(false);
    }, [router]);

    const handleCalculate = async () => {
        if (!currentUser || !selectedYear) return;
        setIsCalculating(true);
        setResults(null);
        const result = await calculateArpsForUser(currentUser.uid, parseInt(selectedYear, 10));
        if (result.success) {
            setResults(result.data!);
        } else {
            // Handle error, maybe show a toast
            console.error(result.error);
        }
        setIsCalculating(false);
    };

    const yearOptions = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());

    if (loading || !currentUser) {
        return (
            <div className="container mx-auto py-10">
                <PageHeader
                    title="ARPS Calculator"
                    description="Calculate your Annual Research Performance Score."
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
                description="Calculate your Annual Research Performance Score."
            />
            <Card className="mt-8">
                <CardHeader>
                    <CardTitle>Calculate Your Score</CardTitle>
                    <CardDescription>Select a year to calculate your ARPS based on your approved claims and projects for that year.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                        <SelectTrigger><SelectValue placeholder="Select year..." /></SelectTrigger>
                        <SelectContent>
                            {yearOptions.map(year => (
                                <SelectItem key={year} value={year}>{year}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button onClick={handleCalculate} disabled={!selectedYear || isCalculating}>
                        {isCalculating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Calculate My ARPS
                    </Button>
                </CardContent>
            </Card>

            {isCalculating && (
                <div className="flex justify-center items-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            )}
            
            {results && <ArpsResultsDisplay results={results} />}
        </div>
    );
}
