
import { NextResponse, type NextRequest } from 'next/server';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/config';
import { sendEmail } from '@/lib/email';
import type { FundingCall } from '@/types';
import { addDays, format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

export async function GET(request: NextRequest) {
  // Secure the endpoint for production
  if (
    process.env.NODE_ENV === 'production' &&
    request.headers.get('X-Appengine-Cron') !== 'true'
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const timeZone = 'Asia/Kolkata';
    const tomorrow = addDays(new Date(), 1);
    const tomorrowDateString = format(tomorrow, 'yyyy-MM-dd');

    const callsRef = collection(db, 'fundingCalls');
    const q = query(
      callsRef,
      where('interestDeadline', '>=', `${tomorrowDateString}T00:00:00`),
      where('interestDeadline', '<=', `${tomorrowDateString}T23:59:59`)
    );

    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      console.log('EMR Interest Reminder Cron: No interest registration deadlines for tomorrow.');
      return NextResponse.json({ success: true, message: 'No reminders to send.' });
    }
    
    const staffEmail = process.env.ALL_STAFF_EMAIL_VADODARA;
    if (!staffEmail) {
        console.error('EMR Interest Reminder Cron: ALL_STAFF_EMAIL_VADODARA environment variable is not set.');
        return new NextResponse('Server configuration error.', { status: 500 });
    }

    const reminderPromises = querySnapshot.docs.map(doc => {
      const call = { id: doc.id, ...doc.data() } as FundingCall;
      const deadline = new Date(call.interestDeadline);

      const emailHtml = `
            <div style="background-color:#121212; color:#ffffff; font-family:Arial, sans-serif; padding:20px; border-radius:8px;">
              <h2 style="color:#ffffff;">Final Reminder: EMR Funding Opportunity</h2>
              <p style="color:#cccccc;">
                This is a final reminder that the deadline to register your interest for the funding call, "<strong style="color:#ffffff;">${call.title}</strong>," is tomorrow.
              </p>
              <p><strong style="color:#ffffff;">Interest Registration Deadline: ${formatInTimeZone(deadline, timeZone, 'PPpp (z)')}</strong></p>
              <p style="color:#cccccc;">If you are interested in this opportunity, please make sure to register on the PU R&D Portal before the deadline.</p>
              <p style="text-align:center; margin-top:25px;">
                  <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/emr-calendar" style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                      Register Now
                  </a>
              </p>
              <p style="margin-top:30px; color:#aaaaaa;">Thank you,</p>
              <p style="color:#aaaaaa;">Research & Development Cell Team</p>
            </div>
        `;

        return sendEmail({
          to: staffEmail,
          subject: `Final Reminder: EMR Interest Registration for "${call.title}"`,
          html: emailHtml,
          from: 'default'
        });
    });

    await Promise.all(reminderPromises);

    console.log(`EMR Interest Reminder Cron: Sent ${reminderPromises.length} last-chance reminders.`);
    return NextResponse.json({ success: true, message: `Sent ${reminderPromises.length} reminders.` });
  } catch (error: any) {
    console.error('Error in EMR interest reminder cron job:', error);
    return new NextResponse(`Cron job failed: ${error.message}`, { status: 500 });
  }
}
