import type { PaymentStatus } from "@/lib/session/session-types";

// In-memory store for payment statuses.
// Key: orderId, Value: PaymentStatus
const paymentStore = new Map<string, PaymentStatus>();

export function getPaymentStatus(orderId: string): PaymentStatus | undefined {
  return paymentStore.get(orderId);
}

export function setPaymentStatus(orderId: string, status: PaymentStatus) {
  paymentStore.set(orderId, status);
}
