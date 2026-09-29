import { v2 as cloudinary } from "cloudinary";

export interface CloudinaryUploadOptions {
  filePath: string;
  publicId?: string;
  folder?: string;
}

export interface CloudinaryUploadResult {
  publicId: string;
  secureUrl: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
}

/**
 * Returns formatted Cloudinary folder hierarchy: phobo/YYYY-MM-DD/{sessionId}
 */
export function getCloudinaryFolder(sessionId: string, date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `phobo/${yyyy}-${mm}-${dd}/${safeSessionId}`;
}

/**
 * Checks if all required server-side Cloudinary credentials are set.
 */
export function isCloudinaryConfigured(): boolean {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  return Boolean(cloudName && apiKey && apiSecret);
}

/**
 * Uploads a local file to Cloudinary using server-side signed uploads.
 * Never logs or exposes api_key or api_secret.
 */
export async function uploadFileToCloudinary({
  filePath,
  publicId,
  folder,
}: CloudinaryUploadOptions): Promise<CloudinaryUploadResult> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary credentials missing (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET)"
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  const uploadOptions: Record<string, any> = {
    resource_type: "image",
    overwrite: true,
  };

  if (folder) {
    uploadOptions.folder = folder;
  }
  if (publicId) {
    uploadOptions.public_id = publicId;
  }

  // Safe logging - never log credentials or secrets
  console.log(`[Cloudinary] Uploading ${filePath} as ${publicId || "auto"} to folder ${folder || "root"}...`);

  const response = await cloudinary.uploader.upload(filePath, uploadOptions);

  if (!response || !response.secure_url) {
    throw new Error("Failed to receive secure_url from Cloudinary upload response");
  }

  console.log(`[Cloudinary] Upload complete: ${response.secure_url}`);

  return {
    publicId: response.public_id,
    secureUrl: response.secure_url,
    width: response.width,
    height: response.height,
    bytes: response.bytes,
    format: response.format,
  };
}
