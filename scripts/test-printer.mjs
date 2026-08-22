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
  const { generatePostcardPrint, PRINT_WIDTH_PX, PRINT_HEIGHT_PX } = await import("../src/lib/print/print-template.ts");
  const printerAdapter = new PrinterAdapter();

  // ================================================================
  // PART 1: Single Portrait Postcard Asset Generation (Task 1, 2, 3, 9)
  // ================================================================
  console.log("\nStep 1: Validating Single Portrait Postcard Asset Generation...");
  assert.equal(PRINT_WIDTH_PX, 1181, "Print width must be 1181 px (100mm @ 300DPI)");
  assert.equal(PRINT_HEIGHT_PX, 1748, "Print height must be 1748 px (148mm @ 300DPI)");

  // Create a synthetic 1200x1800 final_screen image with 3 distinct vertical bands:
  // Top: RED, Middle: GREEN, Bottom: BLUE
  const redBand = { create: { width: 1200, height: 600, channels: 3, background: { r: 255, g: 0, b: 0 } } };
  const greenBand = { create: { width: 1200, height: 600, channels: 3, background: { r: 0, g: 255, b: 0 } } };
  const blueBand = { create: { width: 1200, height: 600, channels: 3, background: { r: 0, g: 0, b: 255 } } };

  const redBuf = await sharp(redBand).png().toBuffer();
  const greenBuf = await sharp(greenBand).png().toBuffer();
  const blueBuf = await sharp(blueBand).png().toBuffer();

  const syntheticFinalScreen = await sharp({
    create: { width: 1200, height: 1800, channels: 3, background: "black" },
  })
    .composite([
      { input: redBuf, top: 0, left: 0 },
      { input: greenBuf, top: 600, left: 0 },
      { input: blueBuf, top: 1200, left: 0 },
    ])
    .png()
    .toBuffer();

  const postcardBuffer = await generatePostcardPrint({
    finalImageBuffer: syntheticFinalScreen,
  });

  const postcardMetadata = await sharp(postcardBuffer).metadata();
  assert.equal(postcardMetadata.width, 1181, "Postcard width must be 1181 px");
  assert.equal(postcardMetadata.height, 1748, "Postcard height must be 1748 px");
  assert.equal(postcardMetadata.format, "jpeg", "Postcard format must be JPEG");
  assert.ok(
    typeof postcardMetadata.height === "number" &&
    typeof postcardMetadata.width === "number" &&
    postcardMetadata.height > postcardMetadata.width,
    "Postcard must be in PORTRAIT orientation"
  );
  console.log(`✓ Single portrait postcard generated: ${postcardMetadata.width}x${postcardMetadata.height} px`);

  // Verify vertical band preservation and absence of 2-up horizontal duplication
  const rawPixels = await sharp(postcardBuffer).raw().toBuffer();
  const channels = postcardMetadata.channels || 3;
  const getPixel = (x, y) => {
    const idx = (y * 1181 + x) * channels;
    return {
      r: rawPixels[idx],
      g: rawPixels[idx + 1],
      b: rawPixels[idx + 2],
    };
  };

  // Top (y=200): Should be primarily RED
  const topPixel = getPixel(590, 200);
  assert.ok(topPixel.r > 200 && topPixel.g < 50 && topPixel.b < 50, `Top must be red: ${JSON.stringify(topPixel)}`);

  // Center (y=874): Should be primarily GREEN across left, center, right (no white gap / no 2-up split)
  const centerLeft = getPixel(100, 874);
  const centerMid = getPixel(590, 874);
  const centerRight = getPixel(1080, 874);
  assert.ok(centerLeft.g > 200 && centerLeft.r < 50, "Center left must be green");
  assert.ok(centerMid.g > 200 && centerMid.r < 50, "Center middle must be green");
  assert.ok(centerRight.g > 200 && centerRight.r < 50, "Center right must be green");

  // Bottom (y=1500): Should be primarily BLUE
  const bottomPixel = getPixel(590, 1500);
  assert.ok(bottomPixel.b > 200 && bottomPixel.r < 50 && bottomPixel.g < 50, `Bottom must be blue: ${JSON.stringify(bottomPixel)}`);

  console.log("✓ Postcard content verified: single unified portrait composition without horizontal duplication or white 2-up borders");

  // Verify error when finalImageUrl is missing
  await assert.rejects(
    async () => {
      await generatePostcardPrint({});
    },
    /Final composed image is required/,
    "Must throw error if final composed image is missing"
  );
  console.log("✓ Error handling verified when final composed image is missing");

  // ================================================================
  // PART 2: Pure Print Layout & Sizing Calculations (Task 10)
  // ================================================================
  console.log("\nStep 2: Validating Pure Print Layout Calculations for Portrait Postcard...");

  // Test 2A: Exact ratio portrait image onto metric 100x148mm postcard (394 x 583 units in hundredths of inch)
  const metricPostcardPortrait = computePrintDestination({
    imageWidth: 1181,
    imageHeight: 1748,
    pageWidth: 394,
    pageHeight: 583,
    fitMode: "fill",
  });
  assert.equal(metricPostcardPortrait.isLandscapeImage, false);
  assert.equal(metricPostcardPortrait.isLandscapePage, false);
  assert.equal(metricPostcardPortrait.destination.width, 394);
  assert.equal(metricPostcardPortrait.destination.height, 583);
  assert.equal(metricPostcardPortrait.destination.x, 0);
  assert.equal(metricPostcardPortrait.destination.y, 0);
  assert.ok(metricPostcardPortrait.fillRatio >= 1.0, "Fill ratio must cover 100% of the page");
  console.log(`✓ Metric 100x148mm Portrait Postcard FILL: 1181x1748 -> [${metricPostcardPortrait.destination.x}, ${metricPostcardPortrait.destination.y}, ${metricPostcardPortrait.destination.width}, ${metricPostcardPortrait.destination.height}] (fillRatio=${metricPostcardPortrait.fillRatio.toFixed(3)})`);

  // Test 2B: Standard 4R portrait page (400 x 600 units)
  const standard4RPortrait = computePrintDestination({
    imageWidth: 1181,
    imageHeight: 1748,
    pageWidth: 400,
    pageHeight: 600,
    fitMode: "fill",
  });
  assert.equal(standard4RPortrait.isLandscapeImage, false);
  assert.ok(standard4RPortrait.destination.width >= 400);
  assert.equal(standard4RPortrait.destination.height, 600);
  assert.ok(standard4RPortrait.fillRatio >= 1.0);
  console.log(`✓ Standard 4R Portrait Postcard FILL: 1181x1748 -> [${standard4RPortrait.destination.x}, ${standard4RPortrait.destination.y}, ${standard4RPortrait.destination.width}, ${standard4RPortrait.destination.height}]`);

  // ================================================================
  // PART 3: PowerShell Script Generation Verification
  // ================================================================
  console.log("\nStep 3: Validating Generated PowerShell Script Properties...");
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
  // PART 4: End-to-End Adapter Execution with Portrait Asset
  // ================================================================
  // Create a synthetic 1181x1748 test print JPEG image on disk
  const testDir = path.join(projectRoot, "public", "results", "test-print-session");
  await fs.mkdir(testDir, { recursive: true });
  const testImagePath = path.join(testDir, "final_print.jpg");

  console.log("\nStep 4: Writing synthetic 1181x1748 print JPEG image on disk...");
  await fs.writeFile(testImagePath, postcardBuffer);
  console.log(`✓ Synthetic print image created: ${testImagePath}`);

  // Test 4A: Mock Mode Print
  console.log("\nStep 5: Testing Mock printer mode...");
  process.env.PHOBO_PRINTER_MODE = "mock";
  const mockResult = await printerAdapter.printImage({
    sessionId: "test-print-session",
    printUrl: "/results/test-print-session/final_print.jpg",
  });
  assert.equal(mockResult.ok, true, "Mock print must succeed");
  assert.equal(mockResult.mode, "mock");
  console.log("✓ Mock printer mode succeeded");

  if (process.platform === "win32") {
    // Test 4B: Windows Direct Print - Dry Run Mode with Portrait Asset
    console.log("\nStep 6: Testing Windows Direct Print in Dry Run mode (Canon SELPHY CP1500)...");
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
    assert.ok(dryRunResult.stdout?.includes("ImagePx=1181x1748"), "Stdout must confirm ImagePx=1181x1748");
    assert.ok(dryRunResult.stdout?.includes("Landscape=False"), "Stdout must confirm Landscape=False for portrait asset");
    assert.ok(dryRunResult.stdout?.includes("[Printer Layout]"), "Stdout must report [Printer Layout]");
    console.log(`✓ Dry Run Windows Direct Print validated with portrait layout diagnostics:\n${dryRunResult.stdout?.trim()}`);

    // Test 4C: Missing Print Image File
    console.log("\nStep 7: Testing error handling for missing print file...");
    const missingResult = await printerAdapter.printImage({
      sessionId: "test-print-session",
      printUrl: "/results/test-print-session/nonexistent_print.jpg",
    });
    assert.equal(missingResult.ok, false, "Missing print file must fail");
    assert.ok(missingResult.error?.includes("does not exist"), "Error must state file does not exist");
    console.log(`✓ Missing file properly rejected: ${missingResult.error}`);

    // Test 4D: Nonexistent / Invalid Printer Name
    console.log("\nStep 8: Testing error handling for invalid/uninstalled printer name...");
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
  console.log("ALL PRINTER & SIZING TESTS PASSED!");
  console.log("==================================================");
}

runPrinterTests().catch((err) => {
  console.error("Printer test failed:", err);
  process.exit(1);
});
