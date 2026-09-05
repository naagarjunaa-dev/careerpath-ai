# CareerPath AI

A secure, full-stack AI Career Planner and Learning Coach powered by Google Gemini, React, and Firebase. This application features robust model fallback ladders, strict Zero-Trust Firestore Security Rules, and dynamic Secret Management.

## Architecture

*   **Frontend**: React (Vite) + Tailwind CSS + Firebase Auth
*   **Backend**: Node.js/Express + Google Cloud Secret Manager + `@google/genai`
*   **Database**: Cloud Firestore (NoSQL) with Strict ABAC Rules
*   **AI Integration**: Gemini API (gemini-2.5-flash -> gemini-2.0-flash -> gemini-1.5-flash fallback ladder)

## Environment & Prerequisites

1.  **Google Cloud Platform**: Ensure you have an active GCP project.
2.  **Required APIs**: Enable the following APIs in your GCP Project:
    *   Cloud Run API (`run.googleapis.com`)
    *   Secret Manager API (`secretmanager.googleapis.com`)
    *   Cloud Firestore API (`firestore.googleapis.com`)
3.  **Firebase Setup**: Ensure Firebase is initialized on your GCP project with Authentication (Google Sign-in enabled) and Firestore Database created.
4.  **CLI Tools**: Install the `gcloud` CLI.

## Secret Management Setup

The backend relies on Google Cloud Secret Manager to securely load the Gemini API Key. Hardcoding is strictly prohibited.

```bash
# 1. Create the secret in Secret Manager
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"

# 2. Add the secret value
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# 3. Grant the default Cloud Run service account access to read the secret
# Replace YOUR_PROJECT_NUMBER with your actual Google Cloud Project Number
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Database Security Configuration

This application enforces owner-bound user isolation with zero undefined properties to prevent payload pollution and NoSQLi.

Navigate to the Firebase Console -> Firestore -> Rules, and deploy the following:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Global Default Deny
    match /{document=**} {
      allow read, write: if false;
    }

    // Helpers
    function isSignedIn() { return request.auth != null; }
    function isOwner(userId) { return request.auth.uid == userId; }
    function isValidId(id) { return id is string && id.size() > 0 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$'); }
    
    function incoming() { return request.resource.data; }

    function isValidInteraction(data) {
      return data.keys().hasAll(['prompt', 'response', 'ownerId', 'createdAt']) &&
             data.keys().size() == 4 &&
             data.prompt is string && data.prompt.size() <= 5000 &&
             data.response is string && data.response.size() <= 30000 &&
             data.ownerId is string && data.ownerId == request.auth.uid &&
             data.createdAt == request.time;
    }

    // Interaction Collection
    match /users/{userId}/interactions/{interactionId} {
      allow read: if isSignedIn() && isOwner(userId);
      allow create: if isSignedIn() && isOwner(userId) &&
                       isValidId(userId) && isValidId(interactionId) &&
                       isValidInteraction(incoming());
      allow update, delete: if false;
    }
  }
}
```

## Cloud Run Deployment Flow

You can deploy this application directly to Google Cloud Run using the provided Dockerfile.

```bash
# Set your project ID
export PROJECT_ID="your-project-id"
export SERVICE_NAME="careerpath-ai"
export REGION="us-central1"

# Build and Deploy
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --project $PROJECT_ID \
  --allow-unauthenticated \
  --port 3000
```

## Required Campaign Labeling

To register the service for automated challenge verification, apply the mandatory resource label:

```bash
gcloud run services update $SERVICE_NAME \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=$REGION \
  --project=$PROJECT_ID
```

## Walkthrough Testing Guide

1.  **Auth Gateway Verification**:
    *   Load the application. You should see a "Sign in with Google" screen.
    *   Click Sign in. Verify that the Google popup appears and successfully authenticates you.
2.  **AI Interaction & Fallback Validation**:
    *   Select "Resume Analysis" mode from the left sidebar.
    *   Type a sample prompt: "I know Python but want to learn React. What are my skill gaps?" and hit Enter.
    *   The input should clear, and a loading indicator should appear.
    *   A structured response should return. *If the primary model rate-limits, the backend silently falls back to the next model.*
3.  **Persistence & Schema Rigidity**:
    *   Refresh the page.
    *   Your previous interaction should instantly load from Firestore.
    *   *Security Test*: Attempt to alter the frontend code to send an `undefined` field or extra property in the `setDoc` payload. The Firestore security rules will aggressively block the write and return a Permission Denied error.
4.  **Network Preservation Test**:
    *   Disconnect your internet connection.
    *   Type a prompt and press Send.
    *   An error boundary will catch the failure, and your input will be perfectly preserved in the text box for retry.
