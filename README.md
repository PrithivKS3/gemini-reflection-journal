# Gemini Reflection Journal

A secure, user-authenticated AI journaling and multi-turn reflection web application built with Angular 21, Google Gemini 3.6 Flash API, Google Maps Platform, Firebase Authentication, and Google Cloud Firestore. Supports traditional text reflection, seamless speech-to-text audio recording with multimodal Gemini transcription, location-aware memory pinning with Google Maps, and Role-Based Access Control (RBAC) with an Admin Control Portal.

---

## 🛡️ Architecture & Security Model

- **Authentication & RBAC**: Firebase Authentication with Google Sign-In (no direct password handling). Role-Based Access Control differentiates standard users from platform administrators (`prithcbr@gmail.com`).
- **Database Isolation**: Cloud Firestore with owner-bound security rules (`request.auth.uid == userId`) and administrative user directory auditing. Persists clean textual journal data, user insights, pinned locations, and reflection dialogues.
- **Location-Aware Memory Pinning (Google Maps)**: Secure client/server integration with Google Maps Platform API (`gmp_mcp_codeassist_v1_aistudio`). Provides browser GPS geolocation, reverse geocoding, and places lookup to ground memories in physical locations.
- **Multimodal Voice & Audio Transcription**: Client-side recording with browser `MediaRecorder` + Web Audio API streaming to server-side Gemini 3.6 Flash audio analysis, transcribing spoken voice entries directly into the journal text area.
- **AI Processing**: Server-side Google Gemini 3.6 Flash proxy with resilient model fallback ladders (`gemini-3.6-flash` → `gemini-3.8-flash` → `gemini-3.1-flash-lite` → `gemini-flash-latest` → `gemini-3.7-flash` → `gemini-3.1-pro-preview`).
- **Secret Management**: Google Cloud Secret Manager runtime injection for `GEMINI_API_KEY` and `GOOGLE_MAPS_API_KEY`.

---

## 🔒 Firestore Security Rules (RBAC Enforced)

