import type { PaymentStatus } from "@/lib/session/session-types";

export interface MidtransConfig {
  isProduction: boolean;
  serverKey: string;
  merchantId?: string;
  baseUrl: string;
}

export interface QrisTransactionParams {
  orderId: string;
  grossAmount: number;
  sessionId: string;
  paymentPurpose?: "main-package" | "add-print";
}

export interface QrisTransactionResult {
  orderId: string;
  transactionId?: string;
  transactionStatus: string;
  grossAmount: number;
  qrActionUrl?: string;
  qrString?: string;
  expiryTime?: string;
}

export interface MidtransStatusResult {
  orderId: string;
  statusCode?: string;
  transactionStatus?: string;
  fraudStatus?: string;
  grossAmount?: number;
  settlementTime?: string;
  notFound?: boolean;
}

// Global mock fetcher for automated offline testing
let testFetchOverride: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;

export function setMidtransTestFetch(override: ((url: string, init?: RequestInit) => Promise<Response>) | null) {
  testFetchOverride = override;
}

function getFetch() {
  return testFetchOverride || fetch;
}

export function validateMidtransConfig(): MidtransConfig {
  const serverKey = process.env.MIDTRANS_SERVER_KEY?.trim() || "";
  if (!serverKey) {
    throw new Error("MIDTRANS_SERVER_KEY is not configured on the server.");
  }

  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
  const merchantId = process.env.MIDTRANS_MERCHANT_ID?.trim();
  const baseUrl = isProduction
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";

  return {
    isProduction,
    serverKey,
    merchantId,
    baseUrl,
  };
}

function getAuthHeader(serverKey: string): string {
  const encoded = Buffer.from(`${serverKey}:`).toString("base64");
  return `Basic ${encoded}`;
}

export function logMidtransSafe(
  action: string,
  details: { orderId?: string; amount?: number; status?: string; environment?: string; message?: string }
) {
  const env = details.environment || (process.env.MIDTRANS_IS_PRODUCTION === "true" ? "production" : "sandbox");
  const pieces = [`[Midtrans] Action=${action}`, `Environment=${env}`];
  if (details.orderId) pieces.push(`OrderId=${details.orderId}`);
  if (details.amount !== undefined) pieces.push(`Amount=${details.amount}`);
  if (details.status) pieces.push(`Status=${details.status}`);
  if (details.message) pieces.push(`Message=${details.message}`);
  console.log(pieces.join(" | "));
}

export async function createQrisTransaction(params: QrisTransactionParams): Promise<QrisTransactionResult> {
  const config = validateMidtransConfig();
  const fetcher = getFetch();

  const body = {
    payment_type: "qris",
    transaction_details: {
      order_id: params.orderId,
      gross_amount: params.grossAmount,
    },
    custom_expiry: {
      expiry_duration: 2,
      unit: "minute",
    },
    custom_field1: params.sessionId,
    custom_field2: params.paymentPurpose || "main-package",
  };

  logMidtransSafe("ChargeQRIS", {
    orderId: params.orderId,
    amount: params.grossAmount,
    environment: config.isProduction ? "production" : "sandbox",
  });

  const response = await fetcher(`${config.baseUrl}/v2/charge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: getAuthHeader(config.serverKey),
    },
    body: JSON.stringify(body),
  });

  const resJson = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = resJson.status_message || resJson.message || `HTTP ${response.status}`;
    logMidtransSafe("ChargeQRISError", {
      orderId: params.orderId,
      message: errorMsg,
    });
    throw new Error(`Midtrans QRIS creation failed: ${errorMsg}`);
  }

  // Find QR code action URL
  const actions: Array<{ name: string; url: string }> = Array.isArray(resJson.actions) ? resJson.actions : [];
  const qrAction = actions.find(
    (a) => a.name === "generate-qr-code" || a.name === "generate-qr-code-v2"
  ) || actions[0];

  const result: QrisTransactionResult = {
    orderId: resJson.order_id || params.orderId,
    transactionId: resJson.transaction_id,
    transactionStatus: resJson.transaction_status || "pending",
    grossAmount: Number(resJson.gross_amount || params.grossAmount),
    qrActionUrl: qrAction?.url,
    qrString: resJson.qr_string,
    expiryTime: resJson.expiry_time,
  };

  logMidtransSafe("ChargeQRISSuccess", {
    orderId: result.orderId,
    status: result.transactionStatus,
  });

  return result;
}

export async function getMidtransTransactionStatus(orderId: string): Promise<MidtransStatusResult> {
  const config = validateMidtransConfig();
  const fetcher = getFetch();

  const response = await fetcher(`${config.baseUrl}/v2/${encodeURIComponent(orderId)}/status`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: getAuthHeader(config.serverKey),
    },
  });

  if (response.status === 404) {
    return {
      orderId,
      statusCode: "404",
      transactionStatus: "pending",
      notFound: true,
    };
  }

  const resJson = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = resJson.status_message || `HTTP ${response.status}`;
    logMidtransSafe("StatusError", {
      orderId,
      message: errorMsg,
    });
    throw new Error(`Failed to query Midtrans status: ${errorMsg}`);
  }

  return {
    orderId: resJson.order_id || orderId,
    statusCode: resJson.status_code,
    transactionStatus: resJson.transaction_status,
    fraudStatus: resJson.fraud_status,
    grossAmount: resJson.gross_amount ? Number(resJson.gross_amount) : undefined,
    settlementTime: resJson.settlement_time,
  };
}

export async function expireMidtransTransaction(orderId: string): Promise<MidtransStatusResult> {
  const config = validateMidtransConfig();
  const fetcher = getFetch();

  logMidtransSafe("ExpireTransaction", { orderId });

  const response = await fetcher(`${config.baseUrl}/v2/${encodeURIComponent(orderId)}/expire`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: getAuthHeader(config.serverKey),
    },
  });

  const resJson = await response.json().catch(() => ({}));

  return {
    orderId: resJson.order_id || orderId,
    statusCode: resJson.status_code,
    transactionStatus: resJson.transaction_status || "expire",
  };
}

export async function fetchMidtransQrisImage(qrActionUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
  const fetcher = getFetch();
  const response = await fetcher(qrActionUrl, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch QRIS image from Midtrans: HTTP ${response.status}`);
  }

  const arrayBuf = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "image/png";

  return {
    buffer: Buffer.from(arrayBuf),
    contentType,
  };
}

export function normalizeMidtransStatus(transactionStatus?: string, fraudStatus?: string): PaymentStatus {
  if (!transactionStatus) return "pending";

  switch (transactionStatus.toLowerCase()) {
    case "settlement":
      return "confirmed";
    case "capture":
      return fraudStatus === "challenge" ? "pending" : "confirmed";
    case "pending":
      return "pending";
    case "expire":
      return "timeout";
    case "deny":
      return "failed";
    case "cancel":
      return "cancelled";
    case "failure":
      return "failed";
    default:
      return "pending";
  }
}
