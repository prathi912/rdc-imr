
'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from './ui/button';
import { HelpCircle } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';

// The content of SOP.md is manually copied here to avoid file-system access on the client.
// This is a simple and effective approach for relatively static content.
const sopContent = `
# Standard Operating Procedures (SOP) - R&D Portal

This document outlines the standard operating procedures for various administrative and faculty roles within the Parul University Research & Development Portal.

## Table of Contents
1.  [Faculty (Standard User)](#1-faculty-standard-user)
2.  [Evaluator](#2-evaluator)
3.  [Chief Research Officer (CRO)](#3-chief-research-officer-cro)
4.  [Principal](#4-principal)
5.  [Head of Department (HOD)](#5-head-of-department-hod)
6.  [Admin & Super-admin](#6-admin--super-admin)

---

## 1. Faculty (Standard User)
This is the base role for all teaching and research staff.

**Key Responsibilities:**
-   Submitting Intramural research project proposals (IMR).
-   Registering interest in Extramural research funding calls (EMR).

### IMR Workflow (Intramural Research)

1.  **Profile Setup (First-time Login):**
    -   On your first login, you will be prompted to complete your profile. This is a critical step.
    -   Navigate to **Settings** from the sidebar at any time to update your information.
    -   **Crucially, you must complete your salary bank account details**. This information is required for any grant disbursal if your project is approved.

2.  **New Project Submission:**
    -   Navigate to **New Submission** from the sidebar.
    -   The submission form is divided into four steps:
        1.  **Project Details:** Enter the title, abstract, and category. You can also align your project with UN Sustainable Development Goals (SDGs).
        2.  **Team Info:** Add Co-PIs by searching for their MIS ID. List any student members involved. Upload a single ZIP file containing the CVs of all team members.
        3.  **File Uploads:** Upload your main Project Proposal (PDF) and, if applicable, your Ethics Approval document (PDF).
        4.  **Timeline & Outcomes:** Detail the project timeline and the expected outcomes or impact.
    -   At any step, you can click **Save as Draft**. Drafts are accessible from the **My Projects** page to be completed later.
    -   On the final step, you must agree to the guidelines before the "Submit Project" button becomes active.

3.  **Project Tracking ("My Projects" Page):**
    -   Go to the **My Projects** page to view a list of all IMR projects you are associated with (either as a Principal Investigator or a Co-PI).
    -   Monitor the status of your projects. The statuses mean:
        -   \`Draft\`: You have saved the project but not yet submitted it. You can still edit it.
        -   \`Submitted\`: Your project has been submitted and is awaiting review scheduling.
        -   \`Under Review\`: An evaluation meeting has been scheduled. You will be notified of the date, time, and venue.
        -   \`Revision Needed\`: The evaluation committee has requested changes. Open the project details page to view comments and upload a revised proposal.
        -   \`Recommended\`: Your project has been approved for funding.
        -   \`Not Recommended\`: Your project was not approved for funding.
        -   \`In Progress\`: The project grant has been awarded and the project is active.
        -   \`Pending Completion Approval\`: You have submitted your final report, and it is awaiting admin approval.
        -   \`Completed\`: The project has been officially marked as completed.

### EMR Workflow (Extramural Research)

1.  **Browse Opportunities:**
    -   Navigate to the **EMR Calendar**. This page lists all available external funding opportunities.
    -   Review the details of each call, including deadlines and attached documents.

2.  **Register Interest:**
    -   For any "Open" call, click **Register Interest** before the deadline.
    -   You can add Co-PIs to your application at this stage.
    -   Once registered, your application will appear in the "My EMR Applications" section on the EMR Calendar page.

3.  **Await Meeting Schedule:**
    -   After the interest registration period closes, an administrator will schedule presentation slots for all applicants.
    -   You will be notified via email and in-app notification with your specific date, time, and venue for the presentation.

4.  **Upload Presentation:**
    -   Once a meeting is scheduled, you must upload your presentation (PPT/PPTX).
    -   The deadline for this is automatically set to **2 days prior to your presentation date at 5:00 PM**. This is a hard deadline.
    -   From your EMR application card on the calendar page, click "Upload PPT".

5.  **Manage Uploads:**
    -   Before the deadline, you can view, replace, or remove your uploaded presentation using the "Manage PPT" button on your application card.

---

## 2. Evaluator
This role is assigned to reviewers of IMR or EMR proposals.

### IMR Evaluation Workflow

1.  **Receive Assignment:**
    -   You will receive an email and in-app notification when you are assigned to an IMR evaluation committee for a scheduled meeting.

2.  **Access Evaluation Queue:**
    -   Navigate to the **IMR Evaluation Queue**. This page lists all IMR projects that are scheduled for a meeting you are a part of and are awaiting your review.
    -   **Important:** You can only submit your evaluation on the day of the scheduled meeting.

3.  **Evaluate a Project:**
    -   On the meeting day, click on a project to go to its details page.
    -   Review the proposal and all submitted documents.
    -   An **Evaluation Form** will be visible on the page. Use the AI-assisted prompts to guide your comments.
    -   Select your recommendation (\`Recommended\`, \`Not Recommended\`, or \`Revision Is Needed\`) and submit your detailed comments.

4.  **View Evaluation History:**
    -   The **My IMR Evaluations** page shows a complete record of all IMR projects you have previously reviewed.

### EMR Evaluation Workflow

1.  **Receive Assignment:**
    -   You will be notified when you are assigned to an EMR evaluation committee.

2.  **Access EMR Queue:**
    -   Navigate to **EMR Evaluations**. This page lists all EMR presentation applications assigned to your committee.

3.  **Evaluate a Presentation:**
    -   On the day of the scheduled EMR meeting, access this page.
    -   For each applicant, you can view their uploaded presentation (PPT).
    -   Click the "Evaluate" button to open a form where you can submit your recommendation and comments.

---

## 3. Chief Research Officer (CRO)
A faculty-level administrative role with oversight of all projects within their specific assigned faculty/faculties.

**Key Capabilities:**
-   View all projects and analytics for their assigned faculties.
-   Can be assigned as an Evaluator for both IMR and EMR presentations.

**Workflow:**
1.  **Project Oversight:**
    -   Navigate to **All Projects**. The list will be automatically filtered to show projects from one of your assigned faculties.
    -   If you are assigned to multiple faculties, a dropdown filter will appear at the top of the page, allowing you to switch between them.
    -   Monitor the status and progress of research across your faculties.

2.  **Analytics:**
    -   The **Analytics** dashboard provides a high-level view of research trends.
    -   For CROs, the data is automatically aggregated by **Institute**, showing which institutes within your selected faculty are most active.
    -   Use the faculty dropdown to view analytics for each of your assigned faculties.

3.  **Evaluation Duties:**
    -   When assigned as an evaluator, follow the workflows outlined in the [Evaluator](#2-evaluator) section for both IMR and EMR.

---

## 4. Principal
An institute-level administrative role with oversight of all activities within their specific institute.

**Key Capabilities:**
-   View all projects submitted from their institute.
-   View detailed analytics for their institute.

**Workflow:**
1.  **First-time Login:**
    -   You will be prompted to complete a simplified profile setup, requiring only your **Faculty** and **Institute**. An MIS ID is not required for your role.

2.  **Project Oversight:**
    -   Navigate to **All Projects**. The list is automatically filtered to show every project from your institute, regardless of your personal involvement. This is your primary tool for monitoring research activity.

3.  **Analytics:**
    -   The **Analytics** dashboard is tailored for your role. Project data is aggregated by **Department**, allowing you to see which departments within your institute are leading in research submissions and funding.

---

## 5. Head of Department (HOD)
A department-level administrative role with oversight of all activities within their specific department.

**Key Capabilities:**
-   View all projects submitted from their department.
-   View detailed analytics for their department.

**Workflow:**
1.  **Project Oversight:**
    -   Navigate to **All Projects**. The view is automatically filtered to show all projects from your specific department, giving you a complete overview of your department's research landscape.

2.  **Analytics:**
    -   The **Analytics** dashboard provides data specifically for your department, allowing you to track submission trends and funding success.

---

## 6. Admin & Super-admin
These roles have the highest level of access for managing the entire portal.

### IMR Management

1.  **Full Oversight:**
    -   **All Projects:** View, search, and manage all projects across all faculties and institutes.
    -   **Pending Reviews:** A dedicated page to see all projects currently \`Under Review\` or \`Pending Completion Approval\`.
    -   **Completed Reviews:** A history of all projects that are no longer in an active review state.

2.  **Meeting Scheduling:**
    -   Navigate to **Schedule Meeting**.
    -   Select one or more projects from the "Projects Awaiting Meeting" list.
    -   Set the meeting date and time.
    -   Assign a committee of evaluators from the user list.
    -   Clicking "Schedule" will update the project statuses to \`Under Review\` and automatically notify all selected PIs and evaluators via email and in-app notifications.

3.  **Status Updates:**
    -   From any project's details page, you can manually update its status at any time. This is useful for making final decisions after a review meeting.

### EMR Management (Super-admin)

1.  **Manage Calls:**
    -   Navigate to the **EMR Calendar**.
    -   Click "Add New Call" to create a new funding opportunity. You can add a title, agency, description, deadlines, and attachments.
    -   You have the option to send an email announcement to all staff members when creating a new call.
    -   Existing calls can be edited or deleted.

2.  **Manage Registrations:**
    -   Navigate to **EMR Management**.
    -   Select a call to view all users who have registered interest.
    -   You can delete a registration with remarks, which notifies the user.

3.  **Schedule Meetings:**
    -   From the call management page, click **Schedule Meeting**.
    -   Select the applicants you wish to schedule for a presentation.
    -   Set a date, venue, and assign evaluators to the committee.
    -   This will schedule the meeting and notify all relevant parties.

4.  **Review Evaluations:**
    -   From the **EMR Evaluations** page, you can view all feedback and recommendations submitted by the committee for each applicant and make a final decision on their status.

### System Administration

1.  **User Management:**
    -   Navigate to **Manage Users**.
    -   View all registered users, search, and filter by role.
    -   Assign roles (Faculty, Evaluator, CRO, Admin, Super-admin) to users.
    -   For CROs, you can assign them to one or more specific faculties.

2.  **Bulk Data Management:**
    -   Use the **Bulk Upload** feature to import historical project data from a formatted Excel file. This is useful for integrating past records into the system.

3.  **System Health:**
    -   The **System Health** dashboard allows you to monitor the connectivity and status of all integrated Firebase services (Firestore, Auth, Storage) in real-time.

4.  **Module Management (Super-admin only):**
    -   The Super-admin has exclusive access to the **Module Management** page.
    -   This powerful feature allows you to dynamically grant or revoke access to any part of the portal (e.g., "Manage Users", "Analytics") for any user, providing fine-grained permission control beyond the default roles.
`;

export function SopDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Help and SOP">
          <HelpCircle className="h-[1.2rem] w-[1.2rem]" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Standard Operating Procedures (SOP)</DialogTitle>
          <DialogDescription>
            This document outlines the standard procedures for various roles within the portal.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[70vh] rounded-md border p-4">
            <div 
                className="prose prose-sm dark:prose-invert max-w-none" 
                dangerouslySetInnerHTML={{ __html: sopContent.replace(/`/g, '') }} // Basic markdown simulation
            />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