Deploy the following rules in `firestore.rules` to enforce owner isolation while permitting authorized administrators to audit user accounts:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper function to verify caller has administrative privileges
    function isAdmin() {
      return request.auth != null && (
        request.auth.token.email == 'prithcbr@gmail.com' ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'
      );
    }

    // User profile documents: Owner can read/write their own document; Admins can audit and manage roles
    match /users/{userId} {
      allow read: if request.auth != null && (request.auth.uid == userId || isAdmin());
      allow write: if request.auth != null && (request.auth.uid == userId || isAdmin());
    }

    // Interaction audit records: Strictly private to entry author
    match /users/{userId}/interactions/{interactionId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Journal entries & reflections: Strictly private to entry author
    match /users/{userId}/journalEntries/{entryId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## 🚀 Google Cloud Run Deployment Guide

### 1. Prerequisites & API Activation

Ensure you have the Google Cloud SDK (`gcloud`) installed and configured:

```bash
# Set your active GCP project
gcloud config set project YOUR_PROJECT_ID

# Enable required Google Cloud APIs
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  cloudbuild.googleapis.com
```

### 2. Secret Manager Configuration

Store your `GEMINI_API_KEY` and `GOOGLE_MAPS_API_KEY` securely in Secret Manager and grant Cloud Run access:

```bash
# Create and populate Gemini API secret
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# Create and populate Google Maps API secret (optional for production custom key)
gcloud secrets create GOOGLE_MAPS_API_KEY --replication-policy="automatic"
echo -n "YOUR_MAPS_API_KEY" | gcloud secrets versions add GOOGLE_MAPS_API_KEY --data-file=-

# Grant the Cloud Run runtime service account permission to access the secrets
export PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")

gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding GOOGLE_MAPS_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 3. Deploy to Cloud Run

Deploy the container directly from source:

```bash
gcloud run deploy gemini-reflection-journal \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,GOOGLE_MAPS_API_KEY=GOOGLE_MAPS_API_KEY:latest" \
  --port=3000
```

### 4. Challenge Verification Binding

Apply the mandatory challenge label to register your Cloud Run deployment:

```bash
gcloud run services update gemini-reflection-journal \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=us-central1
```

---

## 📋 Comprehensive Functional Test Walkthrough

Follow these test steps to verify all features:

### Test Case 1: Landing Page & Unauthenticated State
1. Visit the root URL `/`.
2. Verify the hero section displays "A sanctuary for mindful reflection, deep journaling, and AI clarity".
3. Verify that clicking any dashboard link while logged out keeps you on the landing page.

### Test Case 2: Google Authentication Flow
1. Click **"Continue with Google Sign-In"**.
2. Select your Google account in the popup dialog.
3. Confirm seamless redirect to `/dashboard`.
4. Verify user avatar, display name, and email appear in the top-right navigation bar.

### Test Case 3: Create a Multi-Turn Reflection & Conversational AI Dialogue
1. Click **"New Reflection"**.
2. Select a journaling mode (e.g. **Reflective Journal** or **Clarity & Decisions**).
3. Set an emotional tone (e.g. **🌿 Peaceful** or **✨ Inspired**).
4. Enter a title (e.g. `Weekly Strategy & Mindset Check-in`).
5. Write your journal entry in the main textarea (or click a **Spark Prompt**).
6. In the **Conversational Reflection** section, type a question or click **"Spot Blind Spots"** / **"Positive Reframe"**.
7. Observe the thinking indicator and verify Gemini replies with thoughtful, contextual insights.
8. Ask a follow-up inquiry to confirm multi-turn context awareness.

### Test Case 4: Location-Aware Entries (Google Maps Integration)
1. In the journal workspace below the Mood chips, locate the **Location** control.
2. Click **"Pin Location"**.
3. In the modal dialog:
   - Click **"Use My Current Device Location (GPS)"** and allow browser geolocation permission, OR
   - Enter a location in the search bar (e.g. `Central Park` or `Tokyo`) and click **Search**, OR
   - Click an inspirational preset chip (e.g., `Kyoto, Japan` or `Golden Gate Park`).
4. Confirm the selected place is pinned with a yellow location badge: `📍 [Location Name]`.
5. Click on the location badge to open the **Location Viewer** displaying address and coordinate coordinates.
6. Trigger an AI reflection or summary; observe that Gemini integrates the pinned location context into its reflections.
7. Click the `✕` button on the badge to remove the pinned location.

### Test Case 5: Role-Based Access Control (RBAC) & Admin Control Portal
1. Sign in with the designated administrator account (`prithcbr@gmail.com`).
2. Notice the **"Admin Portal"** shield button appearing in the top navigation bar.
3. Click **"Admin Portal"** to navigate to `/admin` (protected by `adminGuard`).
4. In the Admin Portal, verify:
   - System Telemetry metrics: Registered Users, Active Administrators, Gemini Engine status, Maps Platform status.
   - User Identity Roster: View registered users with email, ID, and current role.
   - Privilege Management: Toggle user roles between `USER` and `ADMIN` using the promote/demote buttons.
   - Search bar: Filter users by email or display name.
5. Click **"Journal"** in the top bar to return smoothly to the main reflection dashboard.
6. Attempt accessing `/admin` as a standard user; verify redirection to `/dashboard`.

### Test Case 6: Multimodal Voice Reflection & Audio Transcription
1. In the journal workspace, locate the **Input Mode Switcher** above the text area.
2. Click **"Voice Reflection"** (with the microphone icon).
3. Confirm the **Voice Recording Studio** card opens with duration counter and controls.
4. Click **"Start Voice Recording"** and grant microphone permissions in the browser.
5. Speak a voice reflection aloud into your microphone.
6. Notice the live audio duration ticker and real-time speech feedback stream.
7. Click **"Finish & Transcribe Voice"**.
8. Observe the loading state ("Transcribing audio...") while Gemini processes the audio payload.
9. Verify the transcribed speech is automatically placed into the editable **Journal Text Area**, an auto-generated title is assigned if empty, and the `voice-journal` tag is appended.
10. Edit or refine the text as needed.

### Test Case 7: Deep Insights & Summarization Generation
1. Click **"Generate Deep Insights & Summary"**.
2. Verify that Gemini extracts:
   - An executive summary
   - Dominant mood tone
   - Key takeaway bullets
   - Self-inquiry questions
   - Actionable next steps

### Test Case 8: Cloud Firestore Persistence & User Isolation
1. Click **"Save to Firestore"** (or observe automatic sync).
2. Confirm the green confirmation banner appears: *"Reflection successfully saved to your isolated Cloud Firestore collection"*.
3. Notice that Firestore persists strictly clean text, keeping storage lightweight and private.
4. Verify the entry appears immediately in the left sidebar **Past Entries** list, with location pin icons visible for entries that have a pinned location.
5. Refresh the browser; confirm the entry, pinned location, full chat transcript, tags, and AI insights persist accurately.
6. Search for the entry using the sidebar search box and verify filter chips work.
7. Click **"Export"** to verify markdown file download.

