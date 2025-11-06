
'use server';

import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

interface GenerateMeetLinkArgs {
  summary: string;
  description: string;
  startDateTime: string;
  endDateTime: string;
}

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
// Replace escaped newlines from environment variables with actual newlines
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

export async function generateGoogleMeetLink({
  summary,
  description,
  startDateTime,
  endDateTime,
}: GenerateMeetLinkArgs): Promise<string | null> {

  if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    console.error("Google Calendar API credentials are not set in environment variables.");
    return null;
  }

  try {
    const auth = new JWT({
      email: GOOGLE_CLIENT_EMAIL,
      key: GOOGLE_PRIVATE_KEY,
      scopes: SCOPES,
    });

    const calendar = google.calendar({ version: 'v3', auth });

    const event = {
      summary: summary,
      description: description,
      start: {
        dateTime: startDateTime,
        timeZone: 'Asia/Kolkata',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'Asia/Kolkata',
      },
      conferenceData: {
        createRequest: {
          requestId: `rdc-${Date.now()}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet',
          },
        },
      },
    };

    const createdEvent = await calendar.events.insert({
      calendarId: 'primary',
      // @ts-ignore
      resource: event,
      conferenceDataVersion: 1,
    });
    
    const hangoutLink = createdEvent.data.hangoutLink;
    if (hangoutLink) {
        return hangoutLink;
    }
    
    return null;
    
  } catch (error) {
    console.error('Error creating Google Meet link:', error);
    return null;
  }
}
