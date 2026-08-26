import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const dataDir = path.join(projectRoot, "data");
const paymentOrdersFile = path.join(dataDir, "payment-orders.json");

console.log("==================================================");
console.log("RUNNING DETERMINISTIC OPERATOR PAYMENT VALIDATION");
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

    // 5. Validate Confirm Action
    console.log("\nStep 5: Testing Operator Confirm Action...");
    const confirmResult = await updateOperatorOrderStatus(mainOrder.orderId, "confirm");
    assert.equal(confirmResult.ok, true, "Confirm action must succeed");
    assert.equal(confirmResult.order?.status, "confirmed");
    assert.ok(confirmResult.order?.confirmedAt, "confirmedAt timestamp must be recorded");

    const fetchedConfirmed = await getOperatorOrder(mainOrder.orderId);
    assert.equal(fetchedConfirmed?.status, "confirmed");
    console.log(`✓ Order ${mainOrder.orderId} successfully confirmed`);

    // 6. Validate Cancel Action
    console.log("\nStep 6: Testing Operator Cancel Action...");
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

    console.log("\n==================================================");
    console.log("ALL OPERATOR PAYMENT TESTS PASSED!");
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
