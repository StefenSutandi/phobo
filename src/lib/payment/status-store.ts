import type { PaymentStatus } from "@/lib/session/session-types";
import { getOperatorOrder } from "./operator-store";

// In-memory store for payment statuses.
// Key: orderId, Value: PaymentStatus
const paymentStore = new Map<string, PaymentStatus>();

export async function getPaymentStatus(orderId: string): Promise<PaymentStatus> {
  const inMemory = paymentStore.get(orderId);
  if (inMemory) return inMemory;

  const operatorOrder = await getOperatorOrder(orderId);
  if (operatorOrder) {
    return operatorOrder.status;
  }

  return "pending";
}

export function setPaymentStatus(orderId: string, status: PaymentStatus) {
  paymentStore.set(orderId, status);
}
