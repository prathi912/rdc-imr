run build
# Research & Development Portal - Parul University

This is a comprehensive, full-stack web application designed to streamline and manage the entire research lifecycle at Parul University. It serves as a central hub for faculty, evaluators, and administrators to handle Intramural Research (IMR) project proposals, incentive claims, and user management.

The portal is built with a modern tech stack, leveraging the power of Next.js for the frontend and backend, Firebase for its powerful suite of backend services, and Google's Genkit for integrating cutting-edge AI features.

## ✨ Key Features

### 1. Role-Based Access Control (RBAC)
The portal provides a tailored experience for each user role, ensuring users only see what's relevant to them.
-   **Faculty:** The primary users of the portal. They can submit and track their own research projects, manage their public profile, and file for various publication incentives.
-   **Evaluators:** Assigned to review project proposals. They have access to a dedicated queue of projects assigned for review, can use AI-assisted tools for scoring, and submit structured feedback.
-   **CRO (Chief Research Officer):** Have oversight of all projects within their specific faculty. They can manage user roles, schedule meetings, and access faculty-specific analytics.
-   **Admin:** Have broad oversight of the entire system, including user management, project and claim status updates, and system monitoring.
-   **Super-admin:** Has complete control over the entire system, including all admin privileges plus the ability to dynamically manage module access for all other users.

### 2. Intramural Research (IMR) Project Management
A complete workflow for managing research project funding from submission to completion.
-   **Guided Proposal Submission:** A multi-step form for submitting detailed project proposals, including team information, abstracts, and necessary file uploads (proposal PDF, team CVs, ethics approvals).
-   **Status Tracking:** Real-time tracking of project status (Draft, Submitted, Under Review, Recommended, Not Recommended, Completed, etc.).
-   **AI-Assisted Evaluation:** AI-generated prompts to help evaluators assess projects based on key criteria like relevance, methodology, feasibility, and innovation.
-   **Meeting Scheduling:** Admins and CROs can schedule IMR evaluation meetings for multiple submitted projects at once and automatically notify the Principal Investigators (PIs) via email.
-   **Grant Management:** A system for awarding grants, tracking fund utilization through transaction logging, and managing the disbursement process.

### 3. Incentive Claim System
A streamlined process for faculty to claim incentives for their research output.
-   **Dedicated Forms:** Easy-to-use, specific forms for various claim types, including Research Papers, Patents, Books, Conference Presentations, Professional Body Memberships, and APC reimbursements.
-   **Automated Data Fetching:** AI-powered tools to fetch publication details automatically from Scopus, Web of Science, and other sources using just a DOI or URL, simplifying the application process.
-   **Admin Review Dashboard:** A central dashboard for administrators to review, approve, or reject claims and notify claimants of status changes automatically.
-   **Excel Export:** Export claim details to a pre-formatted Excel template for streamlined processing and record-keeping by the administrative team.

### 4. AI Integration (Powered by Google Genkit)
-   **Project Summarization:** Instantly generate concise summaries of complex project proposals to aid in quick reviews.
-   **Research Domain Suggestion:** AI analyzes a faculty member's publication history to suggest their core research domain for their public profile.
-   **Journal Website Finder:** An AI tool to find the official website of an academic journal based on its name, helping to verify publication sources.

### 5. User & System Management
-   **User Profiles:** Public-facing profiles for faculty to showcase their research contributions, publications, and projects, enhancing visibility within the university.
-   **Module Management:** A Super-admin exclusive feature to dynamically assign access to different parts of the portal (e.g., "Manage Users", "Analytics") for each user.
-   **System Health Dashboard:** A dedicated page to monitor the connectivity and status of all integrated Firebase services (Firestore, Auth, Storage) in real-time.
-   **Bulk Data Upload:** Admins can upload historical project data from a formatted Excel file to integrate past records into the system.

## 🛠️ Tech Stack

