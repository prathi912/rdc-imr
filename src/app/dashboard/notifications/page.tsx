import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function NotificationsPage() {
  const notifications = [
    { id: 1, title: "Project 'AI in Agriculture' Approved", time: "2 hours ago", read: false },
    { id: 2, title: "New Review Assigned: 'Quantum Materials'", time: "1 day ago", read: false },
    { id: 3, title: "Submission deadline approaching for Q3 grants", time: "3 days ago", read: true },
    { id: 4, title: "Your project 'Urban Mobility' has been completed", time: "1 week ago", read: true },
  ];

  return (
    <div className="container mx-auto max-w-4xl py-10">
      <Link href="/dashboard">
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Here are your recent updates.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`flex items-start gap-4 rounded-lg border p-4 ${
                  !notification.read ? "bg-accent/50" : ""
                }`}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bell className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{notification.title}</p>
                  <p className="text-sm text-muted-foreground">{notification.time}</p>
                </div>
                {!notification.read && <div className="h-2.5 w-2.5 rounded-full bg-primary mt-1.5"></div>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
