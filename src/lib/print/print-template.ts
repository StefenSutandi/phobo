import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { parseDataUrl } from "@/lib/results/result-storage";

export const PRINT_WIDTH_PX = 1748;
export const PRINT_HEIGHT_PX = 1181;

type Generate4RPrintTemplateRequest = {
  sessionId: string;
  capturedPhotos?: string[];
  finalImageUrl?: string;
  selectedFrameId?: string;
  selectedBackgroundId?: string;
  showSafeGuide?: boolean;
};

const mimeByExtension: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function publicImageUrlToDataUrl(imageUrl: string) {
  if (imageUrl.startsWith("data:")) {
    const parsed = parseDataUrl(imageUrl);
    return `data:${parsed.mimeType};base64,${parsed.buffer.toString("base64")}`;
  }

  const pathname = imageUrl.startsWith("http://") || imageUrl.startsWith("https://")
    ? new URL(imageUrl).pathname
    : imageUrl;

  if (!pathname.startsWith("/")) {
    return null;
  }

  const publicRoot = path.join(process.cwd(), "public");
  const resolvedPath = path.resolve(publicRoot, `.${pathname}`);
  const relativePath = path.relative(publicRoot, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  try {
    await access(resolvedPath, constants.F_OK);
  } catch {
    return null;
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  const mimeType = mimeByExtension[extension];

  if (!mimeType) {
    return null;
  }

  const buffer = await readFile(resolvedPath);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function resolveTemplateImages({
  capturedPhotos,
  finalImageUrl,
}: Pick<Generate4RPrintTemplateRequest, "capturedPhotos" | "finalImageUrl">) {
  const sourceUrls = capturedPhotos?.length ? capturedPhotos : finalImageUrl ? [finalImageUrl] : [];
  const dataUrls = await Promise.all(
    sourceUrls.slice(0, 4).map((imageUrl) => publicImageUrlToDataUrl(imageUrl)),
  );

  return dataUrls.filter((imageUrl): imageUrl is string => Boolean(imageUrl));
}

function renderPhotoCell({
  id,
  x,
  y,
  width,
  height,
  imageUrl,
}: {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  imageUrl?: string;
}) {
  if (!imageUrl) {
    return `
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="20" fill="#d9d9d9"/>
      <rect x="${x + 18}" y="${y + 18}" width="${width - 36}" height="${height - 36}" rx="14" fill="#c8c8c8"/>
      <text x="${x + width / 2}" y="${y + height / 2 + 10}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#535a64">PHOTO</text>
    `;
  }

  return `
    <clipPath id="${id}">
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="20"/>
    </clipPath>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="20" fill="#d9d9d9"/>
    <image href="${escapeXml(imageUrl)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>
  `;
}

function renderStrip({
  stripIndex,
  x,
  y,
  width,
  height,
  images,
}: {
  stripIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  images: string[];
}) {
  const padding = 32;
  const labelHeight = 72;
  const gap = 22;
  const cellWidth = width - padding * 2;
  const cellHeight = (height - padding * 2 - labelHeight - gap * 2) / 3;

  const cells = Array.from({ length: 3 }, (_, index) => {
    const imageUrl = images.length ? images[index % images.length] : undefined;
    return renderPhotoCell({
      id: `strip-${stripIndex}-photo-${index}`,
      x: x + padding,
      y: y + padding + index * (cellHeight + gap),
      width: cellWidth,
      height: cellHeight,
      imageUrl,
    });
  }).join("");

  return `
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="30" fill="#ffffff"/>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="30" fill="none" stroke="#eeeeee" stroke-width="3"/>
    ${cells}
    <text x="${x + width / 2}" y="${y + height - 34}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#591f42">Phobo</text>
  `;
}

export async function generate4RPrintTemplate({
  capturedPhotos,
  finalImageUrl,
  selectedFrameId,
  selectedBackgroundId,
  showSafeGuide = false,
}: Generate4RPrintTemplateRequest): Promise<Buffer> {
  const images = await resolveTemplateImages({ capturedPhotos, finalImageUrl });
  const safeMargin = 90;
  const stripGap = 68;
  const stripWidth = (PRINT_WIDTH_PX - safeMargin * 2 - stripGap) / 2;
  const stripHeight = PRINT_HEIGHT_PX - safeMargin * 2 - 70;
  const stripY = safeMargin;
  const leftX = safeMargin;
  const rightX = safeMargin + stripWidth + stripGap;
  const metadata = [selectedFrameId, selectedBackgroundId].filter(Boolean).join(" / ");
  const safeGuide = showSafeGuide
    ? `<rect x="${safeMargin}" y="${safeMargin}" width="${PRINT_WIDTH_PX - safeMargin * 2}" height="${PRINT_HEIGHT_PX - safeMargin * 2}" fill="none" stroke="#d3974d" stroke-width="6" stroke-dasharray="20 16"/>`
    : "";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${PRINT_WIDTH_PX}" height="${PRINT_HEIGHT_PX}" viewBox="0 0 ${PRINT_WIDTH_PX} ${PRINT_HEIGHT_PX}">
      <rect width="${PRINT_WIDTH_PX}" height="${PRINT_HEIGHT_PX}" fill="#f7f3ee"/>
      <rect x="0" y="0" width="${PRINT_WIDTH_PX}" height="${PRINT_HEIGHT_PX}" fill="#ffffff"/>
      ${renderStrip({
        stripIndex: 0,
        x: leftX,
        y: stripY,
        width: stripWidth,
        height: stripHeight,
        images,
      })}
      ${renderStrip({
        stripIndex: 1,
        x: rightX,
        y: stripY,
        width: stripWidth,
        height: stripHeight,
        images,
      })}
      <text x="${PRINT_WIDTH_PX / 2}" y="${PRINT_HEIGHT_PX - 45}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#535a64">${escapeXml(metadata || "4R postcard print")}</text>
      ${safeGuide}
    </svg>
  `;

  return sharp(Buffer.from(svg), { unlimited: true, limitInputPixels: false, density: 300 })
    .resize(PRINT_WIDTH_PX, PRINT_HEIGHT_PX, { fit: "fill" })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}