-   **Framework:** [Next.js](https://nextjs.org/) (App Router)
-   **Language:** [TypeScript](https://www.typescriptlang.org/)
-   **Styling:** [Tailwind CSS](https://tailwindcss.com/)
-   **UI Components:** [ShadCN UI](https://ui.shadcn.com/)
-   **AI Toolkit:** [Google Genkit](https://firebase.google.com/docs/genkit)
-   **Database:** [Cloud Firestore](https://firebase.google.com/docs/firestore)
-   **Authentication:** [Firebase Authentication](https://firebase.google.com/docs/auth)
-   **File Storage:** [Cloud Storage for Firebase](https://firebase.google.com/docs/storage)
-   **Deployment:** [Firebase App Hosting](https://firebase.google.com/docs/hosting)
-   **Email Service:** [Nodemailer](https://nodemailer.com/) with Gmail

## 🚀 Getting Started

Follow these instructions to get the project up and running on your local machine for development and testing purposes.

### Prerequisites

-   [Node.js](https://nodejs.org/) (v20 or later)
-   `npm` (comes with Node.js)
-   A [Firebase](https://firebase.google.com/) project.

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd <repository-name>
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

This is the most critical step. The application will not run without the correct environment variables.

1.  Create a new file named `.env.local` in the root of the project.
2.  Copy the contents of the `.env` file into your new `.env.local` file.
3.  Fill in the values for each variable as described below.

#### Firebase Client-Side Keys
-   Go to your **Firebase Console** -> **Project Settings** (gear icon) -> **General**.
-   Under "Your apps", find your web app and copy the `firebaseConfig` object values.

```env
# .env.local
NEXT_PUBLIC_FIREBASE_API="[API_KEY]"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="[AUTH_DOMAIN]"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="[PROJECT_ID]"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="[STORAGE_BUCKET]"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="[MESSAGING_SENDER_ID]"
NEXT_PUBLIC_FIREBASE_APP_ID="[APP_ID]"
```

#### Firebase Admin (Server-Side) Keys
-   Go to your **Firebase Console** -> **Project Settings** -> **Service accounts**.
-   Click **"Generate new private key"**. A JSON file will be downloaded.
-   Open the JSON file and copy the corresponding values.

```env
# .env.local
FIREBASE_CLIENT_EMAIL="[client_email_from_json]"
FIREBASE_PRIVATE_KEY="[private_key_from_json]"
```

#### Email Service (Nodemailer)
-   You'll need a Gmail account and an "App Password".
-   Go to your **Google Account** -> **Security** -> **2-Step Verification** (must be enabled).
-   Go to **App passwords**, create a new password for this app, and copy the 16-character password.

```env
# .env.local
GMAIL_USER="your-gmail-address@gmail.com"
GMAIL_APP_PASSWORD="your-16-character-app-password"
```

#### Optional API Keys
-   These are needed for fetching data from external academic sources. The application will function without them, but some features will be disabled.

```env
# .env.local
SCOPUS_API_KEY=""
WOS_API_KEY=""
SPRINGER_API_KEY=""
```

### 4. Run the Development Server

Once your `.env.local` file is configured, you can start the development server.

```bash
npm run dev
```

The application should now be running at [http://localhost:9002](http://localhost:9002).

## 📁 Project Structure

-   `src/app/`: Next.js App Router pages, layouts, and route handlers.
-   `src/components/`: Reusable React components, organized by feature (e.g., `projects`, `incentives`) and UI primitives (`ui`).
-   `src/lib/`: Core logic, including Firebase configuration (`config.ts`, `admin.ts`), security modules (`modules.ts`), and utility functions.
-   `src/ai/`: Contains all Genkit flows for AI-powered features.
-   `public/`: Static assets like images and logos.
-   `firestore.rules`: Security rules for the Firestore database.
-   `apphosting.yaml`: Configuration for deployment to Firebase App Hosting.
-   `format.xlsx`: Template file for Excel exports.

## ☁️ Deployment

This project is configured for one-click deployment to **Firebase App Hosting**. Simply connect your GitHub repository to your Firebase project, and it will build and deploy automatically. The `apphosting.yaml` file controls the build and runtime settings.
