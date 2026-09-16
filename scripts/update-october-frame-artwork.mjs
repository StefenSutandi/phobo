import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const UPDATED_FRAME_IDS = [1, 2, 3, 4, 5, 7, 8, 9];
const EXTRACT_DIR = path.join(projectRoot, ".tmp/october-frames");
const OLD_COMMIT = "7b51011";
const HEADER_MAX_Y = 180; // Wording is contained in y < 160; slots start at y >= 190

async function main() {
  console.log("==================================================");
  console.log("OCTOBER FRAME ARTWORK UPDATE — STRICT HEADER ROI");
  console.log(`Authoritative OLD commit: ${OLD_COMMIT}`);
  console.log(`Header ROI: y = 0..${HEADER_MAX_Y}`);
  console.log("==================================================");

  // 1. Audit extracted October files
  console.log(`\nChecking extracted October frames in: ${EXTRACT_DIR}`);
  for (const id of UPDATED_FRAME_IDS) {
    const filePath = path.join(EXTRACT_DIR, `${id}.png`);
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`Missing expected October frame file: ${filePath}`);
    }
    const meta = await sharp(filePath).metadata();
    console.log(`  October ${id}.png: ${meta.width}x${meta.height}, channels=${meta.channels}, format=${meta.format}`);
    if (meta.width !== 1200 || meta.height !== 1800) {
      throw new Error(`Invalid dimensions for ${id}.png: expected 1200x1800, got ${meta.width}x${meta.height}`);
    }
  }

  // 2. Extract and audit authoritative baseline production frames from OLD_COMMIT
  console.log(`\nExtracting baseline production frames from git commit ${OLD_COMMIT}...`);
  const oldAlphaHashes = new Map();
  const oldAlphaBuffers = new Map();
  const oldRawBuffers = new Map();

  for (const id of UPDATED_FRAME_IDS) {
    const gitCmd = `git show ${OLD_COMMIT}:public/assets/frames/${id}.png`;
    const oldPngBuffer = execSync(gitCmd, { cwd: projectRoot, maxBuffer: 20 * 1024 * 1024 });
    const img = sharp(oldPngBuffer);
    const meta = await img.metadata();
    if (meta.width !== 1200 || meta.height !== 1800 || meta.channels !== 4) {
      throw new Error(`Baseline commit ${OLD_COMMIT} ${id}.png unexpected meta: ${meta.width}x${meta.height}, channels=${meta.channels}`);
    }

    const raw = await img.raw().toBuffer();
    oldRawBuffers.set(id, raw);

    // Extract alpha channel
    const alpha = Buffer.alloc(1200 * 1800);
    for (let i = 0; i < 1200 * 1800; i++) {
      alpha[i] = raw[i * 4 + 3];
    }
    oldAlphaBuffers.set(id, alpha);

    const hash = crypto.createHash("sha256").update(alpha).digest("hex");
    oldAlphaHashes.set(id, hash);
    console.log(`  Baseline Frame ${id}: alpha SHA256 = ${hash}`);
  }

  // 3. Process each frame: Merge New RGB in Header ROI + Old Pixel Data Everywhere Else
  console.log("\nMerging October RGB within Header ROI (preserving exact Baseline below ROI & exact Alpha)...");
  const diagnostics = [];

  for (const id of UPDATED_FRAME_IDS) {
    const newPath = path.join(EXTRACT_DIR, `${id}.png`);
    const newImg = sharp(newPath);
    const newMeta = await newImg.metadata();
    const newRaw = await newImg.raw().toBuffer();
    const newChannels = newMeta.channels;

    const oldRaw = oldRawBuffers.get(id);
    const mergedRaw = Buffer.alloc(1200 * 1800 * 4);

    let changedOpaquePixels = 0;
    let minX = 1200, minY = 1800, maxX = 0, maxY = 0;
    let changedPixelsBelowROI = 0;

    for (let y = 0; y < 1800; y++) {
      for (let x = 0; x < 1200; x++) {
        const i = y * 1200 + x;
        const oldAlpha = oldRaw[i * 4 + 3];
        const oldR = oldRaw[i * 4 + 0];
        const oldG = oldRaw[i * 4 + 1];
        const oldB = oldRaw[i * 4 + 2];

        let r, g, b, a;

        if (y < HEADER_MAX_Y) {
          // Inside Header ROI:
          a = oldAlpha;
          if (oldAlpha >= 250) {
            r = newRaw[i * newChannels + 0];
            g = newRaw[i * newChannels + 1];
            b = newRaw[i * newChannels + 2];

            if (r !== oldR || g !== oldG || b !== oldB) {
              changedOpaquePixels++;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          } else {
            // Anti-aliased edge or transparent aperture in header: preserve old RGB
            r = oldR;
            g = oldG;
            b = oldB;
          }
        } else {
          // Outside Header ROI (Body of frame): 100% byte-for-byte exact OLD production pixel
          r = oldR;
          g = oldG;
          b = oldB;
          a = oldAlpha;

          // Double check invariant
          if (r !== oldR || g !== oldG || b !== oldB || a !== oldAlpha) {
            changedPixelsBelowROI++;
          }
        }

        mergedRaw[i * 4 + 0] = r;
        mergedRaw[i * 4 + 1] = g;
        mergedRaw[i * 4 + 2] = b;
        mergedRaw[i * 4 + 3] = a;
      }
    }

    if (changedPixelsBelowROI > 0) {
      throw new Error(`CRITICAL: Frame ${id} has ${changedPixelsBelowROI} modified pixels below header ROI!`);
    }

    if (maxY >= HEADER_MAX_Y) {
      throw new Error(`CRITICAL: Frame ${id} changed bounding box maxY (${maxY}) exceeds HEADER_MAX_Y (${HEADER_MAX_Y})!`);
    }

    const diag = {
      id,
      changedOpaquePixels,
      boundingBox: changedOpaquePixels > 0 ? { minX, minY, maxX, maxY } : null,
    };
    diagnostics.push(diag);

    console.log(`\nFrame ${id} Diagnostics:`);
    console.log(`  Changed opaque pixels: ${changedOpaquePixels}`);
    if (diag.boundingBox) {
      console.log(`  Changed bounding box: (${diag.boundingBox.minX}, ${diag.boundingBox.minY}) -> (${diag.boundingBox.maxX}, ${diag.boundingBox.maxY}) [W=${diag.boundingBox.maxX - diag.boundingBox.minX + 1}, H=${diag.boundingBox.maxY - diag.boundingBox.minY + 1}]`);
    }

    // Write merged file to production location
    const prodPath = path.join(projectRoot, `public/assets/frames/${id}.png`);
    await sharp(mergedRaw, {
      raw: { width: 1200, height: 1800, channels: 4 },
    })
      .png({ compressionLevel: 9 })
      .toFile(prodPath);

    // 4. Verification: Re-read written PNG and assert alpha channel byte-for-byte SHA256 parity & byte equality below ROI
    const writtenImg = sharp(prodPath);
    const writtenMeta = await writtenImg.metadata();
    const writtenRaw = await writtenImg.raw().toBuffer();

    // Check pixel-by-pixel below ROI against oldRaw
    for (let y = HEADER_MAX_Y; y < 1800; y++) {
      for (let x = 0; x < 1200; x++) {
        const i = (y * 1200 + x) * 4;
        if (
          writtenRaw[i + 0] !== oldRaw[i + 0] ||
          writtenRaw[i + 1] !== oldRaw[i + 1] ||
          writtenRaw[i + 2] !== oldRaw[i + 2] ||
          writtenRaw[i + 3] !== oldRaw[i + 3]
        ) {
          throw new Error(`Pixel mismatch in Frame ${id} at (${x}, ${y}) below ROI!`);
        }
      }
    }
    console.log(`  ✓ Verified: 100% byte-for-byte identical below y >= ${HEADER_MAX_Y}`);

    const writtenAlpha = Buffer.alloc(1200 * 1800);
    for (let i = 0; i < 1200 * 1800; i++) {
      writtenAlpha[i] = writtenRaw[i * 4 + 3];
    }
    const writtenAlphaHash = crypto.createHash("sha256").update(writtenAlpha).digest("hex");
    const expectedHash = oldAlphaHashes.get(id);

    if (writtenAlphaHash !== expectedHash) {
      throw new Error(`CRITICAL: Frame ${id} alpha hash mismatch!\nExpected: ${expectedHash}\nGot:      ${writtenAlphaHash}`);
    }

    console.log(`  ✓ Verified: Alpha SHA256 byte-for-byte match (${writtenAlphaHash.slice(0, 16)}...)`);
  }

  // 5. Checkerboard Detection & Background Cleanliness Test
  console.log("\n==================================================");
  console.log("RUNNING CHECKERBOARD DETECTION TESTS");
  console.log("==================================================");

  for (const id of UPDATED_FRAME_IDS) {
    const prodPath = path.join(projectRoot, `public/assets/frames/${id}.png`);
    
    // Composite over solid red #ff0000
    const overRed = await sharp({
      create: {
        width: 1200,
        height: 1800,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .composite([{ input: prodPath, blend: "over" }])
      .raw()
      .toBuffer();

    // Composite over solid green #00ff00
    const overGreen = await sharp({
      create: {
        width: 1200,
        height: 1800,
        channels: 4,
        background: { r: 0, g: 255, b: 0, alpha: 1 },
      },
    })
      .composite([{ input: prodPath, blend: "over" }])
      .raw()
      .toBuffer();

    // Check frame slots from frame-slots.json
    const frameSlots = JSON.parse(
      await fs.readFile(path.join(projectRoot, "public/assets/frames/frame-slots.json"), "utf-8")
    );
    const frameData = frameSlots.find((f) => f.id === `frame-${id}`);

    if (frameData) {
      for (let s = 0; s < frameData.photoSlots.length; s++) {
        const slot = frameData.photoSlots[s];
        // Center of slot must be pure background color (A=0 in frame)
        const cx = Math.round(slot.x + slot.width / 2);
        const cy = Math.round(slot.y + slot.height / 2);
        const redIdx = (cy * 1200 + cx) * 4;
        const greenIdx = (cy * 1200 + cx) * 4;

        const rOverRed = overRed[redIdx], gOverRed = overRed[redIdx + 1], bOverRed = overRed[redIdx + 2];
        const rOverGreen = overGreen[greenIdx], gOverGreen = overGreen[greenIdx + 1], bOverGreen = overGreen[greenIdx + 2];

        if (rOverRed !== 255 || gOverRed !== 0 || bOverRed !== 0) {
          throw new Error(`Frame ${id} slot ${s} center (${cx},${cy}) shows foreground/checkerboard over red: RGB(${rOverRed},${gOverRed},${bOverRed})`);
        }
        if (rOverGreen !== 0 || gOverGreen !== 255 || bOverGreen !== 0) {
          throw new Error(`Frame ${id} slot ${s} center (${cx},${cy}) shows foreground/checkerboard over green: RGB(${rOverGreen},${gOverGreen},${bOverGreen})`);
        }
      }
      console.log(`✓ Frame ${id}: All ${frameData.photoSlots.length} aperture centers show clean transparent background`);
    }
  }

  // Specific Frame 8 Heart Verification
  console.log("\n==================================================");
  console.log("SPECIFIC FRAME 8 (HEART) GEOMETRY AUDIT");
  console.log("==================================================");
  const f8Path = path.join(projectRoot, "public/assets/frames/8.png");
  const f8Raw = await sharp(f8Path).raw().toBuffer();
  const getF8Alpha = (px, py) => f8Raw[(py * 1200 + px) * 4 + 3];

  const frameSlots = JSON.parse(
    await fs.readFile(path.join(projectRoot, "public/assets/frames/frame-slots.json"), "utf-8")
  );
  const f8Meta = frameSlots.find((f) => f.id === "frame-8");

  for (let s = 0; s < f8Meta.photoSlots.length; s++) {
    const slot = f8Meta.photoSlots[s];
    const topNotch = getF8Alpha(Math.round(slot.x + slot.width / 2), Math.round(slot.y + 10));
    const leftLobe = getF8Alpha(Math.round(slot.x + slot.width * 0.25), Math.round(slot.y + slot.height * 0.25));
    const rightLobe = getF8Alpha(Math.round(slot.x + slot.width * 0.75), Math.round(slot.y + slot.height * 0.25));
    const center = getF8Alpha(Math.round(slot.x + slot.width / 2), Math.round(slot.y + slot.height / 2));
    const bottomTip = getF8Alpha(Math.round(slot.x + slot.width / 2), Math.round(slot.y + slot.height * 0.85));
    const topLeft = getF8Alpha(Math.round(slot.x + 5), Math.round(slot.y + 5));

    console.log(`  Slot ${s}: topNotch=${topNotch} (opaque), lobes=[${leftLobe},${rightLobe}] (trans), center=${center} (trans), tip=${bottomTip} (trans), corner=${topLeft} (opaque)`);

    if (topNotch < 200) throw new Error(`Frame 8 slot ${s} heart top notch lost opacity: ${topNotch}`);
    if (leftLobe > 50) throw new Error(`Frame 8 slot ${s} heart left lobe lost transparency: ${leftLobe}`);
    if (rightLobe > 50) throw new Error(`Frame 8 slot ${s} heart right lobe lost transparency: ${rightLobe}`);
    if (center > 50) throw new Error(`Frame 8 slot ${s} heart center lost transparency: ${center}`);
    if (bottomTip > 50) throw new Error(`Frame 8 slot ${s} heart bottom tip lost transparency: ${bottomTip}`);
  }
  console.log("✓ Frame 8: Heart aperture geometry verified 100% intact");

  // 6. Generate temporary visual contact sheet for QA
  console.log("\n==================================================");
  console.log("GENERATING QA CONTACT SHEET");
  console.log("==================================================");
  const contactWidth = 4 * 300; // 4 columns
  const contactHeight = 2 * 450; // 2 rows
  const compositeList = [];

  for (let i = 0; i < UPDATED_FRAME_IDS.length; i++) {
    const id = UPDATED_FRAME_IDS[i];
    const col = i % 4;
    const row = Math.floor(i / 4);
    const left = col * 300;
    const top = row * 450;

    const thumb = await sharp(path.join(projectRoot, `public/assets/frames/${id}.png`))
      .resize(290, 435, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    compositeList.push({
      input: thumb,
      left: left + 5,
      top: top + 5,
    });
  }

  const contactSheet = await sharp({
    create: {
      width: contactWidth,
      height: contactHeight,
      channels: 4,
      background: { r: 30, g: 41, b: 59, alpha: 1 }, // Slate dark blue
    },
  })
    .composite(compositeList)
    .png()
    .toBuffer();

  const contactSheetPath = path.join(projectRoot, ".tmp/october-contact-sheet.png");
  await fs.writeFile(contactSheetPath, contactSheet);
  console.log(`✓ QA Contact sheet saved to: ${contactSheetPath}`);

  console.log("\n==================================================");
  console.log("ALL 8 OCTOBER FRAMES STRICTLY RESTRICTED TO HEADER ROI & VERIFIED!");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
