
'use server';

import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

// The arguments from the previous Calendar API implementation are no longer needed,
// but we keep the function signature for compatibility with where it's called.
interface GenerateMeetLinkArgs {
  summary: string;
  description: string;
  startDateTime: string;
  endDateTime: string;
}

// The correct scope for creating a meeting space with the Meet API.
const SCOPES = ['https://www.googleapis.com/auth/meetings.space.created'];
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
// The private key must be formatted correctly to handle newline characters from environment variables.
const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

export async function generateGoogleMeetLink({
  summary,
  description,
  startDateTime,
  endDateTime,
}: GenerateMeetLinkArgs): Promise<{ link: string | null; error?: string }> {
  if (!FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    const errorMsg = "Google Meet API credentials are not set in environment variables.";
    console.error(errorMsg);
    return { link: null, error: errorMsg };
  }

  try {
    const auth = new JWT({
      email: FIREBASE_CLIENT_EMAIL,
      key: FIREBASE_PRIVATE_KEY,
      scopes: SCOPES,
    });

    const meet = google.meet({ version: 'v2', auth });

    const response = await meet.spaces.create({});
    
    const meetingUri = response.data.meetingUri;
    
    if (meetingUri) {
      return { link: meetingUri };
    }
    
    return { link: null, error: 'Meeting URI was not returned by the Google Meet API.' };
    
  } catch (error: any) {
    console.error('Error creating Google Meet link:', error);
    // Return the specific error message from the API for better debugging
    return { link: null, error: error.message || 'An unknown error occurred during Google Meet link generation.' };
  }
}
