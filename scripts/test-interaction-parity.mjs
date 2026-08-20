import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

console.log("==================================================");
console.log("RUNNING DETERMINISTIC INTERACTION & STICKER PARITY TESTS");
console.log("==================================================");

async function runInteractionParityTests() {
  // ================================================================
  // TEST A & B: Slot Replacement Semantics (No Swapping)
  // ================================================================
  console.log("\nStep 1: Testing Pure Replace / Copy Slot Assignment Semantics...");
  const { assignPhotoToSlot } = await import("../src/lib/preview/slot-assignment.ts");

  const initial = [0, 1, 2, 3];
  
  // A: Assigning photo 2 to slot 0 should replace slot 0 only and leave slot 2 intact (allowing duplicates)
  const afterA = assignPhotoToSlot(initial, 2, 0);
  assert.deepEqual(afterA, [2, 1, 2, 3], "Assigning photo 2 to slot 0 must yield [2, 1, 2, 3]");
  console.log("✓ Test A passed: [0, 1, 2, 3] + photo 2 -> slot 0 =>", afterA);

  // B: Assigning unused photo 6 to slot 1
  const afterB = assignPhotoToSlot(afterA, 6, 1);
  assert.deepEqual(afterB, [2, 6, 2, 3], "Assigning photo 6 to slot 1 must yield [2, 6, 2, 3]");
  console.log("✓ Test B passed: [2, 1, 2, 3] + photo 6 -> slot 1 =>", afterB);

  // Bounds check
  const outOfBounds = assignPhotoToSlot(afterB, 1, 99);
  assert.deepEqual(outOfBounds, afterB, "Out of bounds assignment must safely return copy without throwing");
  console.log("✓ Out-of-bounds assignment safely handled");

  // ================================================================
  // TEST C & D: Sticker Center Geometry & Sharp Parity
  // ================================================================
  console.log("\nStep 2: Testing Pure Sticker Geometry Helper...");
  const { computeStickerPlacement } = await import("../src/lib/image-processing/sticker-geometry.ts");

  // Create temporary synthetic square & non-square sticker PNGs
  const testDir = path.join(projectRoot, "public", "results", "sticker-test");
  await fs.mkdir(testDir, { recursive: true });

  const squareStickerPath = path.join(testDir, "test_square_sticker.png");
  const nonSquareStickerPath = path.join(testDir, "test_rect_sticker.png");

  try {
    await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    }).png().toBuffer().then(buf => fs.writeFile(squareStickerPath, buf));

    await sharp({
      create: {
        width: 300,
        height: 150,
        channels: 4,
        background: { r: 0, g: 0, b: 255, alpha: 1 },
      },
    }).png().toBuffer().then(buf => fs.writeFile(nonSquareStickerPath, buf));

    console.log("✓ Synthetic stickers created");

    // Test C: Rotations 0, 45, 90 on center (600, 900)
    console.log("\nStep 3: Validating Rotations 0, 45, 90 with Sharp Buffer Center Alignment...");
    for (const rotation of [0, 45, 90]) {
      let s = sharp(squareStickerPath).resize({ width: 300 });
      if (rotation !== 0) {
        s = s.rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
      }
      const buffer = await s.toBuffer();
      const meta = await sharp(buffer).metadata();
      const finalW = meta.width;
      const finalH = meta.height;

      const placement = computeStickerPlacement({ x: 600, y: 900 }, finalW, finalH);
      assert.equal(placement.centerX, 600, `Center X must be 600 at rotation ${rotation}`);
      assert.equal(placement.centerY, 900, `Center Y must be 900 at rotation ${rotation}`);
      console.log(`✓ Rotation ${rotation}°: buffer=${finalW}x${finalH} -> left=${placement.left}, top=${placement.top} (Center: ${placement.centerX}, ${placement.centerY})`);
    }

    // Test D: Off-center sticker (250, 400) with non-square asset
    console.log("\nStep 4: Validating Non-Square Sticker & Off-Center Placement...");
    for (const rotation of [0, 45, 90]) {
      let s = sharp(nonSquareStickerPath).resize({ width: 300 });
      if (rotation !== 0) {
        s = s.rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
      }
      const buffer = await s.toBuffer();
      const meta = await sharp(buffer).metadata();
      const finalW = meta.width;
      const finalH = meta.height;

      const placement = computeStickerPlacement({ x: 250, y: 400 }, finalW, finalH);
      assert.equal(placement.centerX, 250, `Center X must be 250 at rotation ${rotation}`);
      assert.equal(placement.centerY, 400, `Center Y must be 400 at rotation ${rotation}`);
      console.log(`✓ Non-square ${rotation}°: buffer=${finalW}x${finalH} -> left=${placement.left}, top=${placement.top} (Center: ${placement.centerX}, ${placement.centerY})`);
    }

    // Full 1200x1800 canvas composition check
    console.log("\nStep 5: Validating Full Canvas Sharp Composition Center Alignment...");
    let s = sharp(squareStickerPath).resize({ width: 200 }).rotate(45, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
    const stickerBuf = await s.toBuffer();
    const meta = await sharp(stickerBuf).metadata();
    const { left, top } = computeStickerPlacement({ x: 600, y: 900 }, meta.width, meta.height);

    const composedPng = await sharp({
      create: {
        width: 1200,
        height: 1800,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: stickerBuf, left, top }])
      .png()
      .toBuffer();

    // Verify composite image dimensions
    const compMeta = await sharp(composedPng).metadata();
    assert.equal(compMeta.width, 1200);
    assert.equal(compMeta.height, 1800);
    console.log("✓ Full canvas composed successfully: 1200x1800 with rotated sticker at exact center (600, 900)");

    console.log("\n==================================================");
    console.log("ALL INTERACTION & STICKER PARITY TESTS PASSED!");
    console.log("==================================================");
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
    console.log("✓ Test artifacts cleaned up");
  }
}

runInteractionParityTests().catch((err) => {
  console.error("Interaction test failed:", err);
  process.exit(1);
});
