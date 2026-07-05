import { google } from "googleapis";
import { createReadStream } from "fs";

export type UploadResult = {
  fileId: string;
  webViewLink: string;
  webContentLink: string;
};

export async function uploadFileToGoogleDrive({
  filePath,
  fileName,
  mimeType,
  folderId,
}: {
  filePath: string;
  fileName: string;
  mimeType: string;
  folderId: string;
}): Promise<UploadResult> {
  const authMode = process.env.GOOGLE_DRIVE_AUTH_MODE || "service_account";
  let auth;

  if (authMode === "oauth") {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error("Google Drive OAuth credentials missing");
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    auth = oauth2Client;
  } else {
    auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });
  }

  const drive = google.drive({ version: "v3", auth });

  console.log(`[Google Drive] Uploading ${fileName} to folder ${folderId}...`);

  const fileMetadata = {
    name: fileName,
    parents: [folderId],
  };

  const media = {
    mimeType: mimeType,
    body: createReadStream(filePath),
  };

  // Upload the file
  let response;
  try {
    response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, webViewLink, webContentLink",
    });
  } catch (error) {
    if (authMode !== "oauth" && error instanceof Error && error.message.toLowerCase().includes("quota")) {
      throw new Error(`Service account cannot upload to normal My Drive. Use Shared Drive or GOOGLE_DRIVE_AUTH_MODE=oauth. Original error: ${error.message}`);
    }
    throw error;
  }

  const fileId = response.data.id;
  if (!fileId) {
    throw new Error("Failed to get fileId from Google Drive upload response");
  }

  // Make the file publicly accessible
  console.log(`[Google Drive] Setting permissions for ${fileId}...`);
  await drive.permissions.create({
    fileId: fileId,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  // Re-fetch to get the links now that it's public
  const publicFile = await drive.files.get({
    fileId: fileId,
    fields: "id, webViewLink, webContentLink",
  });

  console.log(`[Google Drive] Upload complete: ${publicFile.data.webViewLink}`);

  return {
    fileId: publicFile.data.id!,
    webViewLink: publicFile.data.webViewLink!,
    webContentLink: publicFile.data.webContentLink!,
  };
}
