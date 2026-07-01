# Google Drive Setup for Phobo

This document explains how to set up Google Drive integration so that Phobo's final result QR codes point to a public Google Drive share link instead of a local file.

## 1. Create a Service Account
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing one.
3. Go to **APIs & Services > Library** and enable the **Google Drive API**.
4. Go to **IAM & Admin > Service Accounts** and click **Create Service Account**.
5. Give it a name (e.g., `phobo-uploader`) and click **Create and Continue**, then **Done**.
6. Find the newly created service account in the list, click the three dots under Actions, and select **Manage keys**.
7. Click **Add Key > Create new key**, choose **JSON**, and click **Create**.
8. Save this JSON file securely on your Phobo machine (e.g., `C:\Users\username\phobo-credentials.json`).

## 2. Prepare the Google Drive Folder
1. Go to your personal or workspace [Google Drive](https://drive.google.com/).
2. Create a new folder (e.g., `Phobo Results`).
3. Right-click the folder and select **Share**.
4. In the "Add people and groups" field, paste the **email address of your service account** (found in the JSON file, looks like `phobo-uploader@project-id.iam.gserviceaccount.com`).
5. Give the service account **Editor** or **Contributor** access.
6. (Optional but recommended) Set the folder's General Access to **"Anyone with the link"** as a **Viewer**. This ensures that the generated share links open smoothly without login prompts.

## 3. Configure Phobo Environment Variables
Open or create a `.env.local` file in the root of the Phobo project (`C:\Users\stefe\Downloads\Phobo\.env.local`):

```env
# Enable the Google Drive integration
PHOBO_DRIVE_ENABLED=true

# The absolute path to your downloaded JSON key file (Windows format)
GOOGLE_APPLICATION_CREDENTIALS="C:\Users\stefe\phobo-credentials.json"

# The ID of the Drive folder you created (found in the URL: drive.google.com/drive/folders/<FOLDER_ID>)
GOOGLE_DRIVE_FOLDER_ID="your-folder-id-here"
```

## 4. Test the Integration
1. Restart the Phobo app: `npm run dev`
2. Run through a normal photo session.
3. When you reach the `PREVIEW FRAME` page and hit **NEXT**, the console should log:
   `[Compose API] Uploading phobo_session-123.png to folder your-folder-id-here...`
   `[Compose API] Drive upload success for session-123: https://drive.google.com/file/d/....`
4. The QR code on the final screen will now point to the Drive link, and the UI will say `"Uploaded to Drive"`.

## Fallback Behavior
- If `PHOBO_DRIVE_ENABLED=false` or if the upload fails (e.g., no internet, invalid credentials), Phobo will gracefully log a warning in the terminal and fall back to generating a local QR code link.
- The UI will say `"Using local result link"` or `"Drive upload failed, using local result link"`.
- This ensures the photobooth never crashes or gets stuck just because of an upload error.
