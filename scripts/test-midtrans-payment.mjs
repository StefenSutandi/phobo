import assert from "node:assert/strict";
import crypto from "crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("==================================================");
console.log("RUNNING MIDTRANS CORE API QRIS INTEGRATION TESTS");
console.log("==================================================");

async function runMidtransTests() {
  const {
    validateMidtransConfig,
    createQrisTransaction,
    getMidtransTransactionStatus,
    expireMidtransTransaction,
    fetchMidtransQrisImage,
    normalizeMidtransStatus,
    isValidQrisString,
    logMidtransNetworkError,
    setMidtransTestFetch,
  } = await import("../src/lib/payment/midtrans.ts");

  const {
    saveMidtransOrder,
    getMidtransOrder,
    findPendingMidtransOrder,
    getPaymentStatus,
    setPaymentStatus,
  } = await import("../src/lib/payment/status-store.ts");

  const { POST: createPaymentRoute } = await import("../src/app/api/payment/create/route.ts");
  const { GET: getStatusRoute } = await import("../src/app/api/payment/status/route.ts");
  const { GET: getQrisRoute } = await import("../src/app/api/payment/qris/route.ts");
  const { POST: expireRoute } = await import("../src/app/api/payment/expire/route.ts");
  const { POST: notificationRoute } = await import("../src/app/api/payment/notification/route.ts");

  const TEST_SERVER_KEY = "SB-Mid-server-TEST-KEY-1234567890";
  process.env.MIDTRANS_SERVER_KEY = TEST_SERVER_KEY;
  process.env.MIDTRANS_IS_PRODUCTION = "false";
  process.env.PHOBO_PAYMENT_PROVIDER = "midtrans";

  // ================================================================
  // TEST 1: Config Validation
  // ================================================================
  console.log("\nTest 1: Validating Midtrans configuration parser...");
  const config = validateMidtransConfig();
  assert.equal(config.isProduction, false);
  assert.equal(config.serverKey, TEST_SERVER_KEY);
  assert.equal(config.baseUrl, "https://api.sandbox.midtrans.com");
  console.log("✓ Sandbox base URL and server key correctly validated");

  // Production check
  process.env.MIDTRANS_IS_PRODUCTION = "true";
  const prodConfig = validateMidtransConfig();
  assert.equal(prodConfig.isProduction, true);
  assert.equal(prodConfig.baseUrl, "https://api.midtrans.com");
  console.log("✓ Production base URL correctly validated");
  process.env.MIDTRANS_IS_PRODUCTION = "false";

  // Missing key check
  process.env.MIDTRANS_SERVER_KEY = "";
  assert.throws(() => validateMidtransConfig(), /MIDTRANS_SERVER_KEY is not configured/);
  process.env.MIDTRANS_SERVER_KEY = TEST_SERVER_KEY;
  console.log("✓ Missing server key throws descriptive error");

  // ================================================================
  // TEST 2: Status Normalizer
  // ================================================================
  console.log("\nTest 2: Testing Midtrans transaction status normalization...");
  assert.equal(normalizeMidtransStatus("settlement"), "confirmed");
  assert.equal(normalizeMidtransStatus("capture", "accept"), "confirmed");
  assert.equal(normalizeMidtransStatus("capture", "challenge"), "pending");
  assert.equal(normalizeMidtransStatus("pending"), "pending");
  assert.equal(normalizeMidtransStatus("expire"), "timeout");
  assert.equal(normalizeMidtransStatus("deny"), "failed");
  assert.equal(normalizeMidtransStatus("cancel"), "cancelled");
  assert.equal(normalizeMidtransStatus("failure"), "failed");
  console.log("✓ All transaction statuses properly normalized to PaymentStatus");

  // ================================================================
  // TEST 3: Create QRIS Charge (Mocked Core API)
  // ================================================================
  console.log("\nTest 3: Testing createQrisTransaction with mocked Core API...");
  const mockQrUrl = "https://api.sandbox.midtrans.com/v2/qris/12345/qr-code";
  const mockQrString = "00020101021226580014ID.LINKAJA.WWW011893600911002237894502150000000000000005204581253033605802ID5911PHOBO KIOSK6007BANDUNG61054013262070703A016304C90A";

  let capturedRequestBody = null;
  let capturedAuthHeader = null;

  setMidtransTestFetch(async (url, init) => {
    if (url.endsWith("/v2/charge")) {
      capturedRequestBody = JSON.parse(init.body);
      capturedAuthHeader = init.headers.Authorization;
      return new Response(
        JSON.stringify({
          status_code: "201",
          status_message: "QRIS transaction is created",
          transaction_id: "trx-test-uuid-001",
          order_id: capturedRequestBody.transaction_details.order_id,
          gross_amount: String(capturedRequestBody.transaction_details.gross_amount),
          payment_type: "qris",
          transaction_time: "2026-09-17 10:00:00",
          transaction_status: "pending",
          fraud_status: "accept",
          actions: [
            {
              name: "generate-qr-code",
              method: "GET",
              url: mockQrUrl,
            },
          ],
          qr_string: mockQrString,
          expiry_time: "2026-09-17 10:02:00",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  });

  const qrisRes = await createQrisTransaction({
    orderId: "PHOBO-MAIN-test-01",
    grossAmount: 45000,
    sessionId: "sess-01",
    paymentPurpose: "main-package",
  });

  assert.equal(qrisRes.orderId, "PHOBO-MAIN-test-01");
  assert.equal(qrisRes.transactionStatus, "pending");
  assert.equal(qrisRes.grossAmount, 45000);
  assert.equal(qrisRes.qrActionUrl, mockQrUrl);
  assert.equal(qrisRes.qrString, mockQrString);
  assert.equal(capturedRequestBody.payment_type, "qris");
  assert.equal(capturedRequestBody.transaction_details.gross_amount, 45000);
  assert.equal(capturedRequestBody.custom_expiry.expiry_duration, 2);
  assert.equal(capturedRequestBody.custom_expiry.unit, "minute");

  const expectedAuth = `Basic ${Buffer.from(`${TEST_SERVER_KEY}:`).toString("base64")}`;
  assert.equal(capturedAuthHeader, expectedAuth, "Authorization header must be Basic base64(serverKey:)");
  console.log("✓ createQrisTransaction correctly formatted Core API request and extracted action URL");

  // ================================================================
  // TEST 4: Authoritative Pricing in POST /api/payment/create
  // ================================================================
  console.log("\nTest 4: Validating server-authoritative amounts for all packages & add-print...");

  // Basic -> 45,000
  const reqBasic = new Request("http://localhost:3000/api/payment/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "session-pkg-basic",
      packageId: "basic",
      amount: 999999, // Malicious client amount should be ignored
      paymentPurpose: "main-package",
    }),
  });
  const resBasic = await createPaymentRoute(reqBasic);
  const dataBasic = await resBasic.json();
  assert.equal(dataBasic.ok, true);
  assert.equal(dataBasic.payableAmount, 45000, "Basic price must be authoritative 45,000");
  assert.equal(capturedRequestBody.transaction_details.gross_amount, 45000);
  console.log("✓ Basic package: 45,000 confirmed");

  // Duo -> 60,000
  const reqDuo = new Request("http://localhost:3000/api/payment/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "session-pkg-duo",
      packageId: "duo",
      amount: 1, // Malicious client amount
      paymentPurpose: "main-package",
    }),
  });
  const resDuo = await createPaymentRoute(reqDuo);
  const dataDuo = await resDuo.json();
  assert.equal(dataDuo.ok, true);
  assert.equal(dataDuo.payableAmount, 60000, "Duo price must be authoritative 60,000");
  assert.equal(capturedRequestBody.transaction_details.gross_amount, 60000);
  console.log("✓ Duo package: 60,000 confirmed");

  // Premium -> 65,000
  const reqPrem = new Request("http://localhost:3000/api/payment/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "session-pkg-prem",
      packageId: "premium",
      amount: 500, // Malicious client amount
      paymentPurpose: "main-package",
    }),
  });
  const resPrem = await createPaymentRoute(reqPrem);
  const dataPrem = await resPrem.json();
  assert.equal(dataPrem.ok, true);
  assert.equal(dataPrem.payableAmount, 65000, "Premium price must be authoritative 65,000");
  assert.equal(capturedRequestBody.transaction_details.gross_amount, 65000);
  console.log("✓ Premium package: 65,000 confirmed");

  // Add-Print -> 20,000
  const reqAdd = new Request("http://localhost:3000/api/payment/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "session-pkg-add",
      paymentPurpose: "add-print",
      amount: 1234,
    }),
  });
  const resAdd = await createPaymentRoute(reqAdd);
  const dataAdd = await resAdd.json();
  assert.equal(dataAdd.ok, true);
  assert.equal(dataAdd.payableAmount, 20000, "Add-print price must be authoritative 20,000");
  assert.equal(capturedRequestBody.transaction_details.gross_amount, 20000);
  console.log("✓ Additional Print: 20,000 confirmed");

  // ================================================================
  // TEST 5: Idempotency & Duplicate Order Prevention
  // ================================================================
  console.log("\nTest 5: Testing duplicate pending order reuse...");
  const dupReq = new Request("http://localhost:3000/api/payment/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "session-pkg-basic",
      packageId: "basic",
      paymentPurpose: "main-package",
    }),
  });
  const dupRes = await createPaymentRoute(dupReq);
  const dupData = await dupRes.json();
  assert.equal(dupData.ok, true);
  assert.equal(dupData.orderId, dataBasic.orderId, "Must return existing pending orderId");
  console.log(`✓ Duplicate order reuse verified: returned existing ${dupData.orderId}`);

  // ================================================================
  // TEST 6: Proxy QRIS Image Route (GET /api/payment/qris)
  // ================================================================
  console.log("\nTest 6: Testing QRIS Image proxy endpoint...");
  // 1x1 transparent PNG for mock response
  const dummyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );

  setMidtransTestFetch(async (url) => {
    if (url === mockQrUrl) {
      return new Response(dummyPng, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    }
    return new Response("Not found", { status: 404 });
  });

  const qrisImgReq = new Request(`http://localhost:3000/api/payment/qris?orderId=${dataBasic.orderId}`);
  const qrisImgRes = await getQrisRoute(qrisImgReq);
  assert.equal(qrisImgRes.status, 200);
  assert.equal(qrisImgRes.headers.get("Content-Type"), "image/png");
  assert.ok(qrisImgRes.headers.get("Cache-Control")?.includes("no-store"));
  const imgArrayBuf = await qrisImgRes.arrayBuffer();
  assert.ok(imgArrayBuf.byteLength > 0, "Image response buffer must not be empty");
  console.log(`✓ QRIS proxy streamed PNG image correctly (${imgArrayBuf.byteLength} bytes) with no-store header`);

  // ================================================================
  // TEST 7: Polling Status Route (GET /api/payment/status)
  // ================================================================
  console.log("\nTest 7: Testing status polling with Midtrans settlement response...");
  let mockStatusResponse = {
    order_id: dataBasic.orderId,
    status_code: "200",
    transaction_status: "pending",
    gross_amount: "45000.00",
  };

  setMidtransTestFetch(async (url) => {
    if (url.includes(`/v2/${encodeURIComponent(dataBasic.orderId)}/status`)) {
      return new Response(JSON.stringify(mockStatusResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  });

  // Poll 1: pending
  const pollRes1 = await getStatusRoute(new Request(`http://localhost:3000/api/payment/status?orderId=${dataBasic.orderId}`));
  const pollData1 = await pollRes1.json();
  assert.equal(pollData1.ok, true);
  assert.equal(pollData1.status, "pending");
  console.log("✓ Polling tick 1: returned pending");

  // User settles payment
  mockStatusResponse = {
    order_id: dataBasic.orderId,
    status_code: "200",
    transaction_status: "settlement",
    gross_amount: "45000.00",
    settlement_time: new Date().toISOString(),
  };

  // Poll 2: confirmed
  const pollRes2 = await getStatusRoute(new Request(`http://localhost:3000/api/payment/status?orderId=${dataBasic.orderId}`));
  const pollData2 = await pollRes2.json();
  assert.equal(pollData2.ok, true);
  assert.equal(pollData2.status, "confirmed");
  console.log("✓ Polling tick 2: returned confirmed upon settlement");

  // ================================================================
  // TEST 8: Timeout Race Protection in POST /api/payment/expire
  // ================================================================
  console.log("\nTest 8: Testing timeout expiration race condition (T=119s settlement vs T=120s timeout)...");

  // Setup order that settles right before timeout
  const raceOrderId = "PHOBO-RACE-001";
  saveMidtransOrder({
    orderId: raceOrderId,
    sessionId: "session-race",
    paymentPurpose: "main-package",
    amount: 45000,
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  let expireCallMade = false;

  setMidtransTestFetch(async (url) => {
    if (url.includes(`/v2/${encodeURIComponent(raceOrderId)}/status`)) {
      // Mock that user paid at T=119s
      return new Response(
        JSON.stringify({
          order_id: raceOrderId,
          status_code: "200",
          transaction_status: "settlement",
          gross_amount: "45000.00",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes(`/v2/${encodeURIComponent(raceOrderId)}/expire`)) {
      expireCallMade = true;
      return new Response(JSON.stringify({ status_code: "200", transaction_status: "expire" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not found", { status: 404 });
  });

  // Timeout handler triggers at T=120s
  const expireReq = new Request("http://localhost:3000/api/payment/expire", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId: raceOrderId }),
  });
  const expireRes = await expireRoute(expireReq);
  const expireData = await expireRes.json();

  assert.equal(expireData.ok, true);
  assert.equal(expireData.status, "confirmed", "Settlement at T=119s must WIN over T=120s expire call");
  assert.equal(expireData.expired, false, "Must not be marked as expired");
  assert.equal(expireCallMade, false, "Must not execute expire call if already settled");
  console.log("✓ Race protection verified: T=119s settlement successfully won over T=120s timeout call");

  // ================================================================
  // TEST 9: Normal Expiration Flow
  // ================================================================
  console.log("\nTest 9: Testing normal expiration when payment was unpaid...");
  const unpaidOrderId = "PHOBO-UNPAID-001";
  saveMidtransOrder({
    orderId: unpaidOrderId,
    sessionId: "session-unpaid",
    paymentPurpose: "main-package",
    amount: 45000,
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  let unpaidExpireCalled = false;
  setMidtransTestFetch(async (url) => {
    if (url.includes(`/v2/${encodeURIComponent(unpaidOrderId)}/status`)) {
      return new Response(
        JSON.stringify({
          order_id: unpaidOrderId,
          status_code: "200",
          transaction_status: "pending",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes(`/v2/${encodeURIComponent(unpaidOrderId)}/expire`)) {
      unpaidExpireCalled = true;
      return new Response(
        JSON.stringify({
          order_id: unpaidOrderId,
          status_code: "200",
          transaction_status: "expire",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response("Not found", { status: 404 });
  });

  const unpaidExpReq = new Request("http://localhost:3000/api/payment/expire", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId: unpaidOrderId }),
  });
  const unpaidExpRes = await expireRoute(unpaidExpReq);
  const unpaidExpData = await unpaidExpRes.json();

  assert.equal(unpaidExpData.ok, true);
  assert.equal(unpaidExpData.status, "timeout");
  assert.equal(unpaidExpData.expired, true);
  assert.equal(unpaidExpireCalled, true, "Midtrans /expire endpoint must be called");
  console.log("✓ Normal expiration successfully set status to timeout and notified Midtrans");

  // ================================================================
  // TEST 10: Webhook Signature Verification & Notification Handler
  // ================================================================
  console.log("\nTest 10: Testing Webhook Notification Signature Verification...");
  const webhookOrderId = "PHOBO-WEBHOOK-001";
  const statusCode = "200";
  const grossAmount = "45000.00";

  // Generate valid SHA512 signature
  const hash = crypto.createHash("sha512");
  hash.update(`${webhookOrderId}${statusCode}${grossAmount}${TEST_SERVER_KEY}`);
  const validSignature = hash.digest("hex");

  // Valid webhook call
  const validWebhookReq = new Request("http://localhost:3000/api/payment/notification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: webhookOrderId,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: validSignature,
      transaction_status: "settlement",
    }),
  });
  const validWebhookRes = await notificationRoute(validWebhookReq);
  const validWebhookData = await validWebhookRes.json();
  assert.equal(validWebhookRes.status, 200);
  assert.equal(validWebhookData.ok, true);
  assert.equal(validWebhookData.status, "confirmed");
  assert.equal(await getPaymentStatus(webhookOrderId), "confirmed");
  console.log("✓ Valid webhook signature processed and updated order status to confirmed");

  // Invalid webhook signature
  const invalidWebhookReq = new Request("http://localhost:3000/api/payment/notification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: webhookOrderId,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: "invalid-tampered-signature",
      transaction_status: "settlement",
    }),
  });
  const invalidWebhookRes = await notificationRoute(invalidWebhookReq);
  assert.equal(invalidWebhookRes.status, 403, "Tampered signature must return 403 Forbidden");
  console.log("✓ Tampered webhook signature properly rejected with 403 Forbidden");

  // ================================================================
  // TEST 11: qrString exists -> generates QR directly from qrString
  // ================================================================
  console.log("\nTest 11: Testing qrString exists -> generates QR directly from qrString...");
  const validEmvPayload = "00020101021226580014ID.LINKAJA.WWW011893600911002237894502150000000000000005204581253033605802ID5911PHOBO KIOSK6007BANDUNG61054013262070703A016304C90A";
  const orderWithQrString = "PHOBO-TEST-QRSTRING-01";
  saveMidtransOrder({
    orderId: orderWithQrString,
    sessionId: "session-test-qrstr",
    paymentPurpose: "main-package",
    amount: 45000,
    status: "pending",
    qrString: validEmvPayload,
    createdAt: new Date().toISOString(),
  });

  const res11 = await getQrisRoute(new Request(`http://localhost:3000/api/payment/qris?orderId=${orderWithQrString}`));
  assert.equal(res11.status, 200);
  assert.equal(res11.headers.get("Content-Type"), "image/png");
  assert.equal(res11.headers.get("X-Phobo-Qris-Source"), "qr_string");
  const buf11 = await res11.arrayBuffer();
  assert.ok(buf11.byteLength > 100, "Must be valid non-empty PNG buffer");
  console.log(`✓ Generated QR directly from qrString (${buf11.byteLength} bytes, X-Phobo-Qris-Source: qr_string)`);

  // ================================================================
  // TEST 12: qrString has priority over qrActionUrl
  // ================================================================
  console.log("\nTest 12: Testing qrString has priority over qrActionUrl...");
  const orderBoth = "PHOBO-TEST-BOTH-01";
  let actionUrlCalled = false;
  setMidtransTestFetch(async (url) => {
    if (url.includes("action-qr-target")) {
      actionUrlCalled = true;
      return new Response(dummyPng, { status: 200, headers: { "Content-Type": "image/png" } });
    }
    return new Response("Not found", { status: 404 });
  });

  saveMidtransOrder({
    orderId: orderBoth,
    sessionId: "session-test-both",
    paymentPurpose: "main-package",
    amount: 45000,
    status: "pending",
    qrString: validEmvPayload,
    qrActionUrl: "https://api.sandbox.midtrans.com/v2/qris/action-qr-target",
    createdAt: new Date().toISOString(),
  });

  const res12 = await getQrisRoute(new Request(`http://localhost:3000/api/payment/qris?orderId=${orderBoth}`));
  assert.equal(res12.status, 200);
  assert.equal(res12.headers.get("X-Phobo-Qris-Source"), "qr_string");
  assert.equal(actionUrlCalled, false, "qrActionUrl must NOT be fetched when valid qrString is present");
  console.log("✓ qrString took priority over qrActionUrl without making unnecessary HTTP call");

  // ================================================================
  // TEST 13: qrString absent + action URL works -> route proxies actual PNG
  // ================================================================
  console.log("\nTest 13: Testing qrString absent + action URL works -> route proxies actual PNG...");
  const orderActionOnly = "PHOBO-TEST-ACTION-01";
  const mockActionUrl = "https://api.sandbox.midtrans.com/v2/qris/action-only-qr";
  let proxyCallMade = false;

  setMidtransTestFetch(async (url) => {
    if (url === mockActionUrl) {
      proxyCallMade = true;
      return new Response(dummyPng, { status: 200, headers: { "Content-Type": "image/png" } });
    }
    return new Response("Not found", { status: 404 });
  });

  saveMidtransOrder({
    orderId: orderActionOnly,
    sessionId: "session-test-action",
    paymentPurpose: "main-package",
    amount: 45000,
    status: "pending",
    qrActionUrl: mockActionUrl,
    createdAt: new Date().toISOString(),
  });

  const res13 = await getQrisRoute(new Request(`http://localhost:3000/api/payment/qris?orderId=${orderActionOnly}`));
  assert.equal(res13.status, 200);
  assert.equal(res13.headers.get("Content-Type"), "image/png");
  assert.equal(res13.headers.get("X-Phobo-Qris-Source"), "midtrans_action_url");
  assert.equal(proxyCallMade, true);
  console.log("✓ Successfully proxied actual Midtrans PNG when qrString is absent");

  // ================================================================
  // TEST 14: action URL fails + qrString absent -> HTTP 503
  // ================================================================
  console.log("\nTest 14: Testing action URL fails + qrString absent -> HTTP 503...");
  const orderFailingAction = "PHOBO-TEST-FAILING-ACTION-01";
  setMidtransTestFetch(async () => {
    throw new Error("Midtrans upstream CDN 500 error");
  });

  saveMidtransOrder({
    orderId: orderFailingAction,
    sessionId: "session-test-failing",
    paymentPurpose: "main-package",
    amount: 45000,
    status: "pending",
    qrActionUrl: "https://api.sandbox.midtrans.com/v2/qris/failing-target",
    createdAt: new Date().toISOString(),
  });

  const res14 = await getQrisRoute(new Request(`http://localhost:3000/api/payment/qris?orderId=${orderFailingAction}`));
  assert.equal(res14.status, 503, "Failing action URL must return 503, NEVER a synthetic fallback");
  const data14 = await res14.json();
  assert.equal(data14.ok, false);
  assert.equal(data14.error, "QRIS SEDANG TIDAK TERSEDIA. SILAKAN HUBUNGI OPERATOR.");
  console.log("✓ Failing action URL cleanly returned HTTP 503 with safe operator message");

  // ================================================================
  // TEST 15: BOTH missing -> HTTP 503
  // ================================================================
  console.log("\nTest 15: Testing BOTH qrString and qrActionUrl missing -> HTTP 503...");
  const orderBothMissing = "PHOBO-TEST-NONE-01";
  saveMidtransOrder({
    orderId: orderBothMissing,
    sessionId: "session-test-none",
    paymentPurpose: "main-package",
    amount: 45000,
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  const res15 = await getQrisRoute(new Request(`http://localhost:3000/api/payment/qris?orderId=${orderBothMissing}`));
  assert.equal(res15.status, 503, "Missing both must return HTTP 503");
  const data15 = await res15.json();
  assert.equal(data15.ok, false);
  assert.equal(data15.error, "QRIS SEDANG TIDAK TERSEDIA. SILAKAN HUBUNGI OPERATOR.");
  console.log("✓ Both missing properly returned HTTP 503");

  // ================================================================
  // TEST 16: Assert source code of src/app/api/payment/qris/route.ts does NOT contain: MIDTRANS-ORDER-
  // ================================================================
  console.log("\nTest 16: Asserting source code does NOT contain MIDTRANS-ORDER-...");
  const qrisRouteSource = await fs.readFile(
    path.join(__dirname, "..", "src", "app", "api", "payment", "qris", "route.ts"),
    "utf-8"
  );
  assert.equal(
    qrisRouteSource.includes("MIDTRANS-ORDER-"),
    false,
    "CRITICAL: src/app/api/payment/qris/route.ts must NEVER contain MIDTRANS-ORDER-"
  );
  console.log("✓ Verified zero occurrences of 'MIDTRANS-ORDER-' in qris route source code");

  // ================================================================
  // TEST 17: Invalid qrString rejected
  // ================================================================
  console.log("\nTest 17: Testing invalid qrString rejection by validator...");
  assert.equal(isValidQrisString(null), false);
  assert.equal(isValidQrisString(undefined), false);
  assert.equal(isValidQrisString(""), false);
  assert.equal(isValidQrisString("https://example.com/some/link"), false, "URLs must be rejected as QRIS EMV");
  assert.equal(isValidQrisString("MIDTRANS-ORDER-12345"), false, "Synthetic order text must be rejected");
  assert.equal(isValidQrisString("000201SHORT"), false, "Short string starting with 000201 must be rejected");
  assert.equal(isValidQrisString(validEmvPayload), true, "Valid EMV QRIS starting with 000201 must pass");

  // Test that an order with invalid qrString and no action URL returns 503
  const orderInvalidQr = "PHOBO-TEST-INVALID-QR";
  saveMidtransOrder({
    orderId: orderInvalidQr,
    sessionId: "session-test-invalid",
    paymentPurpose: "main-package",
    amount: 45000,
    status: "pending",
    qrString: "INVALID-STRING-NOT-EMV",
    createdAt: new Date().toISOString(),
  });

  const res17 = await getQrisRoute(new Request(`http://localhost:3000/api/payment/qris?orderId=${orderInvalidQr}`));
  assert.equal(res17.status, 503);
  console.log("✓ Invalid qrString correctly rejected and returned HTTP 503");

  // ================================================================
  // TEST 18: No orderId-derived QR can be generated
  // ================================================================
  console.log("\nTest 18: Testing no orderId-derived QR can ever be generated...");
  const arbitraryOrderId = "SOME-ARBITRARY-ORDER-ID-99999";
  const res18 = await getQrisRoute(new Request(`http://localhost:3000/api/payment/qris?orderId=${arbitraryOrderId}`));
  assert.equal(res18.status, 503, "Unregistered order ID must return 503, NEVER a generated fallback QR");
  const data18 = await res18.json();
  assert.equal(data18.ok, false);
  console.log("✓ Verified no orderId-derived QR can be generated for arbitrary order IDs");

  // ================================================================
  // TEST 19: Network error remains pending, never confirmed
  // ================================================================
  console.log("\nTest 19: Testing network error during status check remains pending, never confirmed...");
  const networkErrorOrderId = "PHOBO-TEST-NET-ERROR-01";
  saveMidtransOrder({
    orderId: networkErrorOrderId,
    sessionId: "session-test-net",
    paymentPurpose: "main-package",
    amount: 45000,
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  setMidtransTestFetch(async () => {
    const netErr = new TypeError("fetch failed");
    netErr.cause = { code: "ENOTFOUND", errno: -3008, syscall: "getaddrinfo", hostname: "api.sandbox.midtrans.com" };
    throw netErr;
  });

  const res19 = await getStatusRoute(new Request(`http://localhost:3000/api/payment/status?orderId=${networkErrorOrderId}`));
  const data19 = await res19.json();
  assert.equal(data19.ok, true);
  assert.equal(data19.status, "pending", "Status must remain pending on network failure, NEVER confirmed");
  assert.notEqual(data19.status, "confirmed");
  console.log("✓ Network failure correctly kept status as pending without false confirmation");

  // ================================================================
  // TEST 20: No secrets appear in network diagnostics
  // ================================================================
  console.log("\nTest 20: Testing no secrets appear in network diagnostics...");
  let loggedOutput = "";
  const originalConsoleError = console.error;
  console.error = (...args) => {
    loggedOutput += args.join(" ") + "\n";
  };

  try {
    const sampleNetErr = new TypeError("fetch failed");
    sampleNetErr.cause = {
      code: "ECONNRESET",
      errno: -4077,
      syscall: "read",
      hostname: "api.midtrans.com",
    };
    logMidtransNetworkError("Status", sampleNetErr, "https://api.midtrans.com/v2/charge");
  } finally {
    console.error = originalConsoleError;
  }

  assert.ok(loggedOutput.includes("[Midtrans Network Error]"));
  assert.ok(loggedOutput.includes("Action=Status"));
  assert.ok(loggedOutput.includes("Host=api.midtrans.com"));
  assert.ok(loggedOutput.includes("Code=ECONNRESET"));
  assert.equal(loggedOutput.includes(TEST_SERVER_KEY), false, "Server Key must NEVER appear in logs");
  assert.equal(loggedOutput.includes("Basic "), false, "Auth header must NEVER appear in logs");
  assert.equal(loggedOutput.includes("Authorization"), false);
  console.log("✓ Safe error formatter verified: rich cause codes logged with zero secret leakage");

  // Reset test fetch override
  setMidtransTestFetch(null);

  console.log("\n==================================================");
  console.log("ALL MIDTRANS CORE API QRIS INTEGRATION TESTS PASSED!");
  console.log("==================================================");
}

runMidtransTests().catch((err) => {
  console.error("Midtrans test failed:", err);
  process.exit(1);
});
