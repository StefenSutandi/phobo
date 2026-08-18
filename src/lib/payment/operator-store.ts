import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

export type OperatorPaymentStatus = "pending" | "confirmed" | "cancelled" | "expired";

export type OperatorPaymentOrder = {
  orderId: string;
  sessionId: string;
  paymentPurpose: "main-package" | "add-print";
  baseAmount: number;
  uniqueCode: number;
  payableAmount: number;
  status: OperatorPaymentStatus;
  createdAt: string;
  expiresAt: string;
  confirmedAt?: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const FILE_PATH = path.join(DATA_DIR, "payment-orders.json");
const EXPIRE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

// In-process mutex for serializing data store reads/writes
class Mutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const execute = () => {
        this.locked = true;
        resolve(() => this.release());
      };

      if (!this.locked) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }

  private release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.locked = false;
    }
  }
}

const storeMutex = new Mutex();

async function ensureFileExists(): Promise<void> {
  try {
    if (!existsSync(DATA_DIR)) {
      await fs.mkdir(DATA_DIR, { recursive: true });
    }
    if (!existsSync(FILE_PATH)) {
      await fs.writeFile(FILE_PATH, JSON.stringify([]), "utf-8");
    }
  } catch (err) {
    console.error("[OperatorStore] Error ensuring data file directory:", err);
  }
}

async function rawReadOrders(): Promise<OperatorPaymentOrder[]> {
  await ensureFileExists();
  try {
    const data = await fs.readFile(FILE_PATH, "utf-8");
    if (!data.trim()) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[OperatorStore] JSON Read/Parse error:", err);
    return [];
  }
}

async function rawWriteOrders(orders: OperatorPaymentOrder[]): Promise<void> {
  await ensureFileExists();
  try {
    const tempPath = `${FILE_PATH}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(orders, null, 2), "utf-8");
    await fs.rename(tempPath, FILE_PATH);
  } catch (err) {
    console.error("[OperatorStore] Atomic write error:", err);
  }
}

// Auto-expire pending orders where now > expiresAt
function processExpirations(orders: OperatorPaymentOrder[]): boolean {
  let changed = false;
  const now = new Date().getTime();

  for (const order of orders) {
    if (order.status === "pending") {
      const expireTime = new Date(order.expiresAt).getTime();
      if (now > expireTime) {
        order.status = "expired";
        changed = true;
      }
    }
  }

  return changed;
}

function generateShortId(purpose: "main-package" | "add-print"): string {
  const prefix = purpose === "add-print" ? "PHOBO-ADD-" : "PHOBO-MAIN-";
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}${result}`;
}

export async function createOperatorOrder({
  sessionId,
  paymentPurpose,
  baseAmount,
}: {
  sessionId: string;
  paymentPurpose: "main-package" | "add-print";
  baseAmount: number;
}): Promise<OperatorPaymentOrder> {
  const unlock = await storeMutex.acquire();

  try {
    const orders = await rawReadOrders();
    const changed = processExpirations(orders);

    // 1. Idempotency Check: if active non-expired pending order exists for (sessionId, paymentPurpose), return it
    const existing = orders.find(
      (o) => o.sessionId === sessionId && o.paymentPurpose === paymentPurpose && o.status === "pending"
    );

    if (existing) {
      if (changed) {
        await rawWriteOrders(orders);
      }
      return existing;
    }

    // 2. Base Amount & zero unique code for clean static QRIS
    const uniqueCode = 0;
    const payableAmount = baseAmount;

    // 3. Collision-resistant Order ID
    let orderId = generateShortId(paymentPurpose);
    while (orders.some((o) => o.orderId === orderId)) {
      orderId = generateShortId(paymentPurpose);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + EXPIRE_DURATION_MS);

    const newOrder: OperatorPaymentOrder = {
      orderId,
      sessionId,
      paymentPurpose,
      baseAmount,
      uniqueCode,
      payableAmount,
      status: "pending",
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    orders.unshift(newOrder); // Newest first
    await rawWriteOrders(orders);

    return newOrder;
  } finally {
    unlock();
  }
}

export async function getOperatorOrder(orderId: string): Promise<OperatorPaymentOrder | null> {
  const unlock = await storeMutex.acquire();

  try {
    const orders = await rawReadOrders();
    const changed = processExpirations(orders);

    const order = orders.find((o) => o.orderId.toUpperCase() === orderId.toUpperCase()) || null;

    if (changed) {
      await rawWriteOrders(orders);
    }

    return order;
  } finally {
    unlock();
  }
}

export async function getAllOperatorOrders(limit = 100): Promise<OperatorPaymentOrder[]> {
  const unlock = await storeMutex.acquire();

  try {
    const orders = await rawReadOrders();
    const changed = processExpirations(orders);

    if (changed) {
      await rawWriteOrders(orders);
    }

    // Sort: pending first, then newest first
    const sorted = [...orders].sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return sorted.slice(0, limit);
  } finally {
    unlock();
  }
}

export async function updateOperatorOrderStatus(
  orderId: string,
  targetAction: "confirm" | "cancel"
): Promise<{ ok: boolean; order?: OperatorPaymentOrder; error?: string }> {
  const unlock = await storeMutex.acquire();

  try {
    const orders = await rawReadOrders();
    processExpirations(orders);

    const index = orders.findIndex((o) => o.orderId.toUpperCase() === orderId.toUpperCase());
    if (index === -1) {
      return { ok: false, error: "Order not found" };
    }

    const currentOrder = orders[index];

    if (currentOrder.status !== "pending") {
      return {
        ok: false,
        error: `Order already ${currentOrder.status}`,
        order: currentOrder,
      };
    }

    if (targetAction === "confirm") {
      currentOrder.status = "confirmed";
      currentOrder.confirmedAt = new Date().toISOString();
    } else if (targetAction === "cancel") {
      currentOrder.status = "cancelled";
    }

    await rawWriteOrders(orders);

    return { ok: true, order: currentOrder };
  } finally {
    unlock();
  }
}
