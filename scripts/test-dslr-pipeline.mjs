import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

console.log("==================================================");
console.log("RUNNING DETERMINISTIC DSLR PIPELINE VALIDATION");
console.log("==================================================");

async function runTests() {
  // 1. Create a dummy green-screen JPEG image on disk to simulate Canon DSLR raw capture
  const testDir = path.join(projectRoot, "public", "results", "test-dslr-session", "captures");
  await fs.mkdir(testDir, { recursive: true });

  const rawFilePath = path.join(testDir, "test-raw.jpg");
  const displayFilePath = path.join(testDir, "test-raw-display.png");

  // Create a 5184x3456 image with green background (RGB: 0, 255, 0) and a red subject circle in the center
  console.log("Step 1: Generating synthetic Canon 600D 5184x3456 green-screen JPEG...");
  const rawSubject = await sharp({
    create: {
      width: 1000,
      height: 1000,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  }).png().toBuffer();

  const rawDslrBuffer = await sharp({
    create: {
      width: 5184,
      height: 3456,
      channels: 4,
      background: { r: 0, g: 255, b: 0, alpha: 1 },
    },
  })
    .composite([{ input: rawSubject, left: 2092, top: 1228 }])
    .jpeg({ quality: 95 })
    .toBuffer();

  await fs.writeFile(rawFilePath, rawDslrBuffer);
  console.log(`✓ Synthetic Canon JPEG created: ${rawFilePath} (${rawDslrBuffer.length} bytes)`);

  // 2. Test loadImage with absolute path, relative path, and data URL
  console.log("\nStep 2: Validating loadImage() handling of various formats...");
  const { loadImage } = await import("../src/lib/image-processing/load-image.ts");

  // A. Absolute Windows path
  const absoluteLoaded = await loadImage(rawFilePath);
  assert.equal(absoluteLoaded.buffer.length, rawDslrBuffer.length, "loadImage must read absolute filesystem paths");
  console.log("✓ loadImage() successfully loaded absolute path directly without throwing");

  // B. App-local public URL
  const relativeLoaded = await loadImage("/results/test-dslr-session/captures/test-raw.jpg");
  assert.equal(relativeLoaded.buffer.length, rawDslrBuffer.length, "loadImage must resolve /results/... public URLs");
  console.log("✓ loadImage() successfully loaded app-local public URL");

  // C. Data URL
  const dataUrlLoaded = await loadImage(`data:image/jpeg;base64,${rawDslrBuffer.toString("base64")}`);
  assert.equal(dataUrlLoaded.buffer.length, rawDslrBuffer.length, "loadImage must decode data URLs");
  console.log("✓ loadImage() successfully decoded data URL");

  // 3. Test generateDccDisplayImage
  console.log("\nStep 3: Validating generateDccDisplayImage() on raw Canon JPEG...");
  const { generateDccDisplayImage } = await import("../src/lib/image-processing/dcc-display.ts");

  const displayResult = await generateDccDisplayImage({
    rawFilePath,
    displayFilePath,
    background: { color: "#f7f3ee" },
    greenScreenTuning: { applyChromaKey: true, greenMin: 70, greenTolerance: 35 },
  });

  assert.equal(displayResult.ok, true, "generateDccDisplayImage must succeed");
  assert.equal(displayResult.width, 5184, "Raw dimensions must be 5184");
  assert.equal(displayResult.height, 3456, "Raw dimensions must be 3456");
  assert.equal(displayResult.hasAlpha, true, "Output PNG must have 4 channels and alpha");
  console.log(`✓ Display PNG created: ${displayFilePath} (${displayResult.displaySize} bytes, hasAlpha=${displayResult.hasAlpha})`);

  // 4. Test composition with synthetic photos: P1 -> BG01, P2 -> BG04, P3 -> BG08
  console.log("\nStep 4: Validating per-photo backgrounds & slot assignment permutation...");
  const { composeFinalImages } = await import("../src/lib/image-processing/compose-final.ts");

  const p1Path = path.join(testDir, "p1-raw.jpg");
  const p2Path = path.join(testDir, "p2-raw.jpg");
  const p3Path = path.join(testDir, "p3-raw.jpg");

  await fs.writeFile(p1Path, rawDslrBuffer);
  await fs.writeFile(p2Path, rawDslrBuffer);
  await fs.writeFile(p3Path, rawDslrBuffer);

  const capturedPhotos = [
    { raw: "/results/test-dslr-session/captures/p1-raw.jpg", display: "/results/test-dslr-session/captures/p1-raw.jpg", backgroundId: "background-01" },
    { raw: "/results/test-dslr-session/captures/p2-raw.jpg", display: "/results/test-dslr-session/captures/p2-raw.jpg", backgroundId: "background-04" },
    { raw: "/results/test-dslr-session/captures/p3-raw.jpg", display: "/results/test-dslr-session/captures/p3-raw.jpg", backgroundId: "background-08" },
  ];

  // Permutation: slot 0 = P3 (BG08), slot 1 = P1 (BG01), slot 2 = P2 (BG04)
  const slotAssignments = [
    { slotIndex: 0, photoRaw: capturedPhotos[2].raw, backgroundId: "background-08" },
    { slotIndex: 1, photoRaw: capturedPhotos[0].raw, backgroundId: "background-01" },
    { slotIndex: 2, photoRaw: capturedPhotos[1].raw, backgroundId: "background-04" },
  ];

  const composed = await composeFinalImages({
    sessionId: "test-dslr-session",
    capturedPhotos,
    selectedFrameId: "frame-2",
    selectedBackgroundId: "background-01",
    slotAssignments,
    options: { applyChromaKey: true },
  });

  assert.ok(composed.finalScreenPng, "composeFinalImages must return finalScreenPng buffer");
  assert.ok(composed.finalScreenPng.length > 1000, "finalScreenPng buffer must be non-empty");

  const composedMeta = await sharp(composed.finalScreenPng).metadata();
  assert.equal(composedMeta.channels, 4, "Final composed screen image must have 4 channels");
  console.log(`✓ composeFinalImages succeeded with slot permutation | output size: ${composed.finalScreenPng.length} bytes (${composedMeta.width}x${composedMeta.height})`);

  // Cleanup test artifacts
  await fs.rm(path.join(projectRoot, "public", "results", "test-dslr-session"), { recursive: true, force: true });
  console.log("✓ Test session artifacts cleaned up");

  console.log("\n==================================================");
  console.log("ALL DETERMINISTIC DSLR PIPELINE TESTS PASSED!");
  console.log("==================================================");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
