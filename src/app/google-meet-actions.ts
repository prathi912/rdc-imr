
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
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

export async function generateGoogleMeetLink({
  summary,
  description,
  startDateTime,
  endDateTime,
}: GenerateMeetLinkArgs): Promise<{ link: string | null; error?: string }> {

  if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    const errorMsg = "Google Calendar API credentials are not set in environment variables.";
    console.error(errorMsg);
    return { link: null, error: errorMsg };
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
        return { link: hangoutLink };
    }
    
    return { link: null, error: 'Hangout link was not created by the API.' };
    
  } catch (error: any) {
    console.error('Error creating Google Meet link:', error);
    // Return the specific error message from the API
    return { link: null, error: error.message || 'An unknown error occurred during Google Meet link generation.' };
  }
}
