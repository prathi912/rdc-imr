import { NextResponse, type NextRequest } from 'next/server';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/config';
import { sendEmail } from '@/lib/email';
import type { Project } from '@/types';
import { format, addDays, startOfDay, endOfDay } from 'date-fns';

export async function GET(request: NextRequest) {
  // Secure the endpoint
  if (
    process.env.NODE_ENV === 'production' &&
    request.headers.get('X-Appengine-Cron') !== 'true'
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const tomorrow = addDays(new Date(), 1);
    const startOfTomorrow = startOfDay(tomorrow).toISOString();
    const endOfTomorrow = endOfDay(tomorrow).toISOString();

    const projectsRef = collection(db, 'projects');
    const q = query(
      projectsRef,
      where('status', '==', 'Under Review'),
      where('meetingDetails.date', '>=', startOfTomorrow),
      where('meetingDetails.date', '<=', endOfTomorrow)
    );

    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      console.log('Cron job ran: No meetings scheduled for tomorrow.');
      return NextResponse.json({ success: true, message: 'No meetings scheduled for tomorrow.' });
    }

    const reminderPromises = querySnapshot.docs.map(doc => {
      const project = { id: doc.id, ...doc.data() } as Project;
      if (project.pi_email && project.meetingDetails) {
        return sendEmail({
          to: project.pi_email,
          subject: `REMINDER: IMR Meeting Tomorrow for Project "${project.title}"`,
          html: `
            <p>Dear ${project.pi},</p>
            <p>This is a reminder for your IMR evaluation meeting scheduled for tomorrow.</p>
            <p><strong>Project:</strong> ${project.title}</p>
            <p><strong>Date:</strong> ${format(new Date(project.meetingDetails.date), 'PPP')}</p>
            <p><strong>Time:</strong> ${project.meetingDetails.time}</p>
            <p><strong>Venue:</strong> ${project.meetingDetails.venue}</p>
            <p>Please be prepared for your presentation. Good luck!</p>
            <p>Thank you,</p>
            <p>RDC Team, Parul University</p>
          `,
        });
      }
      return Promise.resolve();
    });

    await Promise.all(reminderPromises);

    console.log(`Cron job ran: Sent ${reminderPromises.length} reminders.`);
    return NextResponse.json({ success: true, message: `Sent ${reminderPromises.length} reminders.` });
  } catch (error: any) {
    console.error('Error in cron job:', error);
    return new NextResponse(`Cron job failed: ${error.message}`, { status: 500 });
  }
}
