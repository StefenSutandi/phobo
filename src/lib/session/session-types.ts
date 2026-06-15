export type PaymentStatus = "idle" | "pending" | "confirmed" | "failed" | "timeout";

export type PrintStatus = "idle" | "queued" | "printed" | "failed";

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
  createdAt: string;
  updatedAt: string;
};
