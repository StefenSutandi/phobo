import type { PaymentStatus } from "@/lib/session/session-types";
import { getOperatorOrder } from "./operator-store";

export interface MidtransOrderRecord {
  orderId: string;
  sessionId: string;
  paymentPurpose: "main-package" | "add-print";
  amount: number;
  qrActionUrl?: string;
  qrString?: string;
  expiryTime?: string;
  status: PaymentStatus;
  createdAt: string;
}

// In-memory store for payment statuses.
// Key: orderId, Value: PaymentStatus
const paymentStore = new Map<string, PaymentStatus>();
// In-memory store for active Midtrans orders
const midtransOrderStore = new Map<string, MidtransOrderRecord>();

export async function getPaymentStatus(orderId: string): Promise<PaymentStatus> {
  const inMemory = paymentStore.get(orderId);
  if (inMemory) return inMemory;

  const operatorOrder = await getOperatorOrder(orderId);
  if (operatorOrder) {
    return operatorOrder.status;
  }

  const midtransOrder = midtransOrderStore.get(orderId);
  if (midtransOrder) {
    return midtransOrder.status;
  }

  return "pending";
}

export function setPaymentStatus(orderId: string, status: PaymentStatus) {
  paymentStore.set(orderId, status);
  const existing = midtransOrderStore.get(orderId);
  if (existing) {
    existing.status = status;
  }
}

export function saveMidtransOrder(record: MidtransOrderRecord) {
  midtransOrderStore.set(record.orderId, record);
  paymentStore.set(record.orderId, record.status);
}

export function getMidtransOrder(orderId: string): MidtransOrderRecord | undefined {
  return midtransOrderStore.get(orderId);
}

export function findPendingMidtransOrder(sessionId: string, paymentPurpose: "main-package" | "add-print"): MidtransOrderRecord | undefined {
  for (const record of midtransOrderStore.values()) {
    if (record.sessionId === sessionId && record.paymentPurpose === paymentPurpose && record.status === "pending") {
      return record;
    }
  }
  return undefined;
}
