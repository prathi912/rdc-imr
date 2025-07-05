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
                <div style="background-color:#121212; color:#ffffff; font-family:Arial, sans-serif; padding:20px; border-radius:8px;">
                  <div style="text-align:center; margin-bottom:20px;">
                    <img src="https://rdc-full.vercel.app/assets/RDC-PU-LOGO-WHITE.svg" alt="RDC-PU Logo" style="max-width:300px; height:auto;" />
                  </div>

                  <p style="color:#ffffff;">Dear ${project.pi},</p>

                  <p style="color:#cccccc;">
                    This is a reminder for your <strong style="color:#ffffff;">IMR evaluation meeting</strong> scheduled for tomorrow.
                  </p>

                  <p><strong style="color:#ffffff;">Project:</strong> ${project.title}</p>
                  <p><strong style="color:#ffffff;">Date:</strong> ${format(new Date(project.meetingDetails.date), 'PPP')}</p>
                  <p><strong style="color:#ffffff;">Time:</strong> ${project.meetingDetails.time}</p>
                  <p><strong style="color:#ffffff;">Venue:</strong> ${project.meetingDetails.venue}</p>

                  <p style="color:#cccccc;">Please be prepared for your presentation. <span style="color:#00e676;">Good luck!</span></p>

                  <p style="margin-top:30px; color:#aaaaaa;">Thank you,</p>
                  <p style="color:#aaaaaa;">Research & Development Cell Team</p>
                  <p style="color:#aaaaaa;">Parul University</p>
                </div>
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
