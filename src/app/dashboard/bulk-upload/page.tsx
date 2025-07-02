
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
import { FileWarning, Upload, Loader2 } from 'lucide-react';
import { bulkUploadProjects } from '@/app/actions';

type ProjectData = {
  pi_email: string;
  project_title: string;
  status: string;
  grant_amount: number;
  sanction_date: string; // Expecting date as string
};

export default function BulkUploadPage() {
  const [data, setData] = useState<ProjectData[]>([]);
  const [fileName, setFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const binaryStr = event.target?.result;
        const workbook = XLSX.read(binaryStr, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

        const requiredColumns = ['pi_email', 'project_title', 'status', 'grant_amount', 'sanction_date'];
        const firstRow = jsonData[0];
        if (!firstRow || !requiredColumns.every(col => col in firstRow)) {
            toast({
                variant: 'destructive',
                title: 'Invalid File Format',
                description: `The uploaded file must contain the following columns: ${requiredColumns.join(', ')}.`,
            });
            setData([]);
            setFileName('');
            return;
        }

        const formattedData = jsonData.map(row => ({
          pi_email: String(row.pi_email || ''),
          project_title: String(row.project_title || ''),
          status: String(row.status || ''),
          grant_amount: Number(row.grant_amount || 0),
          sanction_date: row.sanction_date instanceof Date ? row.sanction_date.toISOString() : new Date().toISOString(),
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
    try {
        const result = await bulkUploadProjects(data);
        if (result.success) {
            toast({ title: 'Upload Successful', description: `${result.count} projects have been added or updated.` });
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
      <PageHeader title="Bulk Upload Old Projects" description="Upload an Excel file to add historical project data to the system." />
      <div className="mt-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Upload File</CardTitle>
            <CardDescription>
              Select an Excel (.xlsx) file with the required columns to upload project data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <FileWarning className="h-4 w-4" />
              <AlertTitle>Important: File Format</AlertTitle>
              <AlertDescription>
                Your Excel file must contain the following columns in the first sheet: 
                <code className="font-mono text-sm bg-muted p-1 rounded-sm mx-1">pi_email</code>, 
                <code className="font-mono text-sm bg-muted p-1 rounded-sm mx-1">project_title</code>, 
                <code className="font-mono text-sm bg-muted p-1 rounded-sm mx-1">status</code>, 
                <code className="font-mono text-sm bg-muted p-1 rounded-sm mx-1">grant_amount</code>, and 
                <code className="font-mono text-sm bg-muted p-1 rounded-sm mx-1">sanction_date</code>.
              </AlertDescription>
            </Alert>
            <div className="mt-6 flex flex-col sm:flex-row items-center gap-4">
              <Input id="file-upload" type="file" accept=".xlsx" onChange={handleFileUpload} className="max-w-xs" />
              <Button onClick={handleUpload} disabled={isLoading || data.length === 0}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Upload {data.length > 0 ? `${data.length} Records` : ''}
              </Button>
            </div>
            {fileName && <p className="mt-2 text-sm text-muted-foreground">Selected file: {fileName}</p>}
          </CardContent>
        </Card>

        {data.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Preview Data</CardTitle>
              <CardDescription>
                Review the data before uploading. A total of {data.length} records will be processed.
              </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="max-h-96 overflow-y-auto">
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>PI Email</TableHead>
                            <TableHead>Project Title</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {data.map((row, index) => (
                            <TableRow key={index}>
                            <TableCell>{row.pi_email}</TableCell>
                            <TableCell className="font-medium">{row.project_title}</TableCell>
                            <TableCell>{row.status}</TableCell>
                            <TableCell className="text-right">{row.grant_amount.toLocaleString()}</TableCell>
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
