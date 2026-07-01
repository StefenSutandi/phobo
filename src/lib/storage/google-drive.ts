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
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });

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
  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: "id, webViewLink, webContentLink",
  });

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
