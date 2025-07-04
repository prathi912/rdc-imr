'use server';

import nodemailer from 'nodemailer';

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.warn(
    'Email features are disabled. Please provide GMAIL_USER and GMAIL_APP_PASSWORD in your .env file.'
  );
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
});

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailOptions) {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error(`Email not sent to ${to}: Email service is not configured.`);
    return { success: false, error: 'Email service not configured on the server.' };
  }

  const mailOptions = {
    from: `"Research & Development Cell - PU" <${GMAIL_USER}>`,
    to: to,
    subject: subject,
    html: html,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${to}`);
    return { success: true };
  } catch (error: any) {
    console.error(`Failed to send email to ${to}:`, error);
    return { success: false, error: error.message };
  }
}
