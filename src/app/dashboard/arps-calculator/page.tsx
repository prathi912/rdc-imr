
'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { db } from '@/lib/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { type User } from '@/types';
import { calculateArpsForUser } from '@/app/arps-actions';
import { ArpsResultsDisplay, type ArpsData } from '@/components/dashboard/arps/arps-results-display';

export default function ArpsCalculatorPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
    const [loading, setLoading] = useState(true);
    const [isCalculating, setIsCalculating] = useState(false);
    const [results, setResults] = useState<ArpsData | null>(null);

    useEffect(() => {
        const fetchRdcUsers = async () => {
            try {
                const usersRef = collection(db, 'users');
                const q = query(usersRef, where('faculty', '==', 'RDC'));
                const querySnapshot = await getDocs(q);
                const userList = querySnapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as User));
                setUsers(userList);
            } catch (error) {
                console.error("Error fetching RDC users:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchRdcUsers();
    }, []);

    const handleCalculate = async () => {
        if (!selectedUserId || !selectedYear) return;
        setIsCalculating(true);
        setResults(null);
        const result = await calculateArpsForUser(selectedUserId, parseInt(selectedYear, 10));
        if (result.success) {
            setResults(result.data!);
        } else {
            // Handle error, maybe show a toast
            console.error(result.error);
        }
        setIsCalculating(false);
    };

    const yearOptions = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());

    return (
        <div className="container mx-auto py-10">
            <PageHeader
                title="ARPS Calculator"
                description="Calculate the Annual Research Performance Score for R&D Cell members."
            />
            <Card className="mt-8">
                <CardHeader>
                    <CardTitle>Select Faculty and Year</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={loading}>
                        <SelectTrigger><SelectValue placeholder="Select an RDC Member..." /></SelectTrigger>
                        <SelectContent>
                            {users.map(user => (
                                <SelectItem key={user.uid} value={user.uid}>{user.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
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
                        Calculate ARPS
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
