'use server';

import { adminDb } from "@/lib/admin"
import { User, Project } from "@/types"
import { sendEmail as sendEmailUtility } from "@/lib/email"
import { format, addHours, parseISO, isToday } from "date-fns"
import { formatInTimeZone, toDate } from "date-fns-tz"
import { logEvent } from "@/lib/logger"
import { logActivity, EMAIL_STYLES } from "./utils"

export async function scheduleMeeting(
  projectsToSchedule: { id: string; pi_uid: string; pi: string; title: string; pi_email?: string }[],
  meetingDetails: { date: string; time: string; venue: string; evaluatorUids: string[]; mode: 'Online' | 'Offline' },
  isMidTermReview: boolean = false,
) {
  try {
    const batch = adminDb.batch();
    const emailPromises: Promise<any>[] = [];
    const timeZone = "Asia/Kolkata"
    const meetingDateTimeString = `${meetingDetails.date}T${meetingDetails.time}:00`

    const meetingDate = toDate(meetingDateTimeString, { timeZone });
    const dtstamp = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");

    const newMeetingDetails = {
      date: meetingDetails.date,
      time: meetingDetails.time,
      venue: meetingDetails.venue,
      mode: meetingDetails.mode,
      assignedEvaluators: meetingDetails.evaluatorUids,
    };

    const allUsersToNotify = new Map<string, User>();
    const rescheduleMap = new Map<string, boolean>();

    for (const projectData of projectsToSchedule) {
      const projectRef = adminDb.collection("projects").doc(projectData.id)
      const projectSnap = await projectRef.get();
      const existingProject = projectSnap.exists ? projectSnap.data() as Project : null;
      const isReschedule = !!existingProject?.meetingDetails;
      rescheduleMap.set(projectData.id, isReschedule);

      const updateData: any = { meetingDetails: newMeetingDetails };
      updateData.wasAbsent = false;
      if (isMidTermReview) {
        updateData.hasHadMidTermReview = true;
      } else {
        updateData.status = "Under Review";
      }

      batch.update(projectRef, updateData);

      if (projectData.pi_uid) {
        const piSnap = await adminDb.collection("users").doc(projectData.pi_uid).get();
        if (piSnap.exists) allUsersToNotify.set(projectData.pi_uid, piSnap.data() as User);
      }

      if (isReschedule && existingProject?.meetingDetails?.assignedEvaluators) {
        for (const uid of existingProject.meetingDetails.assignedEvaluators) {
          if (!allUsersToNotify.has(uid) && uid) {
            const userSnap = await adminDb.collection("users").doc(uid).get();
            if (userSnap.exists) allUsersToNotify.set(uid, userSnap.data() as User);
          }
        }
      }
      for (const uid of meetingDetails.evaluatorUids) {
        if (!allUsersToNotify.has(uid) && uid) {
          const userSnap = await adminDb.collection("users").doc(uid).get();
          if (userSnap.exists) allUsersToNotify.set(uid, userSnap.data() as User);
        }
      }
    }

    await batch.commit();

    for (const [uid, user] of allUsersToNotify.entries()) {
      const isPI = projectsToSchedule.some(p => p.pi_uid === uid);
      const project = projectsToSchedule.find(p => p.pi_uid === uid) || projectsToSchedule[0];
      const isReschedule = rescheduleMap.get(project.id) || false;

      const meetingType = isMidTermReview ? "IMR Mid-term Review Meeting" : "IMR Evaluation Meeting";
      const subjectPrefix = isReschedule ? `RESCHEDULED: ${meetingType}` : meetingType;

      const formattedDate = formatInTimeZone(meetingDateTimeString, timeZone, "MMMM d, yyyy");
      const formattedTime = formatInTimeZone(meetingDateTimeString, timeZone, "h:mm a (z)");

      const projectTitles = projectsToSchedule.map(p => `<li style="color: #cccccc;">${p.title}</li>`).join("");

      let subject = '';
      let htmlContent = '';

      if (isPI) {
        subject = `${subjectPrefix} for Your Project: ${project.title}`;
        htmlContent = `
                <div ${EMAIL_STYLES.background}>
                  ${EMAIL_STYLES.logo}
                  <p style="color: #ffffff;">Dear Researcher,</p>
                  <p style="color: #e0e0e0;">
                    An <strong style="color: #ffffff;">${meetingType}</strong> has been ${isReschedule ? 'rescheduled' : 'scheduled'} for your project, 
                    "<strong style="color: #ffffff;">${project.title}</strong>".
                    Please ensure you carry a <strong style="color: #ffffff;">pendrive containing your presentation (PPT)</strong> for the session.
                  </p>
                   ${isReschedule ? `<p style="color: #ffcdd2;">Please note the updated time/date.</p>` : ''}
                  <p><strong style="color: #ffffff;">Date:</strong> ${formattedDate}</p>
                  <p><strong style="color: #ffffff;">Time:</strong> ${formattedTime}</p>
                  <p><strong style="color: #ffffff;">${meetingDetails.mode === 'Online' ? 'Meeting Link:' : 'Venue:'}</strong> 
                    ${meetingDetails.mode === 'Online' ? `<a href="${meetingDetails.venue}" style="color: #64b5f6; text-decoration: underline;">${meetingDetails.venue}</a>` : meetingDetails.venue}
                  </p>
                  <p style="color: #cccccc; margin-top: 15px;">
                    You can view more details on the 
                    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/project/${project.id}" style="color: #64b5f6; text-decoration: underline;">
                      PU Research Projects Portal
                    </a>.
                  </p>
                  ${EMAIL_STYLES.footer}
                </div>
              `;
      } else {
        subject = `IMR Evaluation Assignment (${isMidTermReview ? 'Mid-term' : 'New Submission'}) ${isReschedule ? '- RESCHEDULED' : ''}`;
        htmlContent = `
                  <div ${EMAIL_STYLES.background}>
                      ${EMAIL_STYLES.logo}
                      <p style="color: #ffffff;">Dear ${user.name},</p>
                      <p style="color: #e0e0e0;">
                          You have been assigned to an <strong style="color:#ffffff;">${meetingType}</strong> committee. ${isReschedule ? 'Please note the schedule has been updated.' : 'You are requested to be present.'}
                      </p>
                      <p><strong style="color: #ffffff;">Date:</strong> ${formattedDate}</p>
                      <p><strong style="color: #ffffff;">Time:</strong> ${formattedTime}</p>
                      <p><strong style="color: #ffffff;">
                        ${meetingDetails.mode === 'Online' ? 'Meeting Link:' : 'Venue:'}
                      </strong> 
                        ${meetingDetails.mode === 'Online' ? `<a href="${meetingDetails.venue}" style="color: #64b5f6; text-decoration: underline;">${meetingDetails.venue}</a>` : meetingDetails.venue}
                      </p>
                      <p style="color: #e0e0e0;">The following projects are scheduled for your review:</p>
                      <ul style="list-style-type: none; padding-left: 0;">
                          ${projectTitles}
                      </ul>
                      <p style="color: #cccccc; margin-top: 15px;">
                          You can access your evaluation queue on the
                          <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/evaluator-dashboard" style="color: #64b5f6; text-decoration: underline;">
                           PU Research Projects Portal
                          </a>.
                      </p>
                      ${EMAIL_STYLES.footer}
                  </div>
              `;
      }

      if (user.email) {
        const startTimeUTC = format(meetingDate, "yyyyMMdd'T'HHmmss'Z'");
        const endTimeUTC = format(addHours(meetingDate, 1), "yyyyMMdd'T'HHmmss'Z'");

        const icalContent = [
          'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ParulUniversity//RDC-Portal//EN',
          'METHOD:REQUEST', 'BEGIN:VEVENT', `UID:${project.id}@paruluniversity.ac.in`, `DTSTAMP:${dtstamp}`,
          `DTSTART:${startTimeUTC}`, `DTEND:${endTimeUTC}`, `SUMMARY:${subject}`,
          `DESCRIPTION:A meeting for the IMR project '${project.title}' has been scheduled.`,
          `LOCATION:${meetingDetails.venue}`, `ORGANIZER;CN=RDC Parul University:mailto:${process.env.GMAIL_USER}`,
          `ATTENDEE;CN=${user.name};RSVP=TRUE:mailto:${user.email}`, 'END:VEVENT', 'END:VCALENDAR'
        ].join('\r\n');

        emailPromises.push(sendEmailUtility({
          to: user.email,
          subject,
          html: htmlContent,
          from: "default",
          category: 'IMR',
          icalEvent: {
            filename: 'invite.ics',
            method: 'REQUEST',
            content: icalContent
          }
        }));
      }
    }

    const unregisteredPis = projectsToSchedule.filter(p => !p.pi_uid && p.pi_email);
    for (const projectData of unregisteredPis) {
        const isReschedule = rescheduleMap.get(projectData.id) || false;
        const meetingType = isMidTermReview ? "IMR Mid-term Review Meeting" : "IMR Evaluation Meeting";
        const subjectPrefix = isReschedule ? `RESCHEDULED: ${meetingType}` : meetingType;
        const subject = `${subjectPrefix} for Your Project: ${projectData.title}`;

        const formattedDate = formatInTimeZone(meetingDateTimeString, timeZone, "MMMM d, yyyy");
        const formattedTime = formatInTimeZone(meetingDateTimeString, timeZone, "h:mm a (z)");

        const htmlContent = `
                <div ${EMAIL_STYLES.background}>
                ${EMAIL_STYLES.logo}
                <p style="color: #ffffff;">Dear ${projectData.pi},</p>
                <p style="color: #e0e0e0;">
                    An <strong style="color: #ffffff;">${meetingType}</strong> has been ${isReschedule ? 'rescheduled' : 'scheduled'} for your project, 
                    "<strong style="color: #ffffff;">${projectData.title}</strong>".
                </p>
                ${isReschedule ? `<p style="color: #ffcdd2;">Please note the updated time/date.</p>` : ''}
                <p><strong style="color: #ffffff;">Date:</strong> ${formattedDate}</p>
                <p><strong style="color: #ffffff;">Time:</strong> ${formattedTime}</p>
                <p><strong style="color: #ffffff;">${meetingDetails.mode === 'Online' ? 'Meeting Link:' : 'Venue:'}</strong> 
                    ${meetingDetails.mode === 'Online' ? `<a href="${meetingDetails.venue}" style="color: #64b5f6; text-decoration: underline;">${meetingDetails.venue}</a>` : meetingDetails.venue}
                </p>
                    ${EMAIL_STYLES.footer}
                </div>
            `;

        emailPromises.push(sendEmailUtility({
            to: projectData.pi_email!,
            subject,
            html: htmlContent,
            from: "default",
            category: 'IMR'
        }));
    }

    await Promise.all(emailPromises)
    await logActivity("INFO", "Review meeting scheduled", { projectIds: projectsToSchedule.map((p) => p.id), meetingDate: meetingDetails.date })
    await logEvent('WORKFLOW', 'Review meeting scheduled', {
      metadata: { projectIds: projectsToSchedule.map((p) => p.id), meetingDate: meetingDetails.date, venue: meetingDetails.venue },
      user: { uid: '', email: '', role: 'admin' },
      status: 'success'
    });
    return { success: true };
  } catch (error: any) {
    console.error("Error scheduling meeting:", error)
    await logActivity("ERROR", "Failed to schedule IMR meeting", { error: error.message })
    return { success: false, error: error.message || "Failed to schedule meeting." }
  }
}
