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
  paymentStatus: PaymentStatus;
  selectedFrameId?: string;
  selectedBackgroundId?: string;
  capturedPhotos: string[];
  finalImageUrl?: string;
  printImageUrl?: string;
  driveUrl?: string;
  printStatus: PrintStatus;
  greenScreenTuning: GreenScreenTuning;
  createdAt: string;
  updatedAt: string;
};
