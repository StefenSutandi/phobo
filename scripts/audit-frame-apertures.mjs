import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

async function audit() {
  const frameSlots = JSON.parse(
    await fs.readFile(path.join(projectRoot, "public/assets/frames/frame-slots.json"), "utf-8")
  );

  console.log("==================================================");
  console.log("AUDITING ALL 18 FRAME TEMPLATE APERTURES");
  console.log("==================================================");

  for (const frame of frameSlots) {
    const pngPath = path.join(projectRoot, "public", frame.templateUrl);
    const img = sharp(pngPath);
    const meta = await img.metadata();
    const raw = await img.raw().toBuffer();
    const channels = meta.channels;

    console.log(`\nFrame: ${frame.id} (${frame.name}) - ${frame.templateUrl} (${meta.width}x${meta.height})`);

    for (let i = 0; i < frame.photoSlots.length; i++) {
      const slot = frame.photoSlots[i];
      const { x, y, width, height } = slot;

      // Extract alpha channel for this slot
      const getAlpha = (px, py) => {
        const cx = Math.max(0, Math.min(meta.width - 1, Math.round(px)));
        const cy = Math.max(0, Math.min(meta.height - 1, Math.round(py)));
        const idx = (cy * meta.width + cx) * channels;
        return channels === 4 ? raw[idx + 3] : 255;
      };

      // Test specific sample points:
      // In template artwork:
      // Transparent (A=0) = hole where photo shows
      // Opaque (A=255) = frame artwork

      const topLeft = getAlpha(x + 5, y + 5);
      const topRight = getAlpha(x + width - 5, y + 5);
      const bottomLeft = getAlpha(x + 5, y + height - 5);
      const bottomRight = getAlpha(x + width - 5, y + height - 5);
      const center = getAlpha(x + width / 2, y + height / 2);
      
      // Top indentation test (for heart/love: top-middle is opaque A=255, while left/right upper lobes are transparent A=0)
      const topCenter = getAlpha(x + width / 2, y + 10);
      const leftLobe = getAlpha(x + width * 0.25, y + height * 0.25);
      const rightLobe = getAlpha(x + width * 0.75, y + height * 0.25);
      const bottomPoint = getAlpha(x + width / 2, y + height * 0.85);

      // Check overall transparency ratio in slot
      let transparentCount = 0;
      let totalSamples = 0;
      for (let sy = 0; sy < height; sy += 5) {
        for (let sx = 0; sx < width; sx += 5) {
          totalSamples++;
          if (getAlpha(x + sx, y + sy) < 50) {
            transparentCount++;
          }
        }
      }
      const transRatio = (transparentCount / totalSamples).toFixed(2);

      let shapeDesc = "rect";
      if (topCenter > 150 && leftLobe < 50 && rightLobe < 50 && center < 50 && bottomPoint < 50 && (topLeft > 150 && topRight > 150 && bottomLeft > 150 && bottomRight > 150)) {
        shapeDesc = "heart / love";
      } else if (topLeft > 150 && topRight > 150 && bottomLeft > 150 && bottomRight > 150 && center < 50) {
        shapeDesc = "ellipse / oval";
      } else if (topLeft < 50 && topRight < 50 && bottomLeft < 50 && bottomRight < 50) {
        shapeDesc = "rect";
      } else {
        shapeDesc = `custom aperture (transRatio=${transRatio}, center=${center}, corners=[${topLeft},${topRight},${bottomLeft},${bottomRight}])`;
      }

      console.log(`  Slot ${i}: [x=${x}, y=${y}, ${width}x${height}] -> ${shapeDesc} (topCenter=${topCenter}, lobes=[${leftLobe},${rightLobe}], corners=[${topLeft},${topRight},${bottomLeft},${bottomRight}])`);
    }
  }
}

audit();
