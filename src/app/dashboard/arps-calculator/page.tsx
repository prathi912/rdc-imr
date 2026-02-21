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
                    setAllUsers(users);
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
            console.error(result.error);
        }
        setIsCalculating(false);
    };

    const yearOptions = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());
    const userOptions = allUsers.map(u => ({ label: u.name, value: u.uid }));

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
                description={isSuperAdmin ? "Calculate the Annual Research Performance Score for any faculty member." : "Calculate your Annual Research Performance Score."}
            />
            <Card className="mt-8">
                <CardHeader>
                    <CardTitle>Calculate Score</CardTitle>
                    <CardDescription>Select a user and year to calculate the ARPS based on approved claims and projects.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {isSuperAdmin && (
                        <Combobox
                            options={userOptions}
                            value={selectedUserId}
                            onChange={setSelectedUserId}
                            placeholder="Select a faculty member..."
                            searchPlaceholder="Search faculty..."
                            emptyPlaceholder="No user found."
                        />
                    )}
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                        <SelectTrigger><SelectValue placeholder="Select year..." /></SelectTrigger>
                        <SelectContent>
                            {yearOptions.map(year => (
                                <SelectItem key={year} value={year}>{year}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button onClick={handleCalculate} disabled={!selectedUserId || !selectedYear || isCalculating} className={isSuperAdmin ? '' : 'md:col-start-2'}>
                        {isCalculating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Calculate ARPS
                    </Button>
                </CardContent>
            </Card>

            {isCalculating && (
                <div className="flex justify-center items-center p-8 mt-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-4 text-muted-foreground">Calculating score...</p>
                </div>
            )}
            
            {results && <ArpsResultsDisplay results={results} />}
        </div>
    );
}
