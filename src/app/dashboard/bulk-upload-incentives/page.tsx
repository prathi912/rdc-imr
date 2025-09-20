
'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileWarning, Upload, Loader2, XCircle, CheckCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { bulkUploadIncentiveClaims } from '@/app/incentive-bulk-actions';
import type { User } from '@/types';

const CLAIM_TYPES = ['Research Papers', 'Patents', 'Conference Presentations', 'Books', 'Membership of Professional Bodies', 'Seed Money for APC'];

type IncentiveUploadData = {
  'Title of Paper': string;
  Email: string;
  Journal: string;
  Amount: number;
  Index: 'Scopus' | 'WOS' | 'Scopus & WOS' | 'ESCI';
  'Date of proof': string | number | Date;
};

type UploadResult = {
  successfulClaims: number;
  totalRecords: number;
  errors: { title: string; reason: string }[];
};

export default function BulkUploadIncentivesPage() {
  const [data, setData] = useState<IncentiveUploadData[]>([]);
  const [fileName, setFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [claimType, setClaimType] = useState<string>('');
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useState(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setUploadResult(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const binaryStr = event.target?.result;
        const workbook = XLSX.read(binaryStr, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

        const requiredColumns = ['Title of Paper', 'Email', 'Journal', 'Amount', 'Index', 'Date of proof'];
        
        const firstRow = jsonData[0];
        if (!firstRow || !requiredColumns.every(col => col in firstRow)) {
          toast({
            variant: 'destructive',
            title: 'Invalid File Format',
            description: `The Excel file must contain the following columns: ${requiredColumns.join(', ')}.`,
            duration: 8000,
          });
          setData([]);
          setFileName('');
          return;
        }

        setData(jsonData as IncentiveUploadData[]);
      } catch (error) {
        console.error("Error parsing file:", error);
        toast({ variant: 'destructive', title: 'File Error', description: 'Could not parse the uploaded file.' });
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleUpload = async () => {
    if (data.length === 0 || !claimType) {
      toast({ variant: 'destructive', title: 'Missing Information', description: 'Please select a claim type and upload a file.' });
      return;
    }
    if (!currentUser || currentUser.role !== 'Super-admin') {
      toast({ variant: 'destructive', title: 'Permission Denied' });
      return;
    }

    setIsLoading(true);
    setUploadResult(null);
    try {
      const result = await bulkUploadIncentiveClaims(data, claimType, currentUser.uid);
      if (result.success) {
        setUploadResult(result.data);
        toast({ title: 'Upload Processed', description: `${result.data.successfulClaims} claims created from ${result.data.totalRecords} records.` });
        setData([]);
        setFileName('');
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Upload Failed', description: error.message || 'An unexpected error occurred.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Bulk Upload Incentive Claims" description="Upload historical incentive data for research papers." />
      <div className="mt-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Upload File</CardTitle>
            <CardDescription>Select a claim type and an Excel file with historical data.</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <FileWarning className="h-4 w-4" />
              <AlertTitle>Important: File Format for Research Papers</AlertTitle>
              <AlertDescription>
                Ensure your Excel file has these exact columns: <code className="font-mono text-xs">Title of Paper</code>, <code className="font-mono text-xs">Email</code>, <code className="font-mono text-xs">Journal</code>, <code className="font-mono text-xs">Amount</code>, <code className="font-mono text-xs">Index</code>, <code className="font-mono text-xs">Date of proof</code>.
              </AlertDescription>
            </Alert>
            <div className="mt-6 flex flex-col sm:flex-row items-center gap-4">
              <Select value={claimType} onValueChange={setClaimType}>
                <SelectTrigger className="w-full sm:w-[280px]">
                  <SelectValue placeholder="Select Claim Type..." />
                </SelectTrigger>
                <SelectContent>
                  {CLAIM_TYPES.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input id="file-upload" type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="max-w-xs" />
              <Button onClick={handleUpload} disabled={isLoading || data.length === 0 || !claimType}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Upload {data.length > 0 ? `${data.length} Records` : ''}
              </Button>
            </div>
            {fileName && <p className="mt-2 text-sm text-muted-foreground">Selected file: {fileName}</p>}
          </CardContent>
        </Card>

        {uploadResult && (
          <Card>
            <CardHeader>
              <CardTitle>Upload Report</CardTitle>
              <CardDescription>Summary of the bulk upload process.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Successfully Created/Updated Claims: {uploadResult.successfulClaims}
                </h3>
                 <p className="text-sm text-muted-foreground mt-1">Processed {uploadResult.totalRecords} records from the Excel file.</p>
              </div>
              {uploadResult.errors.length > 0 && (
                <Alert variant="destructive">
                  <XCircle className="h-5 w-5" />
                  <AlertTitle>Failed Records ({uploadResult.errors.length})</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-2 list-disc pl-5 text-sm max-h-48 overflow-y-auto">
                      {uploadResult.errors.map((f, i) => (
                        <li key={i}>
                          <strong>{f.title}</strong> - <span className="italic">{f.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {data.length > 0 && !uploadResult && (
          <Card>
            <CardHeader>
              <CardTitle>Preview Data ({data.length} rows)</CardTitle>
              <CardDescription>Review the data before uploading. Records with the same paper title will be grouped into a single claim.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Title of Paper</TableHead>
                      <TableHead>Journal</TableHead>
                      <TableHead className="text-right">Incentive (Rs.)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>{row['Email']}</TableCell>
                        <TableCell className="font-medium">{row['Title of Paper']}</TableCell>
                        <TableCell>{row['Journal']}</TableCell>
                        <TableCell className="text-right">{row['Amount']?.toLocaleString('en-IN')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
