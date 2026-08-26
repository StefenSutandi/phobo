import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const dataDir = path.join(projectRoot, "data");
const paymentOrdersFile = path.join(dataDir, "payment-orders.json");

console.log("==================================================");
console.log("RUNNING DETERMINISTIC OPERATOR PAYMENT & TRANSITION TESTS");
console.log("==================================================");

async function runPaymentTests() {
  await fs.mkdir(dataDir, { recursive: true });

  // Backup original payment orders if existing
  let originalData = null;
  try {
    originalData = await fs.readFile(paymentOrdersFile, "utf-8");
  } catch {}

  try {
    // Reset test database with one legacy order containing uniqueCode > 0
    const legacyOrder = {
      orderId: "PHOBO-MAIN-LEG1",
      sessionId: "legacy-session-001",
      paymentPurpose: "main-package",
      baseAmount: 45000,
      uniqueCode: 123,
      payableAmount: 45123,
      status: "confirmed",
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      expiresAt: new Date(Date.now() - 3000000).toISOString(),
      confirmedAt: new Date(Date.now() - 3500000).toISOString(),
    };

    await fs.writeFile(paymentOrdersFile, JSON.stringify([legacyOrder], null, 2), "utf-8");

    const {
      createOperatorOrder,
      getOperatorOrder,
      getAllOperatorOrders,
      updateOperatorOrderStatus,
    } = await import("../src/lib/payment/operator-store.ts");

    // ================================================================
    // PART 1: Core Operator Store Tests
    // ================================================================

    // 1. Validate Main Package Base Amount (45000) -> uniqueCode=0, payableAmount=45000
    console.log("\nStep 1: Testing Main Package Order Creation...");
    const mainOrder = await createOperatorOrder({
      sessionId: "session-test-001",
      paymentPurpose: "main-package",
      baseAmount: 45000,
    });

    assert.equal(mainOrder.baseAmount, 45000, "Base amount must be 45000");
    assert.equal(mainOrder.uniqueCode, 0, "New order uniqueCode MUST be 0 (no unique nominal)");
    assert.equal(mainOrder.payableAmount, 45000, "Payable amount MUST equal base amount exactly");
    assert.equal(mainOrder.status, "pending");
    assert.ok(mainOrder.orderId.startsWith("PHOBO-MAIN-"), "Order ID must have PHOBO-MAIN- prefix");
    console.log(`✓ Main order created: ${mainOrder.orderId} | Base: ${mainOrder.baseAmount} | Unique: ${mainOrder.uniqueCode} | Payable: ${mainOrder.payableAmount}`);

    // 2. Validate Add-Print Base Amount (20000) -> uniqueCode=0, payableAmount=20000
    console.log("\nStep 2: Testing Add-Print Order Creation...");
    const addPrintOrder = await createOperatorOrder({
      sessionId: "session-test-001",
      paymentPurpose: "add-print",
      baseAmount: 20000,
    });

    assert.equal(addPrintOrder.baseAmount, 20000, "Base amount must be 20000");
    assert.equal(addPrintOrder.uniqueCode, 0, "New add-print uniqueCode MUST be 0");
    assert.equal(addPrintOrder.payableAmount, 20000, "Payable amount MUST equal 20000");
    assert.equal(addPrintOrder.status, "pending");
    assert.ok(addPrintOrder.orderId.startsWith("PHOBO-ADD-"), "Order ID must have PHOBO-ADD- prefix");
    console.log(`✓ Add-Print order created: ${addPrintOrder.orderId} | Base: ${addPrintOrder.baseAmount} | Unique: ${addPrintOrder.uniqueCode} | Payable: ${addPrintOrder.payableAmount}`);

    // 3. Validate Idempotency: same session + same purpose while pending -> same order returned
    console.log("\nStep 3: Testing Idempotency for active pending orders...");
    const duplicateMainOrder = await createOperatorOrder({
      sessionId: "session-test-001",
      paymentPurpose: "main-package",
      baseAmount: 45000,
    });

    assert.equal(duplicateMainOrder.orderId, mainOrder.orderId, "Must return existing pending orderId");
    assert.equal(duplicateMainOrder.payableAmount, 45000);
    console.log(`✓ Idempotency verified: returned same order ID ${duplicateMainOrder.orderId}`);

    // 4. Validate Separation: same session with main-package vs add-print -> different order IDs
    console.log("\nStep 4: Testing separation between Main and Add-Print orders...");
    assert.notEqual(mainOrder.orderId, addPrintOrder.orderId, "Main and Add-Print must have distinct order IDs");
    console.log(`✓ Separation verified: Main=${mainOrder.orderId} != Add-Print=${addPrintOrder.orderId}`);

    // 5. Validate Confirm Action in store
    console.log("\nStep 5: Testing Operator Confirm Action in store...");
    const confirmResult = await updateOperatorOrderStatus(mainOrder.orderId, "confirm");
    assert.equal(confirmResult.ok, true, "Confirm action must succeed");
    assert.equal(confirmResult.order?.status, "confirmed");
    assert.ok(confirmResult.order?.confirmedAt, "confirmedAt timestamp must be recorded");

    const fetchedConfirmed = await getOperatorOrder(mainOrder.orderId);
    assert.equal(fetchedConfirmed?.status, "confirmed");
    console.log(`✓ Order ${mainOrder.orderId} successfully confirmed`);

    // 6. Validate Cancel Action in store
    console.log("\nStep 6: Testing Operator Cancel Action in store...");
    const cancelResult = await updateOperatorOrderStatus(addPrintOrder.orderId, "cancel");
    assert.equal(cancelResult.ok, true, "Cancel action must succeed");
    assert.equal(cancelResult.order?.status, "cancelled");

    const fetchedCancelled = await getOperatorOrder(addPrintOrder.orderId);
    assert.equal(fetchedCancelled?.status, "cancelled");
    console.log(`✓ Order ${addPrintOrder.orderId} successfully cancelled`);

    // 7. Validate Backward Compatibility with Legacy orders (uniqueCode > 0)
    console.log("\nStep 7: Testing Legacy Order Backward Compatibility...");
    const fetchedLegacy = await getOperatorOrder("PHOBO-MAIN-LEG1");
    assert.ok(fetchedLegacy, "Legacy order must be found");
    assert.equal(fetchedLegacy?.uniqueCode, 123, "Legacy uniqueCode=123 must be preserved");
    assert.equal(fetchedLegacy?.payableAmount, 45123, "Legacy payableAmount=45123 must be preserved");
    assert.equal(fetchedLegacy?.status, "confirmed");

    const allOrders = await getAllOperatorOrders();
    const legacyInList = allOrders.find((o) => o.orderId === "PHOBO-MAIN-LEG1");
    assert.ok(legacyInList, "Legacy order must appear in order list without parse errors");
    console.log(`✓ Legacy order read successfully: ${legacyInList.orderId} (Unique: ${legacyInList.uniqueCode}, Payable: ${legacyInList.payableAmount})`);

    // ================================================================
    // PART 2: Route Handlers & Kiosk Status Transition Verification
    // ================================================================
    console.log("\n==================================================");
    console.log("TESTING FULL STATUS & KIOSK TRANSITIONS (A - F)");
    console.log("==================================================");

    process.env.PHOBO_PAYMENT_PROVIDER = "operator";
    process.env.PHOBO_OPERATOR_PAYMENT_ENABLED = "true";

    const { GET: getPaymentStatusRoute } = await import("../src/app/api/payment/status/route.ts");
    const { POST: operatorActionRoute } = await import("../src/app/api/payment/operator/action/route.ts");
    const { isOperatorAuthenticated, isOperatorCookieSecure, parseCookieValue, COOKIE_NAME, SESSION_SECRET } = await import("../src/lib/payment/operator-auth.ts");

    // A. Create new operator payment order -> status pending
    console.log("\nTransition A: Create operator payment -> status pending...");
    const orderA = await createOperatorOrder({
      sessionId: "session-kiosk-live-01",
      paymentPurpose: "main-package",
      baseAmount: 45000,
    });
    assert.equal(orderA.status, "pending");
    console.log(`✓ Order created with pending status: ${orderA.orderId}`);

    // B. GET /api/payment/status?orderId=... -> pending
    console.log("\nTransition B: GET /api/payment/status -> pending...");
    const statusReqB = new Request(`http://localhost:3000/api/payment/status?orderId=${orderA.orderId}`);
    const statusResB = await getPaymentStatusRoute(statusReqB);
    const statusDataB = await statusResB.json();
    assert.equal(statusResB.status, 200);
    assert.equal(statusDataB.ok, true);
    assert.equal(statusDataB.provider, "operator");
    assert.equal(statusDataB.status, "pending");
    console.log(`✓ GET /api/payment/status returned pending for ${orderA.orderId}`);

    // C. Operator confirms via /api/payment/operator/action
    console.log("\nTransition C: Operator confirms via /api/payment/operator/action...");
    const confirmActionReq = new Request("http://localhost:3000/api/payment/operator/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "phobo_operator_session=phobo-operator-authenticated-session-key",
      },
      body: JSON.stringify({
        orderId: orderA.orderId,
        action: "confirm",
      }),
    });
    const confirmActionRes = await operatorActionRoute(confirmActionReq);
    const confirmActionData = await confirmActionRes.json();
    assert.equal(confirmActionRes.status, 200);
    assert.equal(confirmActionData.ok, true);
    assert.equal(confirmActionData.order.status, "confirmed");
    console.log(`✓ Operator action confirmed order ${orderA.orderId}`);

    // D. GET /api/payment/status?orderId=... -> confirmed immediately
    console.log("\nTransition D: GET /api/payment/status after operator confirm -> confirmed...");
    const statusReqD = new Request(`http://localhost:3000/api/payment/status?orderId=${orderA.orderId}`);
    const statusResD = await getPaymentStatusRoute(statusReqD);
    const statusDataD = await statusResD.json();
    assert.equal(statusResD.status, 200);
    assert.equal(statusDataD.ok, true);
    assert.equal(statusDataD.status, "confirmed");
    console.log(`✓ GET /api/payment/status immediately reflects confirmed status`);

    // E. /payment polling sees confirmed -> routes exactly once to /frames
    console.log("\nTransition E: Polling sees confirmed -> routes exactly once to /frames...");
    let routeCount = 0;
    let routedTarget = "";
    const fakeRouter = {
      push: (target) => {
        routeCount++;
        routedTarget = target;
      },
    };

    // Simulate the exact polling logic in src/app/payment/page.tsx
    let isRouting = false;
    let pollActive = true;
    const simulatePollCycle = async () => {
      if (!pollActive) return;
      const res = await getPaymentStatusRoute(new Request(`http://localhost:3000/api/payment/status?orderId=${orderA.orderId}`));
      const data = await res.json();
      if (data.ok && data.status) {
        if (data.status === "confirmed") {
          if (isRouting) return;
          isRouting = true;
          pollActive = false;
          fakeRouter.push("/frames");
        }
      }
    };

    // First poll tick
    await simulatePollCycle();
    // Subsequent poll tick (simulating race/next interval)
    await simulatePollCycle();

    assert.equal(routeCount, 1, "Must route to /frames EXACTLY once");
    assert.equal(routedTarget, "/frames", "Must route to /frames");
    console.log(`✓ Kiosk routed exactly once: routeCount=${routeCount}, target='${routedTarget}'`);

    // F. Cancel flow: Operator cancels -> Kiosk does NOT route to /frames
    console.log("\nTransition F: Operator cancels -> Kiosk does NOT route to /frames...");
    const orderF = await createOperatorOrder({
      sessionId: "session-kiosk-live-02",
      paymentPurpose: "main-package",
      baseAmount: 45000,
    });
    assert.equal(orderF.status, "pending");

    // Operator cancels order
    const cancelActionReq = new Request("http://localhost:3000/api/payment/operator/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "phobo_operator_session=phobo-operator-authenticated-session-key",
      },
      body: JSON.stringify({
        orderId: orderF.orderId,
        action: "cancel",
      }),
    });
    const cancelActionRes = await operatorActionRoute(cancelActionReq);
    const cancelActionData = await cancelActionRes.json();
    assert.equal(cancelActionRes.status, 200);
    assert.equal(cancelActionData.order.status, "cancelled");

    // Check status route
    const statusReqF = new Request(`http://localhost:3000/api/payment/status?orderId=${orderF.orderId}`);
    const statusResF = await getPaymentStatusRoute(statusReqF);
    const statusDataF = await statusResF.json();
    assert.equal(statusDataF.status, "cancelled");

    // Simulate kiosk polling behavior on cancel
    let cancelRouteCount = 0;
    let cancelPaymentStatus = "pending";
    let cancelPollActive = true;

    const simulateCancelPoll = async () => {
      if (!cancelPollActive) return;
      const res = await getPaymentStatusRoute(new Request(`http://localhost:3000/api/payment/status?orderId=${orderF.orderId}`));
      const data = await res.json();
      if (data.ok && data.status) {
        if (data.status === "confirmed") {
          cancelRouteCount++;
        } else if (data.status === "cancelled" || data.status === "failed" || data.status === "expired") {
          cancelPollActive = false;
          cancelPaymentStatus = data.status;
        }
      }
    };

    await simulateCancelPoll();
    assert.equal(cancelRouteCount, 0, "Cancelled order must NEVER route to /frames");
    assert.equal(cancelPaymentStatus, "cancelled", "Kiosk paymentStatus must record 'cancelled'");
    console.log(`✓ Cancel properly handled: routeCount=${cancelRouteCount}, kioskStatus='${cancelPaymentStatus}'`);

    // ================================================================
    // PART 3: Exact Cookie Authentication Hardening Tests
    // ================================================================
    console.log("\n==================================================");
    console.log("TESTING OPERATOR SESSION COOKIE HARDENING (1 - 4)");
    console.log("==================================================");

    // 1. Exact valid cookie -> authenticated
    console.log("\nAuth Test 1: Exact valid cookie -> authenticated...");
    const req1 = new Request("http://localhost:3000/api/payment/operator/action", {
      method: "POST",
      headers: { Cookie: `${COOKIE_NAME}=${SESSION_SECRET}` },
    });
    assert.equal(await isOperatorAuthenticated(req1), true, "Exact valid cookie must authenticate");
    assert.equal(parseCookieValue(`${COOKIE_NAME}=${SESSION_SECRET}`, COOKIE_NAME), SESSION_SECRET);
    console.log("✓ Exact valid cookie successfully authenticated");

    // Multi-cookie valid check:
    const req1Multi = new Request("http://localhost:3000/api/payment/operator/action", {
      method: "POST",
      headers: { Cookie: `theme=dark; ${COOKIE_NAME}=${SESSION_SECRET}; user=admin` },
    });
    assert.equal(await isOperatorAuthenticated(req1Multi), true, "Cookie in multi-cookie header must authenticate");
    console.log("✓ Exact valid cookie within multi-cookie header authenticated");

    // 2. Wrong value -> rejected
    console.log("\nAuth Test 2: Wrong cookie value -> rejected...");
    const req2 = new Request("http://localhost:3000/api/payment/operator/action", {
      method: "POST",
      headers: { Cookie: `${COOKIE_NAME}=wrong-secret-value` },
    });
    assert.equal(await isOperatorAuthenticated(req2), false, "Wrong cookie value must be rejected");
    const res2 = await operatorActionRoute(req2);
    assert.equal(res2.status, 401, "Wrong cookie value must return 401 Unauthorized");
    console.log("✓ Wrong cookie value properly rejected (401)");

    // 3. Prefixed cookie name -> rejected (prevents substring match on cookie name)
    console.log("\nAuth Test 3: Prefixed cookie name -> rejected...");
    const req3 = new Request("http://localhost:3000/api/payment/operator/action", {
      method: "POST",
      headers: { Cookie: `x${COOKIE_NAME}=${SESSION_SECRET}` },
    });
    assert.equal(await isOperatorAuthenticated(req3), false, "Prefixed cookie name must be rejected");
    assert.equal(parseCookieValue(`x${COOKIE_NAME}=${SESSION_SECRET}`, COOKIE_NAME), null);
    const res3 = await operatorActionRoute(req3);
    assert.equal(res3.status, 401, "Prefixed cookie name must return 401 Unauthorized");
    console.log("✓ Prefixed cookie name properly rejected (401)");

    // 4. Value with suffix/prefix -> rejected (prevents substring match on value)
    console.log("\nAuth Test 4: Cookie value with suffix/prefix -> rejected...");
    const req4Suffix = new Request("http://localhost:3000/api/payment/operator/action", {
      method: "POST",
      headers: { Cookie: `${COOKIE_NAME}=${SESSION_SECRET}-extra-suffix` },
    });
    assert.equal(await isOperatorAuthenticated(req4Suffix), false, "Cookie value with suffix must be rejected");
    const res4Suffix = await operatorActionRoute(req4Suffix);
    assert.equal(res4Suffix.status, 401, "Cookie value with suffix must return 401 Unauthorized");

    const req4Prefix = new Request("http://localhost:3000/api/payment/operator/action", {
      method: "POST",
      headers: { Cookie: `${COOKIE_NAME}=extra-prefix-${SESSION_SECRET}` },
    });
    assert.equal(await isOperatorAuthenticated(req4Prefix), false, "Cookie value with prefix must be rejected");
    const res4Prefix = await operatorActionRoute(req4Prefix);
    assert.equal(res4Prefix.status, 401, "Cookie value with prefix must return 401 Unauthorized");
    console.log("✓ Cookie value with suffix/prefix properly rejected (401)");

    // 5. Operator cookie secure flag behavior
    console.log("\nAuth Test 5: Operator cookie secure flag configuration...");
    delete process.env.PHOBO_OPERATOR_COOKIE_SECURE;
    assert.equal(isOperatorCookieSecure(), false, "Default must be false for LAN HTTP");
    process.env.PHOBO_OPERATOR_COOKIE_SECURE = "false";
    assert.equal(isOperatorCookieSecure(), false, "Explicit 'false' must be false");
    process.env.PHOBO_OPERATOR_COOKIE_SECURE = "true";
    assert.equal(isOperatorCookieSecure(), true, "Explicit 'true' must be true");
    process.env.PHOBO_OPERATOR_COOKIE_SECURE = "false";
    console.log("✓ Operator cookie secure flag verified (defaults to false for LAN)");

    // ================================================================
    // PART 4: Asset & Route Validation (/admin/payment -> /admin/payments, qris.png)
    // ================================================================
    console.log("\n==================================================");
    console.log("TESTING ASSETS & ROUTES (/admin/payment ALIAS, QRIS)");
    console.log("==================================================");

    // 1. Validate public/assets/payment/qris.png exists
    const qrisAssetPath = path.join(projectRoot, "public", "assets", "payment", "qris.png");
    const qrisStat = await fs.stat(qrisAssetPath);
    assert.ok(qrisStat.isFile(), "public/assets/payment/qris.png must be a file");
    assert.ok(qrisStat.size > 1000, "public/assets/payment/qris.png must be a non-empty image");
    console.log(`✓ QRIS asset verified on disk: ${qrisAssetPath} (${qrisStat.size} bytes)`);

    // 2. Validate /admin/payment redirects to /admin/payments
    const { default: AdminPaymentRedirect } = await import("../src/app/admin/payment/page.tsx");
    let redirectedTo = "";
    try {
      AdminPaymentRedirect();
    } catch (redirectError) {
      // Next.js redirect throws a NEXT_REDIRECT digest
      if (redirectError && typeof redirectError === "object" && "digest" in redirectError) {
        const digest = String(redirectError.digest);
        assert.ok(digest.includes("/admin/payments"), `Redirect digest must target /admin/payments: ${digest}`);
        redirectedTo = "/admin/payments";
      } else {
        throw redirectError;
      }
    }
    assert.equal(redirectedTo, "/admin/payments", "/admin/payment must redirect to /admin/payments");
    console.log("✓ /admin/payment route cleanly redirects to /admin/payments");

    console.log("\n==================================================");
    console.log("ALL OPERATOR PAYMENT, TRANSITION, AUTH & ASSET TESTS PASSED!");
    console.log("==================================================");
  } finally {
    // Restore original file if it existed
    if (originalData !== null) {
      await fs.writeFile(paymentOrdersFile, originalData, "utf-8");
    }
  }
}

runPaymentTests().catch((err) => {
  console.error("Payment test failed:", err);
  process.exit(1);
});
