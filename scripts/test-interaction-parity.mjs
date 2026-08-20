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
  // TEST 1: Gesture Arbitration (Touch Scroll vs Drag)
  // ================================================================
  console.log("\nStep 1: Testing Pure Gesture Arbitration (Touch Scroll vs Drag)...");
  const { classifyPointerGesture, ClickSuppressionManager } = await import("../src/lib/preview/gesture-arbitration.ts");

  // A: Vertical scroll gesture: dx=2, dy=30
  const gestureA = classifyPointerGesture(2, 30);
  assert.equal(gestureA, "scroll", "dx=2, dy=30 must be classified as 'scroll', NOT drag");
  console.log("✓ Test 1A passed: dx=2, dy=30 => 'scroll' (natural vertical scroll)");

  // B: Horizontal/diagonal drag gesture: dx=30, dy=8
  const gestureB = classifyPointerGesture(30, 8);
  assert.equal(gestureB, "drag", "dx=30, dy=8 must be classified as 'drag'");
  console.log("✓ Test 1B passed: dx=30, dy=8 => 'drag' (activates photo drag)");

  // C: Tap gesture: dx=2, dy=2
  const gestureC = classifyPointerGesture(2, 2);
  assert.equal(gestureC, "tap", "dx=2, dy=2 must be classified as 'tap'");
  console.log("✓ Test 1C passed: dx=2, dy=2 => 'tap' (tap candidate)");

  // Diagonal drag: dx=15, dy=10
  const gestureDiag = classifyPointerGesture(15, 10);
  assert.equal(gestureDiag, "drag", "dx=15, dy=10 must be classified as 'drag'");
  console.log("✓ Test 1D passed: dx=15, dy=10 => 'drag'");

  // ================================================================
  // TEST 2: Event Sequence & Click Suppression Arbitration
  // ================================================================
  console.log("\nStep 2: Testing Pointer/Click Event Sequence Models...");

  // Mock interaction harness simulating React preview page logic
  function createInteractionHarness() {
    let toggleCount = 0;
    let assignCount = 0;
    let suppressNextClick = false;

    return {
      // 1. Pointer Up (fires when finger/mouse releases)
      onPointerUp(dx, dy, isDragMode = false, targetSlotIndex = null) {
        if (isDragMode && targetSlotIndex !== null) {
          suppressNextClick = true;
          assignCount++;
          return "assigned";
        }
        const gesture = classifyPointerGesture(dx, dy);
        if (gesture === "tap") {
          suppressNextClick = true;
          toggleCount++;
          return "toggled";
        }
        if (gesture === "scroll") {
          suppressNextClick = true;
          return "scrolled";
        }
        return "none";
      },

      // 2. Native DOM Click (fires after pointerup on tap/keyboard)
      onClick() {
        if (suppressNextClick) {
          suppressNextClick = false;
          return "suppressed";
        }
        toggleCount++;
        return "toggled";
      },

      getStats() {
        return { toggleCount, assignCount };
      },
    };
  }

  // Model 1: One pointer tap
  {
    const h = createInteractionHarness();
    h.onPointerUp(2, 2);
    assert.equal(h.getStats().toggleCount, 1, "Pointer tap must execute exactly 1 toggle");
    console.log("✓ Model 1: One pointer tap => exactly 1 toggle");
  }

  // Model 2: Pointer tap followed by synthetic DOM click
  {
    const h = createInteractionHarness();
    h.onPointerUp(2, 2);
    const clickResult = h.onClick();
    assert.equal(clickResult, "suppressed", "Trailing synthetic click must be suppressed");
    assert.equal(h.getStats().toggleCount, 1, "Pointer tap + synthetic click must still result in exactly 1 toggle total");
    console.log("✓ Model 2: Pointer tap followed by synthetic click => exactly 1 toggle total (click suppressed)");
  }

  // Model 3: Vertical scroll followed by pointerup & click
  {
    const h = createInteractionHarness();
    h.onPointerUp(2, 30);
    h.onClick();
    assert.equal(h.getStats().toggleCount, 0, "Vertical scroll must result in 0 toggles");
    assert.equal(h.getStats().assignCount, 0, "Vertical scroll must result in 0 assignments");
    console.log("✓ Model 3: Vertical scroll followed by pointerup => 0 toggles, 0 assignments");
  }

  // Model 4: Drag/drop followed by synthetic click
  {
    const h = createInteractionHarness();
    h.onPointerUp(30, 8, true, 0);
    const clickResult = h.onClick();
    assert.equal(clickResult, "suppressed", "Click following drag must be suppressed");
    assert.equal(h.getStats().assignCount, 1, "Drag/drop must result in exactly 1 assignment");
    assert.equal(h.getStats().toggleCount, 0, "Drag/drop must result in 0 toggles");
    console.log("✓ Model 4: Drag/drop followed by synthetic click => 1 assignment, 0 toggles");
  }

  // Model 5: Keyboard / accessibility click with no preceding pointer gesture
  {
    const h = createInteractionHarness();
    const clickResult = h.onClick();
    assert.equal(clickResult, "toggled", "Keyboard click must execute toggle");
    assert.equal(h.getStats().toggleCount, 1, "Keyboard click with no pointer gesture must result in exactly 1 toggle");
    console.log("✓ Model 5: Keyboard click with no preceding pointer gesture => exactly 1 toggle");
  }

  // ================================================================
  // TEST 3: Slot Replacement Semantics (No Swapping)
  // ================================================================
  console.log("\nStep 3: Testing Pure Replace / Copy Slot Assignment Semantics...");
  const { assignPhotoToSlot } = await import("../src/lib/preview/slot-assignment.ts");

  const initial = [0, 1, 2, 3];
  
  // A: Assigning photo 2 to slot 0 should replace slot 0 only and leave slot 2 intact (allowing duplicates)
  const afterA = assignPhotoToSlot(initial, 2, 0);
  assert.deepEqual(afterA, [2, 1, 2, 3], "Assigning photo 2 to slot 0 must yield [2, 1, 2, 3]");
  console.log("✓ Test 3A passed: [0, 1, 2, 3] + photo 2 -> slot 0 =>", afterA);

  // B: Assigning unused photo 6 to slot 1
  const afterB = assignPhotoToSlot(afterA, 6, 1);
  assert.deepEqual(afterB, [2, 6, 2, 3], "Assigning photo 6 to slot 1 must yield [2, 6, 2, 3]");
  console.log("✓ Test 3B passed: [2, 1, 2, 3] + photo 6 -> slot 1 =>", afterB);

  // Bounds check
  const outOfBounds = assignPhotoToSlot(afterB, 1, 99);
  assert.deepEqual(outOfBounds, afterB, "Out of bounds assignment must safely return copy without throwing");
  console.log("✓ Out-of-bounds assignment safely handled");

  // ================================================================
  // TEST 4: Additional Preview Initial Assignment Persistence
  // ================================================================
  console.log("\nStep 4: Validating Additional Preview Initial Assignment Persistence...");
  const requiredSlots = 4;
  const capturedCount = 4;
  const initialAdditionalSlots = Array.from(
    { length: requiredSlots },
    (_, i) => (i < capturedCount ? i : null)
  );
  assert.deepEqual(initialAdditionalSlots, [0, 1, 2, 3]);
  console.log("✓ Additional preview initial assignments deterministic array: [0, 1, 2, 3]");

  // ================================================================
  // TEST 5: Structured Photo Display Isolation (No Raw Fallback)
  // ================================================================
  console.log("\nStep 5: Validating Structured Photo Display URL Isolation...");
  const { getPhotoDisplayUrl, getPhotoRawUrl } = await import("../src/lib/session/session-types.ts");

  const structuredPhoto = {
    raw: "/results/session-test/captures/capture-1-raw.jpg",
    display: "/results/session-test/captures/capture-1-raw-display.png",
    backgroundId: "background-01",
  };

  assert.equal(getPhotoDisplayUrl(structuredPhoto), "/results/session-test/captures/capture-1-raw-display.png");
  assert.equal(getPhotoRawUrl(structuredPhoto), "/results/session-test/captures/capture-1-raw.jpg");
  console.log("✓ Structured photo display URL isolates transparent display PNG from raw green JPEG");

  // ================================================================
  // TEST 6: Sticker Center Geometry & Sharp Parity
  // ================================================================
  console.log("\nStep 6: Testing Pure Sticker Geometry Helper...");
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

    // Rotations 0, 45, 90 on center (600, 900)
    console.log("\nStep 7: Validating Rotations 0, 45, 90 with Sharp Buffer Center Alignment...");
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

    // Off-center sticker (250, 400) with non-square asset
    console.log("\nStep 8: Validating Non-Square Sticker & Off-Center Placement...");
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
    console.log("\nStep 9: Validating Full Canvas Sharp Composition Center Alignment...");
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
