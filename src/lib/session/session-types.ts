export type PaymentStatus = "idle" | "pending" | "confirmed" | "failed" | "timeout";

export type PrintStatus = "idle" | "queued" | "printed" | "failed";

export type GreenScreenTuning = {
  applyChromaKey: boolean;
  greenMin: number;
  greenTolerance: number;
  spillReduction: number;
  edgeSoftness: number;
};

export type StickerPlacement = {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
};

export type CapturedPhoto = {
  raw: string;
  display: string;
  width?: number;
  height?: number;
};

export type KioskSession = {
  sessionId: string;
  selectedPackageId?: string;
  packageId?: string;
  packageName?: string;
  frameCount?: number;
  printCount?: number;
  maxShots?: number;
  durationMinutes?: number;
  price?: number;
  paymentStatus: PaymentStatus;
  paymentOrderId?: string;
  paymentSnapToken?: string;
  paymentRedirectUrl?: string;
  paymentAmount?: number;
  selectedFrameId?: string;
  selectedBackgroundId?: string;
  capturedPhotos: CapturedPhoto[];
  selectedPhotoIndices: number[];
  additionalSelectedPhotoIndices?: number[];
  selectedStickerId?: string;
  stickers: StickerPlacement[];
  finalImageUrl?: string;
  printImageUrl?: string;
  driveUrl?: string;
  printStatus: PrintStatus;
  greenScreenTuning: GreenScreenTuning;
  createdAt: string;
  updatedAt: string;
  additionalFrameId?: string;
  addPrintPaymentOrderId?: string;
  addPrintPaymentRedirectUrl?: string;
  addPrintPaymentStatus?: "unpaid" | "pending" | "paid" | "failed";
  additionalPrintImageUrl?: string;
};

export function getPhotoRawUrl(photo: CapturedPhoto | string | null | undefined): string {
  if (!photo) return "";
  if (typeof photo === "string") return photo;
  if (typeof photo === "object" && photo !== null) {
    if (typeof photo.raw === "string" && photo.raw.trim().length > 0) return photo.raw;
    if (typeof photo.display === "string" && photo.display.trim().length > 0) return photo.display;
  }
  return "";
}

export function getPhotoDisplayUrl(photo: CapturedPhoto | string | null | undefined): string {
  if (!photo) return "";
  if (typeof photo === "string") return photo;
  if (typeof photo === "object" && photo !== null) {
    if (typeof photo.display === "string" && photo.display.trim().length > 0) return photo.display;
    if (typeof photo.raw === "string" && photo.raw.trim().length > 0) return photo.raw;
  }
  return "";
}

export function isValidImgSrc(src: unknown): src is string {
  if (typeof src !== "string" || !src) return false;
  if (src === "[object Object]" || src === "undefined" || src === "null") return false;
  return src.startsWith("data:image/") || src.startsWith("/results/") || src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/");
}
