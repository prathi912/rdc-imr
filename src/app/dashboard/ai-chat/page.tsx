
'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Bot, User as UserIcon, Loader2, Paperclip, XCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { User } from '@/types';
import { runChatAgent } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';

type Message = {
  id: string;
  role: 'user' | 'model';
  content: { text?: string; media?: { url: string; contentType?: string } }[];
};

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

export default function AiChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setSessionUser(JSON.parse(storedUser));
    }
    setMessages([
      {
        id: 'welcome-message',
        role: 'model',
        content: [{ text: "Hello! I am your AI Research Assistant. How can I help you today? You can ask me questions about project or user data, or upload a file for analysis." }],
      },
    ]);
  }, []);
  
  useEffect(() => {
    if (scrollAreaRef.current) {
        scrollAreaRef.current.scrollTo({
            top: scrollAreaRef.current.scrollHeight,
            behavior: 'smooth'
        });
    }
  }, [messages]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
        if (selectedFile.size > 5 * 1024 * 1024) { // 5MB limit
            toast({ variant: 'destructive', title: 'File too large', description: 'Please select a file smaller than 5MB.' });
            return;
        }
        setFile(selectedFile);
        const dataUrl = await fileToDataUrl(selectedFile);
        setFilePreview(dataUrl);
    }
  };

  const removeFile = () => {
      setFile(null);
      setFilePreview(null);
      if (fileInputRef.current) {
          fileInputRef.current.value = '';
      }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !file) || isLoading || !sessionUser) return;

    const userMessageContent: Message['content'] = [];
    if (file && filePreview) {
        userMessageContent.push({ media: { url: filePreview, contentType: file.type } });
    }
    if (input.trim()) {
        userMessageContent.push({ text: input });
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userMessageContent,
    };
    
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    removeFile();
    setIsLoading(true);

    try {
        const historyForAgent = newMessages
          .filter(m => m.role && Array.isArray(m.content)) // Ensure message has role and content is an array
          .map(m => ({
            role: m.role,
            content: m.content.map(part => {
              if (part.text) return { text: part.text };
              if (part.media) return { media: { url: part.media.url, contentType: part.media.contentType } };
              return { text: '' };
            }).filter(p => p.text || p.media),
          }))
          .filter(m => m.content.length > 0); // Ensure content is not empty after filtering

        const fileDataUri = file ? await fileToDataUrl(file) : undefined;

        const result = await runChatAgent({
            history: historyForAgent,
            user: {
                uid: sessionUser.uid,
                role: sessionUser.role,
                designation: sessionUser.designation,
                institute: sessionUser.institute,
                department: sessionUser.department || undefined,
                faculties: sessionUser.faculties || [],
            },
            fileDataUri: fileDataUri,
        });

        if (result.success) {
             const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'model',
                content: [{ text: result.response }],
            };
            setMessages(prev => [...prev, assistantMessage]);
        } else {
            throw new Error(result.error);
        }

    } catch (error: any) {
        const errorMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'model',
            content: [{ text: `Sorry, I encountered an error: ${error.message}` }],
        };
        setMessages(prev => [...prev, errorMessage]);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <PageHeader
        title="AI Chat Agent"
        description="Ask questions about project or user data within your perview, or upload files for analysis."
        showBackButton={false}
      />
      <Card className="mt-4 flex-1 flex flex-col">
        <CardContent className="flex-1 flex flex-col p-0">
          <ScrollArea className="flex-1 p-4" ref={scrollAreaRef as any}>
            <div className="space-y-6">
              {messages.map((message) => (
                <div key={message.id} className={`flex items-start gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
                  {message.role === 'model' && (
                    <Avatar className="h-8 w-8 border">
                      <AvatarFallback><Bot className="h-5 w-5"/></AvatarFallback>
                    </Avatar>
                  )}
                  <div className={`rounded-lg p-3 max-w-xl ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <div className="flex flex-col gap-2">
                        {message.content.map((part, index) => (
                            part.media ? (
                                <Image key={index} src={part.media.url} alt="Uploaded content" width={200} height={200} className="rounded-md" />
                            ) : (
                                <p key={index} className="text-sm whitespace-pre-wrap">{part.text}</p>
                            )
                        ))}
                    </div>
                  </div>
                   {message.role === 'user' && sessionUser && (
                    <Avatar className="h-8 w-8 border">
                       <AvatarImage src={sessionUser.photoURL || undefined} alt={sessionUser.name} />
                       <AvatarFallback>{sessionUser.name?.[0].toUpperCase()}</AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
              {isLoading && (
                 <div className="flex items-start gap-3">
                    <Avatar className="h-8 w-8 border">
                      <AvatarFallback><Bot className="h-5 w-5"/></AvatarFallback>
                    </Avatar>
                    <div className="rounded-lg p-3 max-w-xl bg-muted flex items-center">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground"/>
                    </div>
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="p-4 border-t">
            <form onSubmit={handleSendMessage} className="flex flex-col gap-2">
                {filePreview && (
                    <div className="relative w-24 h-24 border rounded-md p-1">
                        <Image src={filePreview} alt="File preview" layout="fill" objectFit="cover" className="rounded-md" />
                        <Button type="button" variant="ghost" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-muted" onClick={removeFile}>
                            <XCircle className="h-5 w-5" />
                        </Button>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,application/pdf,.xlsx,.csv,.doc,.docx" />
                    <Button type="button" variant="outline" size="icon" onClick={() => fileInputRef.current?.click()}>
                        <Paperclip className="h-4 w-4"/>
                        <span className="sr-only">Attach file</span>
                    </Button>
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about projects or describe the uploaded file..."
                        disabled={isLoading}
                    />
                    <Button type="submit" disabled={isLoading || (!input.trim() && !file)}>
                        <Send className="h-4 w-4" />
                        <span className="sr-only">Send</span>
                    </Button>
                </div>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
