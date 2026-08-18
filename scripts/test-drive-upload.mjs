import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// 1. Safely load .env.local without exposing values
function loadEnvLocal() {
  const envLocalPath = path.join(projectRoot, ".env.local");
  if (existsSync(envLocalPath)) {
    const content = readFileSync(envLocalPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

loadEnvLocal();

console.log("==================================================");
console.log("PHOBO GOOGLE DRIVE REAL SMOKE TEST");
console.log("==================================================");

async function runDriveSmokeTest() {
  // 2. Audit Environment Variables without printing sensitive secrets
  const driveEnabled = process.env.PHOBO_DRIVE_ENABLED === "true";
  const authMode = process.env.GOOGLE_DRIVE_AUTH_MODE || "oauth";
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  const debugLogs = process.env.PHOBO_DEBUG_LOGS === "true";

  console.log("\n1. Environment Configuration Audit:");
  console.log(`   PHOBO_DRIVE_ENABLED:        ${driveEnabled ? "true" : "false"}`);
  console.log(`   GOOGLE_DRIVE_AUTH_MODE:     ${authMode}`);
  console.log(`   GOOGLE_DRIVE_FOLDER_ID:     ${folderId ? "configured" : "missing"}`);
  console.log(`   GOOGLE_OAUTH_CLIENT_ID:     ${clientId ? "configured" : "missing"}`);
  console.log(`   GOOGLE_OAUTH_CLIENT_SECRET: ${clientSecret ? "configured" : "missing"}`);
  console.log(`   GOOGLE_OAUTH_REFRESH_TOKEN: ${refreshToken ? "configured" : "missing"}`);

  if (!folderId || !clientId || !clientSecret || !refreshToken) {
    console.log("\n--------------------------------------------------");
    console.log("DRIVE TEST: CONFIG ERROR");
    console.log("--------------------------------------------------");
    console.log("Missing one or more required OAuth credentials in environment (.env.local).");
    console.log("Required variables: GOOGLE_DRIVE_FOLDER_ID, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN.");
    return { status: "CONFIG_ERROR" };
  }

  // 3. Create tiny temporary test file
  const now = new Date();
  const timestampStr = now.toISOString().replace(/[-:T.]/g, "").slice(0, 14);
  const tempFileName = `phobo-drive-smoke-test-${timestampStr}.txt`;
  const tempFilePath = path.join(projectRoot, tempFileName);

  const fileContent = `Phobo Google Drive Integration Smoke Test\nTimestamp: ${now.toISOString()}\nAuth Mode: ${authMode}\n`;

  let uploadedFileUrl = null;

  try {
    await fs.writeFile(tempFilePath, fileContent, "utf-8");
    console.log(`\n2. Created temporary smoke test file: ${tempFileName}`);

    console.log("3. Initiating real Google Drive OAuth upload via uploadFileToGoogleDrive()...");
    const { uploadFileToGoogleDrive } = await import("../src/lib/storage/google-drive.ts");

    const uploadResult = await uploadFileToGoogleDrive({
      filePath: tempFilePath,
      fileName: tempFileName,
      mimeType: "text/plain",
      folderId: folderId,
    });

    uploadedFileUrl = uploadResult.webViewLink;

    console.log("\n--------------------------------------------------");
    console.log("DRIVE TEST: PASS");
    console.log("--------------------------------------------------");
    console.log("✓ OAuth refresh token validated successfully.");
    console.log("✓ File uploaded to Google Drive folder.");
    console.log("✓ Public reader permissions applied.");
    console.log(`✓ Web View Link: ${uploadedFileUrl}`);
    return { status: "PASS", webViewLink: uploadedFileUrl };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorLower = errorMsg.toLowerCase();

    console.log("\n--------------------------------------------------");
    if (errorLower.includes("invalid_grant") || errorLower.includes("invalid_client") || errorLower.includes("invalid client") || errorLower.includes("unauthorized") || errorLower.includes("token")) {
      console.log("DRIVE TEST: AUTH FAILED");
      console.log("--------------------------------------------------");
      console.log(`Reason: OAuth token error (${errorMsg}).`);
      console.log("Explanation: OAuth refresh token is invalid/revoked/expired or does not match the OAuth client ID/secret.");
      console.log("Remediation: Re-authorize OAuth consent screen and generate a new GOOGLE_OAUTH_REFRESH_TOKEN.");
      return { status: "AUTH_FAILED", error: errorMsg };
    } else if (errorLower.includes("file not found") || errorLower.includes("folder") || errorLower.includes("parent")) {
      console.log("DRIVE TEST: FOLDER/PERMISSION FAILED");
      console.log("--------------------------------------------------");
      console.log(`Reason: Target folder access failed (${errorMsg}).`);
      console.log("Explanation: The specified GOOGLE_DRIVE_FOLDER_ID does not exist or the OAuth account lacks write permissions.");
      return { status: "FOLDER_FAILED", error: errorMsg };
    } else if (errorLower.includes("permission") || errorLower.includes("access")) {
      console.log("DRIVE TEST: PUBLIC PERMISSION FAILED");
      console.log("--------------------------------------------------");
      console.log(`Reason: Could not set public reader permissions (${errorMsg}).`);
      return { status: "PUBLIC_FAILED", error: errorMsg };
    } else {
      console.log("DRIVE TEST: AUTH FAILED");
      console.log("--------------------------------------------------");
      console.log(`Reason: ${errorMsg}`);
      if (debugLogs && error instanceof Error && error.stack) {
        console.log("\nStack Trace:");
        console.log(error.stack);
      }
      return { status: "ERROR", error: errorMsg };
    }
  } finally {
    // 4. Always clean up local temporary file
    try {
      if (existsSync(tempFilePath)) {
        await fs.unlink(tempFilePath);
        console.log("\n✓ Local temporary smoke test file deleted.");
      }
    } catch {}
  }
}

runDriveSmokeTest().catch((err) => {
  console.error("Smoke test execution failed:", err);
  process.exit(1);
});
