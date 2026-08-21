import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

console.log("==================================================");
console.log("RUNNING DETERMINISTIC DIRECT PRINTER & SIZING TESTS");
console.log("==================================================");

async function runPrinterTests() {
  const { computePrintDestination } = await import("../src/lib/hardware/print-layout.ts");
  const { PrinterAdapter, buildDirectPrintScript } = await import("../src/lib/hardware/printer-adapter.ts");
  const printerAdapter = new PrinterAdapter();

  // ================================================================
  // PART 1: Pure Layout & Sizing Calculations
  // ================================================================
  console.log("\nStep 1: Validating Pure Print Layout Calculations...");

  // Test 1A: Exact ratio
  const exactLayout = computePrintDestination({
    imageWidth: 1748,
    imageHeight: 1181,
    pageWidth: 1748,
    pageHeight: 1181,
    fitMode: "fill",
  });
  assert.equal(exactLayout.scale, 1.0);
  assert.deepEqual(exactLayout.destination, { x: 0, y: 0, width: 1748, height: 1181 });
  console.log("✓ Exact ratio layout: 1748x1181 -> 1748x1181 (scale=1.0)");

  // Test 1B: Standard 4R / Postcard page (600 x 400 units in hundredths of an inch) with FILL
  const postcardFill = computePrintDestination({
    imageWidth: 1748,
    imageHeight: 1181,
    pageWidth: 600,
    pageHeight: 400,
    fitMode: "fill",
  });
  assert.equal(postcardFill.destination.width, 600, "Fill width must equal page width 600");
  assert.ok(postcardFill.destination.height >= 400, "Fill height must cover page height 400");
  assert.equal(postcardFill.destination.x, 0, "Centered horizontally at 0");
  assert.ok(postcardFill.destination.y <= 0, "Centered vertically with minimal symmetric top/bottom crop");
  assert.ok(postcardFill.fillRatio >= 1.0, "Fill ratio must cover 100% of the page area");
  console.log(`✓ 4R Postcard FILL layout: 1748x1181 -> [${postcardFill.destination.x}, ${postcardFill.destination.y}, ${postcardFill.destination.width}, ${postcardFill.destination.height}] (fillRatio=${postcardFill.fillRatio.toFixed(3)})`);

  // Test 1C: Old 1-inch-margin comparison (400 x 200 usable area) showing why physical print was tiny
  const oldMarginLayout = computePrintDestination({
    imageWidth: 1748,
    imageHeight: 1181,
    pageWidth: 400,
    pageHeight: 200,
    pageX: 100,
    pageY: 100,
    fitMode: "contain",
  });
  assert.equal(oldMarginLayout.destination.width, 296, "Old margin-bounds shrunk width to 296");
  assert.equal(oldMarginLayout.destination.height, 200, "Old margin-bounds shrunk height to 200");
  const oldCoverageOfSheet = (oldMarginLayout.destination.width * oldMarginLayout.destination.height) / (600 * 400);
  assert.ok(oldCoverageOfSheet < 0.26, "Old margin bounds covered <26% of physical 4R sheet");
  console.log(`✓ Proven Root Cause: Old MarginBounds produced tiny ~296x200 image occupying only ${(oldCoverageOfSheet * 100).toFixed(1)}% of 4R page`);

  // Test 1D: Standard 4R / Postcard page with CONTAIN
  const postcardContain = computePrintDestination({
    imageWidth: 1748,
    imageHeight: 1181,
    pageWidth: 600,
    pageHeight: 400,
    fitMode: "contain",
  });
  assert.equal(postcardContain.destination.width, 592);
  assert.equal(postcardContain.destination.height, 400);
  assert.equal(postcardContain.destination.x, 4);
  assert.equal(postcardContain.destination.y, 0);
  console.log(`✓ 4R Postcard CONTAIN layout: 1748x1181 -> [${postcardContain.destination.x}, ${postcardContain.destination.y}, ${postcardContain.destination.width}, ${postcardContain.destination.height}]`);

  // Test 1E: Metric 100x148mm Postcard (583 x 394 units)
  const metricPostcard = computePrintDestination({
    imageWidth: 1748,
    imageHeight: 1181,
    pageWidth: 583,
    pageHeight: 394,
    fitMode: "fill",
  });
  assert.equal(metricPostcard.destination.width, 583);
  assert.ok(metricPostcard.destination.height >= 394);
  console.log(`✓ Metric 100x148mm Postcard layout: 1748x1181 -> [${metricPostcard.destination.x}, ${metricPostcard.destination.y}, ${metricPostcard.destination.width}, ${metricPostcard.destination.height}]`);

  // Test 1F: Portrait image on portrait page
  const portraitLayout = computePrintDestination({
    imageWidth: 1181,
    imageHeight: 1748,
    pageWidth: 400,
    pageHeight: 600,
    fitMode: "fill",
  });
  assert.equal(portraitLayout.isLandscapeImage, false);
  assert.equal(portraitLayout.destination.height, 600);
  assert.ok(portraitLayout.destination.width >= 400);
  console.log(`✓ Portrait layout: 1181x1748 -> [${portraitLayout.destination.x}, ${portraitLayout.destination.y}, ${portraitLayout.destination.width}, ${portraitLayout.destination.height}]`);

  // ================================================================
  // PART 2: PowerShell Script Generation Verification
  // ================================================================
  console.log("\nStep 2: Validating Generated PowerShell Script Properties...");
  const scriptContent = buildDirectPrintScript({
    filePath: "C:\\dummy\\final_print.jpg",
    printerName: "Canon SELPHY CP1500",
    dryRun: true,
    fitMode: "fill",
  });

  assert.ok(scriptContent.includes("Margins(0, 0, 0, 0)"), "Script must set 0 margins");
  assert.ok(scriptContent.includes("$doc.OriginAtMargins = $false"), "Script must disable origin at margins");
  assert.ok(scriptContent.includes("postcard"), "Script must search for postcard media");
  assert.ok(scriptContent.includes("[Printer Layout]"), "Script must output layout diagnostics");
  assert.ok(scriptContent.includes("DRY_RUN_OK"), "Script must report dry-run completion with dimensions");
  console.log("✓ PowerShell print script verified: zero margins, postcard selection, and layout diagnostics present");

  // ================================================================
  // PART 3: End-to-End Adapter Execution
  // ================================================================
  // Create a synthetic 1748x1181 test print JPEG image
  const testDir = path.join(projectRoot, "public", "results", "test-print-session");
  await fs.mkdir(testDir, { recursive: true });
  const testImagePath = path.join(testDir, "final_print.jpg");

  console.log("\nStep 3: Generating synthetic 1748x1181 print JPEG image on disk...");
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

  // Test 3A: Mock Mode Print
  console.log("\nStep 4: Testing Mock printer mode...");
  process.env.PHOBO_PRINTER_MODE = "mock";
  const mockResult = await printerAdapter.printImage({
    sessionId: "test-print-session",
    printUrl: "/results/test-print-session/final_print.jpg",
  });
  assert.equal(mockResult.ok, true, "Mock print must succeed");
  assert.equal(mockResult.mode, "mock");
  console.log("✓ Mock printer mode succeeded");

  if (process.platform === "win32") {
    // Test 3B: Windows Direct Print - Dry Run Mode with Valid Printer
    console.log("\nStep 5: Testing Windows Direct Print in Dry Run mode (Canon SELPHY CP1500)...");
    process.env.PHOBO_PRINTER_MODE = "windows";
    process.env.PHOBO_PRINTER_NAME = "Canon SELPHY CP1500";
    process.env.PHOBO_PRINT_DRY_RUN = "true";
    process.env.PHOBO_PRINT_FIT = "fill";

    const dryRunResult = await printerAdapter.printImage({
      sessionId: "test-print-session",
      printUrl: "/results/test-print-session/final_print.jpg",
    });

    assert.equal(dryRunResult.ok, true, `Dry run print must succeed: ${dryRunResult.error}`);
    assert.equal(dryRunResult.mode, "windows");
    assert.ok(dryRunResult.stdout?.includes("DRY_RUN_OK"), "Stdout must confirm DRY_RUN_OK");
    assert.ok(dryRunResult.stdout?.includes("[Printer Layout]"), "Stdout must report [Printer Layout]");
    console.log(`✓ Dry Run Windows Direct Print validated with full layout diagnostics:\n${dryRunResult.stdout?.trim()}`);

    // Test 3C: Missing Print Image File
    console.log("\nStep 6: Testing error handling for missing print file...");
    const missingResult = await printerAdapter.printImage({
      sessionId: "test-print-session",
      printUrl: "/results/test-print-session/nonexistent_print.jpg",
    });
    assert.equal(missingResult.ok, false, "Missing print file must fail");
    assert.ok(missingResult.error?.includes("does not exist"), "Error must state file does not exist");
    console.log(`✓ Missing file properly rejected: ${missingResult.error}`);

    // Test 3D: Nonexistent / Invalid Printer Name
    console.log("\nStep 7: Testing error handling for invalid/uninstalled printer name...");
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
