
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { FundingCall } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Tag, Building, ArrowRight, FileText } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { format, isPast } from 'date-fns';

interface EmrCalendarProps {
  calls: FundingCall[];
  loading: boolean;
}

export function EmrCalendar({ calls, loading }: EmrCalendarProps) {
  const upcomingCalls = calls.filter(call => !isPast(new Date(call.deadline)));
  const pastCalls = calls.filter(call => isPast(new Date(call.deadline)));

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-2xl font-bold tracking-tight mb-4">Upcoming Calls</h3>
        {upcomingCalls.length > 0 ? (
          <div className="space-y-4">
            {upcomingCalls.map(call => (
              <Card key={call.id}>
                <CardContent className="p-4 flex flex-col md:flex-row justify-between items-start gap-4">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{call.title}</CardTitle>
                    <div className="text-sm text-muted-foreground mt-2 space-y-1">
                      <p className="flex items-center gap-2"><Building className="h-4 w-4" /> {call.fundingAgency}</p>
                      <p className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Deadline: {format(new Date(call.deadline), 'PPP')}</p>
                      <p className="flex items-center gap-2"><Tag className="h-4 w-4" /> <Badge variant="secondary">{call.callType}</Badge></p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 md:mt-0">
                    {call.detailsUrl && (
                      <a href={call.detailsUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm"><FileText className="mr-2 h-4 w-4" /> View Details</Button>
                      </a>
                    )}
                    <Link href={`/dashboard/emr-projects/new?callId=${call.id}`}>
                      <Button size="sm">Apply Now <ArrowRight className="ml-2 h-4 w-4" /></Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No upcoming funding calls at the moment.
            </CardContent>
          </Card>
        )}
      </div>

       <div>
        <h3 className="text-2xl font-bold tracking-tight mb-4">Past Calls</h3>
        {pastCalls.length > 0 ? (
          <div className="space-y-4">
            {pastCalls.map(call => (
              <Card key={call.id} className="opacity-70">
                <CardContent className="p-4 flex flex-col md:flex-row justify-between items-start gap-4">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{call.title}</CardTitle>
                    <div className="text-sm text-muted-foreground mt-2 space-y-1">
                      <p className="flex items-center gap-2"><Building className="h-4 w-4" /> {call.fundingAgency}</p>
                      <p className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Deadline: {format(new Date(call.deadline), 'PPP')}</p>
                    </div>
                  </div>
                   {call.detailsUrl && (
                      <a href={call.detailsUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm"><FileText className="mr-2 h-4 w-4" /> View Details</Button>
                      </a>
                    )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No past funding calls found.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
