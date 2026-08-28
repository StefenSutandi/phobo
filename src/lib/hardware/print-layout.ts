export type PrintFitMode = "fill" | "contain";

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PrintLayoutOptions {
  imageWidth: number;
  imageHeight: number;
  pageWidth: number;
  pageHeight: number;
  pageX?: number;
  pageY?: number;
  fitMode?: PrintFitMode;
}

export interface PrintLayoutResult {
  destination: Rectangle;
  scale: number;
  isLandscapeImage: boolean;
  isLandscapePage: boolean;
  fitMode: PrintFitMode;
  fillRatio: number;
}

/**
 * Computes destination rectangle for printing an image onto a physical page.
 *
 * For "fill" (default for photo/SELPHY printing):
 * - Preserves aspect ratio
 * - Covers the entire page (zero white borders)
 * - Centers symmetrically (minimal crop on minor aspect mismatch)
 *
 * For "contain":
 * - Preserves aspect ratio
 * - Fits inside the page (may leave small borders on minor aspect mismatch)
 * - Centers symmetrically
 */
export function computePrintDestination({
  imageWidth,
  imageHeight,
  pageWidth,
  pageHeight,
  pageX = 0,
  pageY = 0,
  fitMode = "fill",
}: PrintLayoutOptions): PrintLayoutResult {
  if (imageWidth <= 0 || imageHeight <= 0 || pageWidth <= 0 || pageHeight <= 0) {
    throw new Error("Dimensions must be positive numbers");
  }

  const scaleX = pageWidth / imageWidth;
  const scaleY = pageHeight / imageHeight;

  const scale = fitMode === "fill" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);

  const destW = Math.round(imageWidth * scale);
  const destH = Math.round(imageHeight * scale);
  const destX = Math.round(pageX + (pageWidth - destW) / 2);
  const destY = Math.round(pageY + (pageHeight - destH) / 2);

  const pageArea = pageWidth * pageHeight;
  const destArea = destW * destH;
  const fillRatio = destArea / pageArea;

  return {
    destination: {
      x: destX,
      y: destY,
      width: destW,
      height: destH,
    },
    scale,
    isLandscapeImage: imageWidth > imageHeight,
    isLandscapePage: pageWidth > pageHeight,
    fitMode,
    fillRatio,
  };
}

export interface DriverPaperSize {
  paperName: string;
  width?: number;
  height?: number;
}

/**
 * Deterministically selects the Canon Postcard (100x148mm) paper size from a list of driver paper definitions.
 *
 * Selection priority:
 * 1. Exact case-sensitive "Japanese Postcard"
 * 2. Exact case-insensitive "Japanese Postcard"
 * 3. Keyword Postcard / Hagaki / KP / 4R / 100x148 / 4x6
 * 4. Dimensional fallback approximately 394 x 583 hundredths inch (100x148mm)
 */
export function selectCanonPostcardPaper<T extends DriverPaperSize>(paperSizes: T[]): T | null {
  if (!paperSizes || paperSizes.length === 0) return null;

  // 1. Exact case-sensitive "Japanese Postcard"
  for (const ps of paperSizes) {
    if (ps.paperName === "Japanese Postcard") {
      return ps;
    }
  }

  // 2. Exact case-insensitive "Japanese Postcard"
  for (const ps of paperSizes) {
    if (ps.paperName.trim().toLowerCase() === "japanese postcard") {
      return ps;
    }
  }

  // 3. Keyword Postcard / Hagaki / KP / 4R / 100x148 / 4x6
  const keywords = [
    "postcard",
    "hagaki",
    "4x6",
    "4 x 6",
    "4r",
    "kp",
    "100x148",
    "100 x 148",
    "148x100",
    "148 x 100",
  ];
  for (const ps of paperSizes) {
    const name = ps.paperName.toLowerCase();
    if (keywords.some((k) => name.includes(k))) {
      return ps;
    }
  }

  // 4. Dimensional fallback approximately 394 x 583 hundredths inch (100x148mm)
  for (const ps of paperSizes) {
    if (typeof ps.width === "number" && typeof ps.height === "number") {
      const w = ps.width;
      const h = ps.height;
      if (
        (w >= 370 && w <= 430 && h >= 560 && h <= 630) ||
        (w >= 560 && w <= 630 && h >= 370 && h <= 430)
      ) {
        return ps;
      }
    }
  }

  return null;
}
