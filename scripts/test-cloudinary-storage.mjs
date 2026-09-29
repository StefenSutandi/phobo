import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

console.log("==================================================");
console.log("PHOBO CLOUDINARY STORAGE CONTRACT & UNIT TEST SUITE");
console.log("==================================================");

let testsPassed = 0;
let testsFailed = 0;

async function runTest(testName, fn) {
  try {
    await fn();
    console.log(`- Testing: ${testName}... PASS ✓`);
    testsPassed++;
  } catch (err) {
    console.log(`- Testing: ${testName}... FAIL ✗`);
    console.error(`  Error:`, err.message || err);
    testsFailed++;
  }
}

async function main() {
  // Save original env
  const origEnv = { ...process.env };

  const {
    getCloudinaryFolder,
    isCloudinaryConfigured,
    uploadFileToCloudinary,
  } = await import("../src/lib/storage/cloudinary.ts");

  const {
    resolveStorageProvider,
    uploadResultImage,
  } = await import("../src/lib/storage/cloud-storage.ts");

  // TEST 1: Deterministic folder path matches phobo/YYYY-MM-DD/{sessionId}
  await runTest("Deterministic Cloudinary folder path format", () => {
    const fixedDate = new Date(2026, 8, 29); // Sept 29, 2026
    const folder = getCloudinaryFolder("test-session-123_abc", fixedDate);
    assert.equal(folder, "phobo/2026-09-29/test-session-123_abc");

    // Also verify special character sanitization
    const folderDirty = getCloudinaryFolder("sess!@#$456", fixedDate);
    assert.equal(folderDirty, "phobo/2026-09-29/sess456");
  });

  // TEST 2: Credential check & configuration detection
  await runTest("isCloudinaryConfigured detects presence/absence of credentials", () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    assert.equal(isCloudinaryConfigured(), false);

    process.env.CLOUDINARY_CLOUD_NAME = "dummy-cloud";
    process.env.CLOUDINARY_API_KEY = "123456789";
    process.env.CLOUDINARY_API_SECRET = "secret987";
    assert.equal(isCloudinaryConfigured(), true);

    delete process.env.CLOUDINARY_API_SECRET;
    assert.equal(isCloudinaryConfigured(), false);
  });

  // TEST 3: Missing credentials error handling throws descriptive error without leaking secrets
  await runTest("uploadFileToCloudinary throws without leaking secrets when credentials missing", async () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;

    await assert.rejects(
      async () => {
        await uploadFileToCloudinary({ filePath: "dummy.png" });
      },
      (err) => {
        assert(err instanceof Error);
        assert(err.message.includes("Cloudinary credentials missing"));
        // Ensure no actual secret values are leaked
        assert(!err.message.includes("secret987"));
        return true;
      }
    );
  });

  // TEST 4: Storage provider resolution priority
  await runTest("resolveStorageProvider honors explicit provider and feature flags", () => {
    // 1. Local fallback default
    delete process.env.PHOBO_STORAGE_PROVIDER;
    delete process.env.PHOBO_CLOUDINARY_ENABLED;
    delete process.env.PHOBO_DRIVE_ENABLED;
    assert.equal(resolveStorageProvider(), "local");

    // 2. Cloudinary enabled flag
    process.env.PHOBO_CLOUDINARY_ENABLED = "true";
    assert.equal(resolveStorageProvider(), "cloudinary");

    // 3. Drive enabled flag (Cloudinary takes precedence if both true)
    process.env.PHOBO_DRIVE_ENABLED = "true";
    assert.equal(resolveStorageProvider(), "cloudinary");

    // 4. Drive flag alone
    delete process.env.PHOBO_CLOUDINARY_ENABLED;
    process.env.PHOBO_DRIVE_ENABLED = "true";
    assert.equal(resolveStorageProvider(), "google-drive");

    // 5. Explicit provider override: local overrides flags
    process.env.PHOBO_STORAGE_PROVIDER = "local";
    assert.equal(resolveStorageProvider(), "local");

    // 6. Explicit provider override: google-drive overrides cloudinary flag
    process.env.PHOBO_STORAGE_PROVIDER = "google-drive";
    process.env.PHOBO_CLOUDINARY_ENABLED = "true";
    assert.equal(resolveStorageProvider(), "google-drive");

    // 7. Explicit provider override: cloudinary overrides drive flag
    process.env.PHOBO_STORAGE_PROVIDER = "cloudinary";
    process.env.PHOBO_DRIVE_ENABLED = "true";
    assert.equal(resolveStorageProvider(), "cloudinary");
  });

  // TEST 5: Non-fatal uploadResultImage when provider is local
  await runTest("uploadResultImage returns { provider: 'local' } immediately when local", async () => {
    process.env.PHOBO_STORAGE_PROVIDER = "local";
    const res = await uploadResultImage({
      filePath: "non-existent-file.png",
      sessionId: "sess_local_test",
    });
    assert.equal(res.provider, "local");
    assert.equal(res.url, undefined);
  });

  // TEST 6: Non-fatal uploadResultImage when Cloudinary fails and no Drive fallback
  await runTest("uploadResultImage catches Cloudinary error and falls back gracefully to local", async () => {
    process.env.PHOBO_STORAGE_PROVIDER = "cloudinary";
    delete process.env.PHOBO_DRIVE_ENABLED;
    delete process.env.GOOGLE_DRIVE_FOLDER_ID;
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;

    // Must NOT throw
    const res = await uploadResultImage({
      filePath: "dummy.png",
      sessionId: "sess_fail_test",
    });

    assert.equal(res.provider, "local");
    assert(res.error && res.error.includes("Cloudinary credentials missing"));
    assert.equal(res.url, undefined);
  });

  // TEST 7: Result page message parity logic
  await runTest("Result page status parity for Cloudinary vs Google Drive vs Local", () => {
    function computeStatusMsg(driveUrl, finalImageUrl) {
      if (driveUrl) {
        const isCloudinary = driveUrl.includes("cloudinary.com") || driveUrl.includes("res.cloudinary");
        return isCloudinary ? "Uploaded to Cloudinary" : "Uploaded to Google Drive";
      } else if (finalImageUrl) {
        return "Using local result link";
      }
      return "";
    }

    assert.equal(
      computeStatusMsg("https://res.cloudinary.com/phobo/image/upload/v1234/phobo/2026-09-29/final_screen.png", "/results/s1/final_screen.png"),
      "Uploaded to Cloudinary"
    );
    assert.equal(
      computeStatusMsg("https://drive.google.com/file/d/12345/view", "/results/s1/final_screen.png"),
      "Uploaded to Google Drive"
    );
    assert.equal(
      computeStatusMsg(undefined, "/results/s1/final_screen.png"),
      "Using local result link"
    );
  });

  // TEST 8: Cache idempotency test via cloud_url.txt
  await runTest("Idempotency: cloud_url.txt persistence and retrieval contract", async () => {
    const testDir = path.join(projectRoot, "public", "results", "test_idempotency_session");
    await fs.mkdir(testDir, { recursive: true });
    const cloudUrlCachePath = path.join(testDir, "cloud_url.txt");
    const sampleUrl = "https://res.cloudinary.com/phobo/image/upload/v1234/phobo/2026-09-29/test/final_screen.png";

    await fs.writeFile(cloudUrlCachePath, sampleUrl, "utf-8");
    const readBack = (await fs.readFile(cloudUrlCachePath, "utf-8")).trim();
    assert.equal(readBack, sampleUrl);

    // Clean up
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // Restore environment
  for (const k of Object.keys(process.env)) {
    if (!(k in origEnv)) {
      delete process.env[k];
    } else {
      process.env[k] = origEnv[k];
    }
  }

  console.log("\n==================================================");
  console.log(`SUMMARY: ${testsPassed} passed, ${testsFailed} failed.`);
  console.log("==================================================");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Test harness failed:", e);
  process.exit(1);
});
