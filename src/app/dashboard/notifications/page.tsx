import { Card, CardContent } from "@/components/ui/card";
import { Bell, FileCheck2, GanttChartSquare } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export default function NotificationsPage() {
  const notifications = [
    { id: 1, title: "Project 'Advanced Materials for Solar Cells' was Approved", time: "2 days ago", read: false, icon: FileCheck2 },
    { id: 2, title: "New Review Assigned: 'AI in Sustainable Agriculture'", time: "3 days ago", read: false, icon: GanttChartSquare },
    { id: 3, title: "Submission deadline approaching for Q3 grants", time: "1 week ago", read: true, icon: Bell },
    { id: 4, title: "Your project 'Urban Mobility Study' has been completed", time: "2 months ago", read: true, icon: FileCheck2 },
  ];

  return (
    <div className="container mx-auto max-w-4xl py-10">
      <PageHeader title="Notifications" description="Here are your recent updates." />
      <div className="mt-8">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`flex items-start gap-4 rounded-lg border p-4 ${
                    !notification.read ? "bg-accent/50" : ""
                  }`}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <notification.icon className="h-5 w-5" />
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
    </div>
  );
}
