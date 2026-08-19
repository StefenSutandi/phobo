import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const testResultsDir = path.join(projectRoot, "public", "results", "runtime-route-test");

console.log("==================================================");
console.log("RUNNING DETERMINISTIC RUNTIME /results ROUTE TESTS");
console.log("==================================================");

async function runResultsRouteTests() {
  await fs.mkdir(testResultsDir, { recursive: true });

  const testPngPath = path.join(testResultsDir, "test_screen.png");
  const testJpgPath = path.join(testResultsDir, "test_print.jpg");

  try {
    // 1. Create temporary test images on disk
    console.log("Step 1: Creating test PNG and JPG in public/results/runtime-route-test/...");
    const pngBuffer = await sharp({
      create: {
        width: 100,
        height: 150,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    }).png().toBuffer();

    const jpgBuffer = await sharp({
      create: {
        width: 100,
        height: 150,
        channels: 3,
        background: { r: 0, g: 255, b: 0 },
      },
    }).jpeg().toBuffer();

    await fs.writeFile(testPngPath, pngBuffer);
    await fs.writeFile(testJpgPath, jpgBuffer);
    console.log("✓ Test PNG and JPG created on disk");

    const { resolveResultsFilePath } = await import("../src/app/results/[...path]/route.ts");

    // 2. Validate PNG resolution and MIME type
    console.log("\nStep 2: Testing PNG resolution and image/png MIME type...");
    const pngResolved = resolveResultsFilePath(["runtime-route-test", "test_screen.png"]);
    assert.equal(pngResolved.ok, true, "PNG resolution must succeed");
    assert.equal(pngResolved.mimeType, "image/png", "MIME type must be image/png");
    assert.ok(pngResolved.fullPath, "fullPath must be returned");
    const readPngBytes = await fs.readFile(pngResolved.fullPath);
    assert.equal(readPngBytes.length, pngBuffer.length, "Read bytes must match written bytes");
    console.log(`✓ PNG resolved: ${pngResolved.fullPath} | MIME: ${pngResolved.mimeType} (${readPngBytes.length} bytes)`);

    // 3. Validate JPG resolution and MIME type
    console.log("\nStep 3: Testing JPG resolution and image/jpeg MIME type...");
    const jpgResolved = resolveResultsFilePath(["runtime-route-test", "test_print.jpg"]);
    assert.equal(jpgResolved.ok, true, "JPG resolution must succeed");
    assert.equal(jpgResolved.mimeType, "image/jpeg", "MIME type must be image/jpeg");
    const readJpgBytes = await fs.readFile(jpgResolved.fullPath);
    assert.equal(readJpgBytes.length, jpgBuffer.length, "Read bytes must match written bytes");
    console.log(`✓ JPG resolved: ${jpgResolved.fullPath} | MIME: ${jpgResolved.mimeType} (${readJpgBytes.length} bytes)`);

    // 4. Validate nested captures subdirectory support
    console.log("\nStep 4: Testing nested captures subdirectory...");
    const capturesDir = path.join(testResultsDir, "captures");
    await fs.mkdir(capturesDir, { recursive: true });
    const nestedRawPath = path.join(capturesDir, "capture-1-raw.jpg");
    await fs.writeFile(nestedRawPath, jpgBuffer);

    const nestedResolved = resolveResultsFilePath(["runtime-route-test", "captures", "capture-1-raw.jpg"]);
    assert.equal(nestedResolved.ok, true, "Nested capture resolution must succeed");
    assert.equal(nestedResolved.mimeType, "image/jpeg");
    console.log(`✓ Nested capture resolved: ${nestedResolved.fullPath}`);

    // 5. Validate Path Traversal Rejections
    console.log("\nStep 5: Testing path traversal rejections...");
    const traversal1 = resolveResultsFilePath(["..", "..", ".env.local"]);
    assert.equal(traversal1.ok, false, "Path traversal with '..' must be rejected");
    assert.equal(traversal1.errorStatus, 403);
    console.log(`✓ Traversal with '..' rejected: HTTP ${traversal1.errorStatus}`);

    const traversal2 = resolveResultsFilePath(["runtime-route-test", "..", "..", ".env.local"]);
    assert.equal(traversal2.ok, false, "Path traversal in subpath must be rejected");
    assert.equal(traversal2.errorStatus, 403);
    console.log(`✓ Nested traversal rejected: HTTP ${traversal2.errorStatus}`);

    const traversalNullByte = resolveResultsFilePath(["runtime-route-test", "file\0.png"]);
    assert.equal(traversalNullByte.ok, false, "Null bytes must be rejected");
    assert.equal(traversalNullByte.errorStatus, 403);
    console.log(`✓ Null byte injection rejected: HTTP ${traversalNullByte.errorStatus}`);

    // 6. Validate Missing File Handling (404)
    console.log("\nStep 6: Testing missing file error handling...");
    const missing = resolveResultsFilePath(["runtime-route-test", "nonexistent.png"]);
    assert.equal(missing.ok, false, "Nonexistent file must return not ok");
    assert.equal(missing.errorStatus, 404, "Nonexistent file must return 404");
    console.log(`✓ Missing file returns 404: ${missing.errorMessage}`);

    console.log("\n==================================================");
    console.log("ALL RUNTIME /results ROUTE TESTS PASSED!");
    console.log("==================================================");
  } finally {
    // Cleanup temporary files
    await fs.rm(testResultsDir, { recursive: true, force: true });
    console.log("✓ Test directory cleaned up");
  }
}

runResultsRouteTests().catch((err) => {
  console.error("Results route test failed:", err);
  process.exit(1);
});
