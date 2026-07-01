export type PaymentStatus = "idle" | "pending" | "confirmed" | "failed" | "timeout";

export type PrintStatus = "idle" | "queued" | "printed" | "failed";

export type GreenScreenTuning = {
  applyChromaKey: boolean;
  greenMin: number;
  greenTolerance: number;
  spillReduction: number;
  edgeSoftness: number;
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
  capturedPhotos: string[];
  selectedPhotoIndices: number[];
  selectedStickerId?: string;
  finalImageUrl?: string;
  printImageUrl?: string;
  driveUrl?: string;
  printStatus: PrintStatus;
  greenScreenTuning: GreenScreenTuning;
  createdAt: string;
  updatedAt: string;
};

