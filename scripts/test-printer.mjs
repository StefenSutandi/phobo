import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

console.log("==================================================");
console.log("RUNNING DETERMINISTIC DIRECT PRINTER TESTS");
console.log("==================================================");

async function runPrinterTests() {
  const { PrinterAdapter } = await import("../src/lib/hardware/printer-adapter.ts");
  const printerAdapter = new PrinterAdapter();

  // Create a synthetic 1748x1181 test print JPEG image
  const testDir = path.join(projectRoot, "public", "results", "test-print-session");
  await fs.mkdir(testDir, { recursive: true });
  const testImagePath = path.join(testDir, "final_print.jpg");

  console.log("Step 1: Generating synthetic 1748x1181 print JPEG image...");
  const dummyBuffer = await sharp({
    create: {
      width: 1748,
      height: 1181,
      channels: 3,
      background: { r: 240, g: 240, b: 240 },
    },
  })
    .jpeg({ quality: 95 })
    .toBuffer();

  await fs.writeFile(testImagePath, dummyBuffer);
  console.log(`✓ Synthetic print image created: ${testImagePath}`);

  // Test 1: Mock Mode Print
  console.log("\nStep 2: Testing Mock printer mode...");
  process.env.PHOBO_PRINTER_MODE = "mock";
  const mockResult = await printerAdapter.printImage({
    sessionId: "test-print-session",
    printUrl: "/results/test-print-session/final_print.jpg",
  });
  assert.equal(mockResult.ok, true, "Mock print must succeed");
  assert.equal(mockResult.mode, "mock");
  console.log("✓ Mock printer mode succeeded");

  if (process.platform === "win32") {
    // Test 2: Windows Direct Print - Dry Run Mode with Valid Printer
    console.log("\nStep 3: Testing Windows Direct Print in Dry Run mode (Canon SELPHY CP1500)...");
    process.env.PHOBO_PRINTER_MODE = "windows";
    process.env.PHOBO_PRINTER_NAME = "Canon SELPHY CP1500";
    process.env.PHOBO_PRINT_DRY_RUN = "true";

    const dryRunResult = await printerAdapter.printImage({
      sessionId: "test-print-session",
      printUrl: "/results/test-print-session/final_print.jpg",
    });

    assert.equal(dryRunResult.ok, true, `Dry run print must succeed: ${dryRunResult.error}`);
    assert.equal(dryRunResult.mode, "windows");
    assert.ok(dryRunResult.stdout?.includes("DRY_RUN_OK"), "Stdout must confirm DRY_RUN_OK");
    console.log(`✓ Dry Run Windows Direct Print validated: ${dryRunResult.stdout?.trim()}`);

    // Test 3: Missing Print Image File
    console.log("\nStep 4: Testing error handling for missing print file...");
    const missingResult = await printerAdapter.printImage({
      sessionId: "test-print-session",
      printUrl: "/results/test-print-session/nonexistent_print.jpg",
    });
    assert.equal(missingResult.ok, false, "Missing print file must fail");
    assert.ok(missingResult.error?.includes("does not exist"), "Error must state file does not exist");
    console.log(`✓ Missing file properly rejected: ${missingResult.error}`);

    // Test 4: Nonexistent / Invalid Printer Name
    console.log("\nStep 5: Testing error handling for invalid/uninstalled printer name...");
    process.env.PHOBO_PRINTER_NAME = "Nonexistent_Printer_99999";
    const invalidPrinterResult = await printerAdapter.printImage({
      sessionId: "test-print-session",
      printUrl: "/results/test-print-session/final_print.jpg",
    });
    assert.equal(invalidPrinterResult.ok, false, "Invalid printer name must fail");
    assert.ok(
      invalidPrinterResult.error?.includes("not found among installed printers") ||
      invalidPrinterResult.stderr?.includes("not found among installed printers"),
      "Error must inform that printer was not found"
    );
    console.log(`✓ Invalid printer properly rejected: ${invalidPrinterResult.error || invalidPrinterResult.stderr}`);
  }

  // Cleanup test artifacts
  await fs.rm(testDir, { recursive: true, force: true });
  console.log("\n✓ Test artifacts cleaned up");

  console.log("\n==================================================");
  console.log("ALL PRINTER TESTS PASSED!");
  console.log("==================================================");
}

runPrinterTests().catch((err) => {
  console.error("Printer test failed:", err);
  process.exit(1);
});
