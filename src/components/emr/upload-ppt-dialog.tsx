
'use client';

import { useState } from 'react';
import type { FundingCall, User, EmrInterest } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, Upload, File, Trash2, MessageSquareWarning } from 'lucide-react';
import { uploadEmrPpt, uploadRevisedEmrPpt, removeEmrPpt } from '@/app/actions';
import { format, isAfter, parseISO, subDays, setHours, setMinutes, setSeconds, addDays } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

interface UploadPptDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    interest: EmrInterest;
    call: FundingCall;
    user: User;
    onUploadSuccess: () => void;
    isRevision?: boolean;
}

const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};

export function UploadPptDialog({ isOpen, onOpenChange, interest, call, user, onUploadSuccess, isRevision = false }: UploadPptDialogProps) {
    const [pptFile, setPptFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const { toast } = useToast();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setPptFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!pptFile) return;
        setIsUploading(true);
        try {
            const dataUrl = await fileToDataUrl(pptFile);
            
            let result;
            if (isRevision) {
                result = await uploadRevisedEmrPpt(interest.id, dataUrl, pptFile.name, user.name);
            } else {
                result = await uploadEmrPpt(interest.id, dataUrl, pptFile.name, user.name);
            }

            if (result.success) {
                toast({ title: 'Success', description: `Your presentation has been ${isRevision ? 'updated' : 'uploaded'}.` });
                onUploadSuccess();
                onOpenChange(false);
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Upload Failed', description: error.message || 'An unexpected error occurred.' });
        } finally {
            setIsUploading(false);
        }
    };
    
    const handleDelete = async () => {
        setIsUploading(true);
        try {
            const result = await removeEmrPpt(interest.id);
            if(result.success) {
                toast({ title: 'Success', description: 'Your presentation has been removed.' });
                onUploadSuccess();
            } else {
                 throw new Error(result.error);
            }
        } catch(error: any) {
            toast({ variant: 'destructive', title: 'Deletion Failed', description: error.message || 'An unexpected error occurred.' });
        } finally {
            setIsUploading(false);
        }
    };

    const hasMeeting = !!(call.meetingDetails?.date && interest.meetingSlot?.date);
    let deadlineWithTime: Date | null = null;
    let isDeadlinePast = false;
    let dialogDescription = 'Upload your presentation for the upcoming evaluation meeting.';

    if (hasMeeting) {
        const meetingDate = parseISO(interest.meetingSlot!.date);
        if (isRevision) {
            // Deadline is 3 days after meeting at 5:00 PM for revisions
            deadlineWithTime = setSeconds(setMinutes(setHours(addDays(meetingDate, 3), 17), 0), 0);
            dialogDescription = `The deadline to submit your revision is ${format(deadlineWithTime, 'PPpp')}.`;
        } else {
            // Deadline is 2 days before meeting at 5:00 PM for initial submission
            deadlineWithTime = setSeconds(setMinutes(setHours(subDays(meetingDate, 2), 17), 0), 0);
            dialogDescription = `The deadline to upload is ${format(deadlineWithTime, 'PPp')}.`;
        }
        isDeadlinePast = isAfter(new Date(), deadlineWithTime);
    }
    
    const isUploadDisabled = hasMeeting && isDeadlinePast;

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isRevision ? 'Submit Revised Presentation' : 'Manage Your Presentation'}</DialogTitle>
                    <DialogDescription>{dialogDescription}</DialogDescription>
                </DialogHeader>
                 {isUploadDisabled && (
                    <Alert variant="destructive">
                      <MessageSquareWarning className="h-4 w-4" />
                      <AlertTitle>Deadline Passed</AlertTitle>
                      <AlertDescription>The deadline for submitting presentations has passed. Please contact the RDC for assistance.</AlertDescription>
                    </Alert>
                  )}
                  <div className="space-y-4 py-4">
                    {interest.pptUrl && !isRevision && (
                       <div className="flex items-center justify-between p-3 rounded-lg border bg-secondary">
                          <a href={interest.pptUrl} target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline flex items-center gap-2">
                             <File className="h-4 w-4"/> View Current Presentation
                          </a>
                          {!isUploadDisabled && (
                              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isUploading}><Trash2 className="h-4 w-4"/></Button>
                          )}
                       </div>
                    )}
                    <Input type="file" accept=".ppt, .pptx" onChange={handleFileChange} disabled={isUploadDisabled} />
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button onClick={handleUpload} disabled={isUploading || !pptFile || isUploadDisabled}>
                        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Upload className="mr-2 h-4 w-4"/>}
                        {interest.pptUrl && !isRevision ? 'Replace' : 'Upload'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

    