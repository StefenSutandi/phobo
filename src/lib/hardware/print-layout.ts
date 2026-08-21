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
