
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
import { FileWarning, Upload, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { bulkUploadPapers } from '@/app/actions';

type PaperUploadData = {
  paper_title: string;
  author_email: string;
  author_type: 'First Author' | 'Corresponding Author' | 'Co-Author';
  url: string;
};

type UploadResult = {
  successfulPapers: { title: string; authors: string[] }[];
  failedAuthorLinks: { title: string; email: string; reason: string }[];
};

export default function BulkUploadPapersPage() {
  const [data, setData] = useState<PaperUploadData[]>([]);
  const [fileName, setFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const { toast } = useToast();

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

        const requiredColumns = ['paper_title', 'author_email', 'author_type', 'url'];
        const firstRow = jsonData[0];
        if (!firstRow || !requiredColumns.every(col => col in firstRow)) {
            toast({
                variant: 'destructive',
                title: 'Invalid File Format',
                description: `The file must contain columns: ${requiredColumns.join(', ')}.`,
                duration: 8000
            });
            setData([]);
            setFileName('');
            return;
        }

        const formattedData = jsonData.map(row => ({
          paper_title: String(row.paper_title || ''),
          author_email: String(row.author_email || ''),
          author_type: String(row.author_type || 'Co-Author') as PaperUploadData['author_type'],
          url: String(row.url || ''),
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
    if (data.length === 0) {
      toast({ variant: 'destructive', title: 'No Data', description: 'There is no data to upload.' });
      return;
    }
    setIsLoading(true);
    setUploadResult(null);
    try {
        const result = await bulkUploadPapers(data);
        if (result.success) {
            setUploadResult(result.data);
            toast({ title: 'Upload Processed', description: `Successfully added ${result.data.successfulPapers.length} new papers.` });
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
      <PageHeader title="Bulk Upload Research Papers" description="Upload an Excel file to add multiple research papers at once." />
      <div className="mt-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Upload File</CardTitle>
            <CardDescription>Select an Excel (.xlsx) file with paper and author data.</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <FileWarning className="h-4 w-4" />
              <AlertTitle>Required File Format</AlertTitle>
              <AlertDescription>
                Your Excel file must contain these columns: 
                <code className="mx-1 rounded-sm bg-muted p-1 font-mono text-sm">paper_title</code>, 
                <code className="mx-1 rounded-sm bg-muted p-1 font-mono text-sm">author_email</code>, 
                <code className="mx-1 rounded-sm bg-muted p-1 font-mono text-sm">author_type</code>, and
                <code className="mx-1 rounded-sm bg-muted p-1 font-mono text-sm">url</code>.
                 Each row represents one author of one paper.
              </AlertDescription>
            </Alert>
            <div className="mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <Input id="file-upload" type="file" accept=".xlsx" onChange={handleFileUpload} className="max-w-xs" />
              <Button onClick={handleUpload} disabled={isLoading || data.length === 0}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Upload {data.length > 0 ? `${data.length} Rows` : ''}
              </Button>
            </div>
            {fileName && <p className="mt-2 text-sm text-muted-foreground">Selected file: {fileName}</p>}
          </CardContent>
        </Card>

        {data.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Preview Data ({data.length} rows)</CardTitle>
              <CardDescription>Review the data before uploading.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="max-h-96 overflow-y-auto">
                    <Table>
                        <TableHeader><TableRow><TableHead>Paper Title</TableHead><TableHead>Author Email</TableHead><TableHead>Author Type</TableHead><TableHead>URL</TableHead></TableRow></TableHeader>
                        <TableBody>
                        {data.map((row, index) => (
                            <TableRow key={index}>
                            <TableCell className="font-medium">{row.paper_title}</TableCell>
                            <TableCell>{row.author_email}</TableCell>
                            <TableCell>{row.author_type}</TableCell>
                            <TableCell>{row.url}</TableCell>
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
                        <h3 className="font-semibold flex items-center gap-2"><CheckCircle className="h-5 w-5 text-green-500" /> Successfully Added Papers ({uploadResult.successfulPapers.length})</h3>
                        {uploadResult.successfulPapers.length > 0 ? (
                            <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground max-h-48 overflow-y-auto">
                                {uploadResult.successfulPapers.map(p => <li key={p.title}>{p.title}</li>)}
                            </ul>
                        ) : <p className="text-sm text-muted-foreground mt-2">No new papers were added.</p>}
                    </div>
                     <div>
                        <h3 className="font-semibold flex items-center gap-2"><XCircle className="h-5 w-5 text-destructive" /> Failed to Link Authors ({uploadResult.failedAuthorLinks.length})</h3>
                        {uploadResult.failedAuthorLinks.length > 0 ? (
                             <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground max-h-48 overflow-y-auto">
                                {uploadResult.failedAuthorLinks.map((f, i) => <li key={i}>{f.title}: <span className="font-semibold text-foreground">{f.email}</span> ({f.reason})</li>)}
                            </ul>
                        ) : <p className="text-sm text-muted-foreground mt-2">All authors were linked successfully.</p>}
                    </div>
                </CardContent>
            </Card>
        )}

      </div>
    </div>
  );
}
