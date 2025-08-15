
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
import { FileWarning, Upload, Loader2, CheckCircle, XCircle, Link as LinkIcon } from 'lucide-react';
import { bulkUploadPapers } from '@/app/bulkpapers';
import type { User } from '@/types';

type PaperUploadData = {
    PublicationTitle: string;
    PublicationURL: string;
    PublicationYear?: number;
    PublicationMonthName?: string;
    ImpactFactor?: number;
};

type UploadResult = {
  newPapers: { title: string }[];
  linkedPapers: { title: string }[];
  errors: { title: string; reason: string }[];
};

export default function BulkUploadPapersPage() {
  const [data, setData] = useState<PaperUploadData[]>([]);
  const [fileName, setFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const { toast } = useToast();

  useState(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
        setUser(JSON.parse(storedUser));
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
        const workbook = XLSX.read(binaryStr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

        const requiredColumns = ['PublicationTitle', 'PublicationURL', 'PublicationYear'];
        const firstRow = jsonData[0];
        if (!firstRow || !requiredColumns.every(col => col in firstRow)) {
            toast({
                variant: 'destructive',
                title: 'Invalid File Format',
                description: `The file must contain columns: ${requiredColumns.join(', ')}.`,
                duration: 6000
            });
            setData([]);
            setFileName('');
            return;
        }

        const formattedData = jsonData.map(row => ({
          PublicationTitle: String(row.PublicationTitle || ''),
          PublicationURL: String(row.PublicationURL || ''),
          PublicationYear: row.PublicationYear ? Number(row.PublicationYear) : undefined,
          PublicationMonthName: row.PublicationMonthName ? String(row.PublicationMonthName) : undefined,
          ImpactFactor: row.ImpactFactor ? Number(row.ImpactFactor) : undefined,
        }));
        setData(formattedData);
      } catch (error) {
        console.error("Error parsing file:", error);
        toast({ variant: 'destructive', title: 'File Error', description: 'Could not parse the uploaded file.' });
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleUpload = async () => {
    if (data.length === 0 || !user) {
      toast({ variant: 'destructive', title: 'No Data', description: 'There is no data to upload or user is not identified.' });
      return;
    }
    setIsLoading(true);
    setUploadResult(null);
    try {
        const result = await bulkUploadPapers(data, user);
        if (result.success) {
            setUploadResult(result.data);
            toast({ title: 'Upload Processed', description: `Successfully processed ${data.length} records.` });
            setData([]);
            setFileName('');
        } else {
            throw new Error(result.error);
        }
    } catch (error: any) {
        console.error('Upload failed:', error);
        toast({ variant: 'destructive', title: 'Upload Failed', description: error.message || 'An unexpected error occurred.' });
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Bulk Upload Research Papers" description="Upload an Excel file to add your published papers to the portal." />
      <div className="mt-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Upload File</CardTitle>
            <CardDescription>Select an Excel (.xlsx) file with your publication data.</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <FileWarning className="h-4 w-4" />
              <AlertTitle>Required File Format</AlertTitle>
              <AlertDescription>
                Your Excel file must contain these columns: 
                <code className="mx-1 rounded-sm bg-muted p-1 font-mono text-sm">PublicationTitle</code>, 
                <code className="mx-1 rounded-sm bg-muted p-1 font-mono text-sm">PublicationURL</code>, and
                <code className="mx-1 rounded-sm bg-muted p-1 font-mono text-sm">PublicationYear</code>.
                Optional columns are <code className="mx-1 rounded-sm bg-muted p-1 font-mono text-sm">PublicationMonthName</code> and <code className="mx-1 rounded-sm bg-muted p-1 font-mono text-sm">ImpactFactor</code>.
              </AlertDescription>
            </Alert>
            <div className="mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <Input id="file-upload" type="file" accept=".xlsx" onChange={handleFileUpload} className="w-full sm:max-w-xs" />
              <Button onClick={handleUpload} disabled={isLoading || data.length === 0}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Upload {data.length > 0 ? `${data.length} Rows` : ''}
              </Button>
            </div>
            {fileName && <p className="mt-2 text-sm text-muted-foreground">Selected file: {fileName}</p>}
          </CardContent>
        </Card>

        {data.length > 0 && !uploadResult && (
          <Card>
            <CardHeader>
              <CardTitle>Preview Data ({data.length} rows)</CardTitle>
              <CardDescription>Review the data before uploading.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="max-h-96 overflow-x-auto">
                    <Table>
                        <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>URL</TableHead><TableHead>Year</TableHead></TableRow></TableHeader>
                        <TableBody>
                        {data.map((row, index) => (
                            <TableRow key={index}>
                            <TableCell className="font-medium whitespace-nowrap">{row.PublicationTitle}</TableCell>
                            <TableCell className="whitespace-nowrap">{row.PublicationURL}</TableCell>
                            <TableCell>{row.PublicationYear}</TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
          </Card>
        )}

        {uploadResult && (
            <Card>
                <CardHeader>
                    <CardTitle>Upload Report</CardTitle>
                    <CardDescription>Summary of the bulk upload process.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div>
                        <h3 className="font-semibold flex items-center gap-2"><CheckCircle className="h-5 w-5 text-green-500" /> New Papers Added ({uploadResult.newPapers.length})</h3>
                        {uploadResult.newPapers.length > 0 ? (
                            <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground max-h-48 overflow-y-auto">
                                {uploadResult.newPapers.map(p => <li key={p.title}>{p.title}</li>)}
                            </ul>
                        ) : <p className="text-sm text-muted-foreground mt-2">No new papers were created.</p>}
                    </div>
                     <div>
                        <h3 className="font-semibold flex items-center gap-2"><LinkIcon className="h-5 w-5 text-blue-500" /> Papers Linked ({uploadResult.linkedPapers.length})</h3>
                        {uploadResult.linkedPapers.length > 0 ? (
                             <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground max-h-48 overflow-y-auto">
                                {uploadResult.linkedPapers.map(p => <li key={p.title}>{p.title}</li>)}
                            </ul>
                        ) : <p className="text-sm text-muted-foreground mt-2">No existing papers were linked to your profile.</p>}
                    </div>
                     <div>
                        <h3 className="font-semibold flex items-center gap-2"><XCircle className="h-5 w-5 text-destructive" /> Errors ({uploadResult.errors.length})</h3>
                        {uploadResult.errors.length > 0 ? (
                             <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground max-h-48 overflow-y-auto">
                                {uploadResult.errors.map((f, i) => <li key={i}>{f.title}: <span className="text-destructive">{f.reason}</span></li>)}
                            </ul>
                        ) : <p className="text-sm text-muted-foreground mt-2">No errors occurred.</p>}
                    </div>
                </CardContent>
            </Card>
        )}
      </div>
    </div>
  );
}
