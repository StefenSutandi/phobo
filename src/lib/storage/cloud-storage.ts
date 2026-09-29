import { uploadFileToCloudinary, getCloudinaryFolder, isCloudinaryConfigured } from "./cloudinary";
import { uploadFileToGoogleDrive } from "./google-drive";

export type CloudStorageProvider = "cloudinary" | "google-drive" | "local";

export interface UploadResultImageParams {
  filePath: string;
  sessionId: string;
  fileName?: string;
  mimeType?: string;
}

export interface CloudStorageOutcome {
  provider: CloudStorageProvider;
  url?: string;
  error?: string;
}

/**
 * Resolves the preferred cloud storage provider based on environment configuration.
 * Priority: PHOBO_STORAGE_PROVIDER > PHOBO_CLOUDINARY_ENABLED > PHOBO_DRIVE_ENABLED > local
 */
export function resolveStorageProvider(): CloudStorageProvider {
  const explicitProvider = process.env.PHOBO_STORAGE_PROVIDER?.toLowerCase().trim();
  if (explicitProvider === "cloudinary" || explicitProvider === "google-drive" || explicitProvider === "local") {
    return explicitProvider as CloudStorageProvider;
  }

  if (process.env.PHOBO_CLOUDINARY_ENABLED === "true") {
    return "cloudinary";
  }

  if (process.env.PHOBO_DRIVE_ENABLED === "true") {
    return "google-drive";
  }

  return "local";
}

/**
 * Orchestrates cloud result upload according to configured provider.
 * Cloud upload is strictly NON-FATAL: any failure logs a safe diagnostic
 * and returns gracefully without throwing or breaking local result flow.
 */
export async function uploadResultImage({
  filePath,
  sessionId,
  fileName = `phobo_${sessionId}.png`,
  mimeType = "image/png",
}: UploadResultImageParams): Promise<CloudStorageOutcome> {
  const provider = resolveStorageProvider();

  if (provider === "local") {
    return { provider: "local" };
  }

  const isDriveFallbackAvailable = Boolean(
    process.env.PHOBO_DRIVE_ENABLED === "true" && process.env.GOOGLE_DRIVE_FOLDER_ID
  );

  // 1. Attempt Cloudinary
  if (provider === "cloudinary") {
    let cloudinaryTimer: NodeJS.Timeout | undefined;
    try {
      const uploadPromise = uploadFileToCloudinary({
        filePath,
        folder: getCloudinaryFolder(sessionId),
        publicId: "final_screen",
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        cloudinaryTimer = setTimeout(() => reject(new Error("Cloudinary upload timeout after 10s")), 10000);
      });

      const result = await Promise.race([uploadPromise, timeoutPromise]);
      return {
        provider: "cloudinary",
        url: result.secureUrl,
      };
    } catch (cloudinaryErr) {
      const errMsg = cloudinaryErr instanceof Error ? cloudinaryErr.message : String(cloudinaryErr);
      console.error(`[Cloud Storage] Cloudinary upload non-fatal error for session ${sessionId}:`, errMsg);

      // Attempt fallback to Google Drive if configured
      if (isDriveFallbackAvailable) {
        console.log(`[Cloud Storage] Attempting Google Drive fallback for session ${sessionId}...`);
        let driveTimer: NodeJS.Timeout | undefined;
        try {
          const driveUploadPromise = uploadFileToGoogleDrive({
            filePath,
            fileName,
            mimeType,
            folderId: process.env.GOOGLE_DRIVE_FOLDER_ID!,
          });
          const driveTimeoutPromise = new Promise<never>((_, reject) => {
            driveTimer = setTimeout(() => reject(new Error("Google Drive upload timeout after 7s")), 7000);
          });

          const driveResult = await Promise.race([driveUploadPromise, driveTimeoutPromise]);
          return {
            provider: "google-drive",
            url: driveResult.webViewLink,
          };
        } catch (driveErr) {
          const driveErrMsg = driveErr instanceof Error ? driveErr.message : String(driveErr);
          console.error(`[Cloud Storage] Google Drive fallback non-fatal error for session ${sessionId}:`, driveErrMsg);
        } finally {
          if (driveTimer) clearTimeout(driveTimer);
        }
      }

      return {
        provider: "local",
        error: errMsg,
      };
    } finally {
      if (cloudinaryTimer) clearTimeout(cloudinaryTimer);
    }
  }

  // 2. Attempt Google Drive
  if (provider === "google-drive") {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId) {
      console.warn(`[Cloud Storage] Google Drive enabled but GOOGLE_DRIVE_FOLDER_ID is missing.`);
      return { provider: "local", error: "GOOGLE_DRIVE_FOLDER_ID missing" };
    }

    let driveTimer: NodeJS.Timeout | undefined;
    try {
      const driveUploadPromise = uploadFileToGoogleDrive({
        filePath,
        fileName,
        mimeType,
        folderId,
      });
      const driveTimeoutPromise = new Promise<never>((_, reject) => {
        driveTimer = setTimeout(() => reject(new Error("Google Drive upload timeout after 7s")), 7000);
      });

      const driveResult = await Promise.race([driveUploadPromise, driveTimeoutPromise]);
      return {
        provider: "google-drive",
        url: driveResult.webViewLink,
      };
    } catch (driveErr) {
      const driveErrMsg = driveErr instanceof Error ? driveErr.message : String(driveErr);
      if (driveErrMsg.toLowerCase().includes("invalid_grant")) {
        console.error(`[Cloud Storage] Google Drive OAuth refresh token rejected (invalid_grant). Re-authorize the production Google account.`);
      } else {
        console.error(`[Cloud Storage] Google Drive upload non-fatal error for session ${sessionId}:`, driveErrMsg);
      }
      return {
        provider: "local",
        error: driveErrMsg,
      };
    } finally {
      if (driveTimer) clearTimeout(driveTimer);
    }
  }

  return { provider: "local" };
}
