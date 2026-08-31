import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const masksDir = path.join(projectRoot, "public", "assets", "frames", "masks");

export async function generateFrameMasks() {
  await fs.mkdir(masksDir, { recursive: true });

  const frameSlotsPath = path.join(projectRoot, "public/assets/frames/frame-slots.json");
  const frameSlots = JSON.parse(await fs.readFile(frameSlotsPath, "utf-8"));

  console.log("Generating deterministic template aperture masks for all 18 frames...");

  for (const frame of frameSlots) {
    const pngPath = path.join(projectRoot, "public", frame.templateUrl);
    const templateImg = sharp(pngPath);
    const meta = await templateImg.metadata();
    
    // Normalize to exact frame width and height if needed
    const normalizedTemplate = await sharp(pngPath)
      .resize({ width: frame.width, height: frame.height, fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    for (let s = 0; s < frame.photoSlots.length; s++) {
      const slot = frame.photoSlots[s];
      const { x, y, width, height } = slot;

      // Extract raw alpha for this slot
      const maskRaw = Buffer.alloc(width * height * 4);
      let transparentHolePixels = 0;
      let opaqueArtworkPixels = 0;

      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const globalX = Math.max(0, Math.min(frame.width - 1, x + px));
          const globalY = Math.max(0, Math.min(frame.height - 1, y + py));
          const srcIdx = (globalY * frame.width + globalX) * 4;
          const templateAlpha = normalizedTemplate.data[srcIdx + 3];

          // Invert: template hole (alpha 0) -> mask alpha 255
          // template border (alpha 255) -> mask alpha 0
          const maskAlpha = 255 - templateAlpha;
          
          if (templateAlpha < 50) transparentHolePixels++;
          if (templateAlpha > 200) opaqueArtworkPixels++;

          const destIdx = (py * width + px) * 4;
          maskRaw[destIdx + 0] = 255;
          maskRaw[destIdx + 1] = 255;
          maskRaw[destIdx + 2] = 255;
          maskRaw[destIdx + 3] = maskAlpha;
        }
      }

      const maskFileName = `${frame.id}-slot-${s}.png`;
      const maskFilePath = path.join(masksDir, maskFileName);
      const maskUrl = `/assets/frames/masks/${maskFileName}`;

      const maskBuffer = await sharp(maskRaw, {
        raw: { width, height, channels: 4 }
      }).png().toBuffer();

      await fs.writeFile(maskFilePath, maskBuffer);

      slot.maskUrl = maskUrl;
    }
  }

  // Update frame-slots.json with maskUrl
  await fs.writeFile(frameSlotsPath, JSON.stringify(frameSlots, null, 2), "utf-8");
  console.log("✓ All 18 frame aperture masks generated in public/assets/frames/masks/ and registered in frame-slots.json");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateFrameMasks().catch((err) => {
    console.error("Error generating frame masks:", err);
    process.exit(1);
  });
}
