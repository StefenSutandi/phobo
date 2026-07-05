# Google Drive Setup for Phobo

This document explains how to set up Google Drive integration so that Phobo's final result QR codes point to a public Google Drive share link instead of a local file. 

There are two methods to integrate Google Drive. **Method A (OAuth)** is recommended for standard Gmail accounts ("My Drive"). **Method B (Service Account)** is recommended for Google Workspace users uploading to a Shared Drive.

---

## Method A: OAuth User Mode (Recommended for personal Gmail)

Using OAuth allows Phobo to act on your behalf and upload files directly into your standard "My Drive" folder using your own storage quota.

### 1. Create OAuth Credentials
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing one.
3. Go to **APIs & Services > Library** and enable the **Google Drive API**.
4. Go to **APIs & Services > OAuth consent screen**. Configure the consent screen for "External" use. 
5. Under **Test users** (or Audience), make sure to add the Google account you will use to upload the files as a Test User.
6. Go to **APIs & Services > Credentials**. Click **Create Credentials > OAuth client ID**.
7. Select **Desktop app** (or Web application) and click **Create**. Ensure that `http://localhost:3001/oauth2callback` is added as an authorized redirect URI if prompted (usually not needed for Desktop app type, but required for Web app).
8. Note down your **Client ID** and **Client Secret**.

### 2. Generate a Refresh Token
We have provided a helper script to easily generate your refresh token. This script runs a temporary local server on port 3001 to handle the OAuth redirect securely, replacing the deprecated OOB (out-of-band) manual copy-paste flow.

1. Copy `.env.example` to `.env.local` if you haven't already.
2. Add your Client ID and Client Secret to `.env.local`:
   ```env
   GOOGLE_OAUTH_CLIENT_ID="your-client-id"
   GOOGLE_OAUTH_CLIENT_SECRET="your-client-secret"
   ```
3. Run the helper script:
   ```bash
   node scripts/get-google-refresh-token.js
   ```
4. The script will automatically open a local server on port 3001. Open the generated link in your browser, log in with the test user account, and authorize the app. Google will redirect you back to `localhost:3001`, and the script will catch the code automatically.
5. The script will output your `GOOGLE_OAUTH_REFRESH_TOKEN` to the terminal. Add it to your `.env.local` file.

### 3. Prepare the Drive Folder and Configure Environment
1. Create a folder in your Google Drive and set the General Access to **"Anyone with the link"** as a **Viewer**.
2. Note the Folder ID from the URL (`drive.google.com/drive/folders/<FOLDER_ID>`).
3. Update `.env.local`:
   ```env
   PHOBO_DRIVE_ENABLED=true
   GOOGLE_DRIVE_AUTH_MODE=oauth
   GOOGLE_DRIVE_FOLDER_ID="your-folder-id"
   GOOGLE_OAUTH_CLIENT_ID="your-client-id"
   GOOGLE_OAUTH_CLIENT_SECRET="your-client-secret"
   GOOGLE_OAUTH_REFRESH_TOKEN="your-refresh-token"
   ```
4. Restart the Phobo app: `npm run dev`.

---

## Method B: Service Account (Google Workspace / Shared Drives)

**Important limitations:** A service account has no storage quota of its own. It **cannot** upload files into a standard "My Drive" folder. It will fail with a quota error. You must use a **Shared Drive** within a Google Workspace to use this method.

### 1. Create a Service Account
1. Go to the Google Cloud Console, enable the **Google Drive API**.
2. Go to **IAM & Admin > Service Accounts** and create a Service Account.
3. Generate and download a JSON key. Save it securely (e.g., `C:\Users\username\phobo-credentials.json`).

### 2. Prepare the Shared Drive Folder
1. Create a folder inside a **Shared Drive**.
2. Share the folder with the Service Account email address, giving it **Editor** or **Contributor** access.
3. Set the folder's General Access to **"Anyone with the link"** as a **Viewer**.

### 3. Configure Environment
Update `.env.local`:
```env
PHOBO_DRIVE_ENABLED=true
GOOGLE_DRIVE_AUTH_MODE=service_account
GOOGLE_DRIVE_FOLDER_ID="your-shared-drive-folder-id"
GOOGLE_APPLICATION_CREDENTIALS="C:\Users\username\phobo-credentials.json"
```
Restart the Phobo app: `npm run dev`.

---

## Fallback Behavior
- If `PHOBO_DRIVE_ENABLED=false` or if the upload fails (e.g. invalid credentials, quota error), Phobo will gracefully log a warning in the terminal and fall back to generating a local QR code link.
- The UI will say `"Using local result link"` or `"Drive upload failed, using local result link"`.
- This ensures the photobooth never crashes or gets stuck due to an upload error.
