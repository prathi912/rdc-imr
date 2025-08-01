
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent } from "@/components/ui/card";
import { Bell, FileCheck2, GanttChartSquare, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { db } from '@/lib/config';
import { collection, query, where, getDocs, doc, updateDoc, orderBy, onSnapshot } from 'firebase/firestore';
import { type Notification as NotificationType, type User } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser) as User;
      setUser(parsedUser);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    const q = query(
      collection(db, 'notifications'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedNotifications = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as NotificationType));
      setNotifications(fetchedNotifications);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching notifications:", error);
      toast({ variant: 'destructive', title: "Error", description: "Could not fetch notifications." });
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, toast]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
        const notifRef = doc(db, 'notifications', notificationId);
        await updateDoc(notifRef, { isRead: true });
        setNotifications(notifications.map(n => n.id === notificationId ? { ...n, isRead: true } : n));
    } catch (error) {
        console.error("Error marking notification as read:", error);
        toast({ variant: 'destructive', title: "Error", description: "Could not update notification." });
    }
  };

  const getIcon = (title: string) => {
    if (title.includes('Recommended') || title.includes('Completed')) return FileCheck2;
    if (title.includes('Review') || title.includes('Not Recommended')) return GanttChartSquare;
    return Bell;
  }

  return (
    <div className="container mx-auto max-w-4xl py-10">
      <PageHeader title="Notifications" description="Here are your recent updates." />
      <div className="mt-8">
        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex justify-center items-center h-40">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
               <div className="text-center py-12 text-muted-foreground">
                  <Bell className="mx-auto h-12 w-12" />
                  <p className="mt-4">You have no new notifications.</p>
                </div>
            ) : (
               <div className="space-y-4">
                {notifications.map((notification) => {
                  const Icon = getIcon(notification.title);
                  return (
                    <div
                      key={notification.id}
                      className={`flex items-start gap-4 rounded-lg border p-4 ${
                        !notification.isRead ? "bg-accent/50" : ""
                      }`}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary mt-1 flex-shrink-0">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                           <div className="flex-1">
                             <Link href={`/dashboard/project/${notification.projectId}`} className="hover:underline">
                                 <p className="font-semibold break-words">{notification.title}</p>
                             </Link>
                             <p className="text-sm text-muted-foreground mt-1">
                                 {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                             </p>
                           </div>
                           {!notification.isRead && (
                             <Button variant="ghost" size="sm" onClick={() => handleMarkAsRead(notification.id)} className="self-start sm:self-center flex-shrink-0">
                                 Mark as read
                             </Button>
                           )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
