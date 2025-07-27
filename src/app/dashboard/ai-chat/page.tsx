
'use client';

import { useState, useEffect, useRef } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Bot, User as UserIcon, Loader2, Paperclip } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { User } from '@/types';
import { runChatAgent } from '@/app/actions';

type Message = {
  id: string;
  role: 'user' | 'model';
  content: { text: string }[];
};

export default function AiChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setSessionUser(JSON.parse(storedUser));
    }
    setMessages([
      {
        id: 'welcome-message',
        role: 'model',
        content: [{ text: "Hello! I am your AI Research Assistant. How can I help you today? You can ask me about project data." }],
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !sessionUser) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: [{ text: input }],
    };
    
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
        const historyForAgent = newMessages
          .filter(m => m.content && Array.isArray(m.content) && m.content.every(c => typeof c.text === 'string'))
          .map(m => ({
            role: m.role,
            content: m.content,
        }));

        const result = await runChatAgent({
            history: historyForAgent,
            user: {
                uid: sessionUser.uid,
                role: sessionUser.role,
                designation: sessionUser.designation,
                institute: sessionUser.institute,
                department: sessionUser.department || undefined,
                faculties: sessionUser.faculties || [],
            }
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
        description="Ask questions about project data within your perview. Support for file uploads is coming soon."
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
                    <p className="text-sm whitespace-pre-wrap">{message.content.map(c => c.text).join('')}</p>
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
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon">
                  <Paperclip className="h-4 w-4"/>
                  <span className="sr-only">Attach file</span>
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about projects..."
                disabled={isLoading}
              />
              <Button type="submit" disabled={isLoading || !input.trim()}>
                <Send className="h-4 w-4" />
                <span className="sr-only">Send</span>
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
