import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

console.log("==================================================");
console.log("RUNNING PACKAGE CONTRACT & MULTI-PRINT TESTS");
console.log("==================================================");

async function runPackageContractTests() {
  const { packages, getPackageById } = await import("../src/lib/phobo-data.ts");
  const { executeSequentialPrintJobs } = await import("../src/lib/hardware/printer-adapter.ts");
  const { generatePostcardPrint, PRINT_WIDTH_PX, PRINT_HEIGHT_PX } = await import("../src/lib/print/print-template.ts");

  // ================================================================
  // PART 1: Authoritative Package Metadata (Requirement 1 & 2)
  // ================================================================
  console.log("\nStep 1: Validating Authoritative Package Metadata...");

  const basic = getPackageById("basic");
  assert.ok(basic, "Basic package must exist");
  assert.equal(basic.requiredFrameCount, 1, "Basic requiredFrameCount must be 1");
  assert.equal(basic.requiredShotCount, 8, "Basic requiredShotCount must be 8");
  assert.equal(basic.includedPrintCount, 1, "Basic includedPrintCount must be 1");
  assert.equal(basic.durationMinutes, 5, "Basic durationMinutes must be 5");
  assert.equal(basic.price, 45000, "Basic price must be 45000");
  console.log("✓ BASIC: 1 Frame, 1x Cetak, 8 Shoot, 5 menit, Rp45.000");

  const duo = getPackageById("duo");
  assert.ok(duo, "Duo package must exist");
  assert.equal(duo.requiredFrameCount, 1, "Duo requiredFrameCount must be 1 (NOT 2)");
  assert.equal(duo.requiredShotCount, 8, "Duo requiredShotCount must be 8");
  assert.equal(duo.includedPrintCount, 2, "Duo includedPrintCount must be 2");
  assert.equal(duo.durationMinutes, 7, "Duo durationMinutes must be 7");
  assert.equal(duo.price, 60000, "Duo price must be 60000");
  console.log("✓ DUO: 1 Frame, 2x Cetak, 8 Shoot, 7 menit, Rp60.000");

  const premium = getPackageById("premium");
  assert.ok(premium, "Premium package must exist");
  assert.equal(premium.requiredFrameCount, 1, "Premium requiredFrameCount must be 1 (NOT 2)");
  assert.equal(premium.requiredShotCount, 16, "Premium requiredShotCount must be 16");
  assert.equal(premium.includedPrintCount, 2, "Premium includedPrintCount must be 2");
  assert.equal(premium.durationMinutes, 10, "Premium durationMinutes must be 10");
  assert.equal(premium.price, 65000, "Premium price must be 65000");
  console.log("✓ PREMIUM: 1 Frame, 2x Cetak, 16 Shoot, 10 menit, Rp65.000");

  // Verify that all packages require exactly ONE frame
  for (const pkg of packages) {
    assert.equal(pkg.requiredFrameCount, 1, `${pkg.name} must require exactly 1 frame`);
  }
  console.log("✓ Verified all packages select exactly ONE frame");

  // ================================================================
  // PART 2: Camera Required Shot Count Gating (Requirement 4)
  // ================================================================
  console.log("\nStep 2: Validating Camera Shot Count Gating...");

  function isCameraNextAllowed(packageId, capturedCount) {
    const pkg = getPackageById(packageId);
    const required = pkg.requiredShotCount;
    return capturedCount >= required;
  }

  // Basic: 8 required
  assert.equal(isCameraNextAllowed("basic", 0), false);
  assert.equal(isCameraNextAllowed("basic", 7), false);
  assert.equal(isCameraNextAllowed("basic", 8), true);
  assert.equal(isCameraNextAllowed("basic", 9), true);
  console.log("✓ Basic camera gating: 7 shots -> NEXT disabled, 8 shots -> NEXT enabled");

  // Duo: 8 required
  assert.equal(isCameraNextAllowed("duo", 0), false);
  assert.equal(isCameraNextAllowed("duo", 7), false);
  assert.equal(isCameraNextAllowed("duo", 8), true);
  console.log("✓ Duo camera gating: 7 shots -> NEXT disabled, 8 shots -> NEXT enabled");

  // Premium: 16 required
  assert.equal(isCameraNextAllowed("premium", 0), false);
  assert.equal(isCameraNextAllowed("premium", 15), false);
  assert.equal(isCameraNextAllowed("premium", 16), true);
  assert.equal(isCameraNextAllowed("premium", 17), true);
  console.log("✓ Premium camera gating: 15 shots -> NEXT disabled, 16 shots -> NEXT enabled");

  // ================================================================
  // PART 3: Sequential Printing & Invocation Counts (Requirement 9, 10, 14)
  // ================================================================
  console.log("\nStep 3: Validating Sequential Printing & Invocation Counts...");

  // Mock printer tracking
  function createMockPrinter({ failOnJobIndex = null, failureMessage = "Paper jam" } = {}) {
    const calls = [];
    return {
      calls,
      adapter: {
        async printImage(req) {
          const jobIdx = calls.length + 1;
          calls.push({ ...req, jobIdx, timestamp: Date.now() });

          if (failOnJobIndex === jobIdx) {
            return {
              ok: false,
              mode: "mock",
              error: failureMessage,
              jobId: `mock-fail-${jobIdx}`,
            };
          }

          return {
            ok: true,
            mode: "mock",
            message: "Mock print queued",
            jobId: `mock-job-${jobIdx}`,
          };
        },
      },
    };
  }

  // Test 3A: Basic package (includedPrintCount = 1) -> 1 invocation
  const basicPrinter = createMockPrinter();
  const basicPrintRes = await executeSequentialPrintJobs({
    sessionId: "test-session-basic",
    printUrl: "/results/test-session-basic/final_print.jpg",
    count: basic.includedPrintCount,
    printerAdapter: basicPrinter.adapter,
  });
  assert.equal(basicPrintRes.ok, true, "Basic print must succeed");
  assert.equal(basicPrinter.calls.length, 1, "Basic must invoke printerAdapter exactly 1 time");
  assert.equal(basicPrinter.calls[0].printUrl, "/results/test-session-basic/final_print.jpg");
  console.log("✓ Basic package: exactly 1 printer invocation for 1 physical postcard");

  // Test 3B: Duo package (includedPrintCount = 2) -> 2 sequential invocations of same final_print.jpg
  const duoPrinter = createMockPrinter();
  const duoPrintRes = await executeSequentialPrintJobs({
    sessionId: "test-session-duo",
    printUrl: "/results/test-session-duo/final_print.jpg",
    count: duo.includedPrintCount,
    printerAdapter: duoPrinter.adapter,
  });
  assert.equal(duoPrintRes.ok, true, "Duo print must succeed");
  assert.equal(duoPrinter.calls.length, 2, "Duo must invoke printerAdapter exactly 2 times");
  assert.equal(duoPrinter.calls[0].printUrl, "/results/test-session-duo/final_print.jpg");
  assert.equal(duoPrinter.calls[1].printUrl, "/results/test-session-duo/final_print.jpg");
  assert.equal(duoPrinter.calls[0].printUrl, duoPrinter.calls[1].printUrl, "Both Duo jobs must print the exact SAME final_print.jpg");
  console.log("✓ Duo package: exactly 2 sequential printer invocations of the SAME final_print.jpg");

  // Test 3C: Premium package (includedPrintCount = 2) -> 2 sequential invocations of same final_print.jpg
  const premiumPrinter = createMockPrinter();
  const premiumPrintRes = await executeSequentialPrintJobs({
    sessionId: "test-session-premium",
    printUrl: "/results/test-session-premium/final_print.jpg",
    count: premium.includedPrintCount,
    printerAdapter: premiumPrinter.adapter,
  });
  assert.equal(premiumPrintRes.ok, true, "Premium print must succeed");
  assert.equal(premiumPrinter.calls.length, 2, "Premium must invoke printerAdapter exactly 2 times");
  assert.equal(premiumPrinter.calls[0].printUrl, premiumPrinter.calls[1].printUrl);
  console.log("✓ Premium package: exactly 2 sequential printer invocations of the SAME final_print.jpg");

  // Test 3D: Partial Failure (Job 1 succeeds, Job 2 fails)
  console.log("\nStep 4: Validating Partial Print Failure Handling...");
  const partialFailPrinter = createMockPrinter({ failOnJobIndex: 2, failureMessage: "Out of paper" });
  const partialRes = await executeSequentialPrintJobs({
    sessionId: "test-session-partial",
    printUrl: "/results/test-session-partial/final_print.jpg",
    count: 2,
    printerAdapter: partialFailPrinter.adapter,
  });
  assert.equal(partialRes.ok, false, "Partial failure must return ok=false");
  assert.equal(partialRes.completedJobs, 1, "Completed jobs must be 1");
  assert.equal(partialRes.totalJobs, 2, "Total jobs must be 2");
  assert.ok(
    partialRes.error?.includes("Print 1/2 succeeded, print 2/2 failed"),
    `Error message must report partial failure: ${partialRes.error}`
  );
  console.log(`✓ Partial print failure properly reported: ${partialRes.error}`);

  // ================================================================
  // PART 4: Transparent Asset Flattening & White Result Container (Requirement 7)
  // ================================================================
  console.log("\nStep 5: Validating Transparent Asset Flattening to Clean White...");

  // Create a 4-channel PNG with transparent corners and a red center
  const transparentPng = await sharp({
    create: {
      width: 1200,
      height: 1800,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 }, // 100% transparent
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 800,
            height: 1200,
            channels: 4,
            background: { r: 255, g: 0, b: 0, alpha: 1 }, // Solid red in center
          },
        }).png().toBuffer(),
        top: 300,
        left: 200,
      },
    ])
    .png()
    .toBuffer();

  const printJpeg = await generatePostcardPrint({
    finalImageBuffer: transparentPng,
  });

  const printMeta = await sharp(printJpeg).metadata();
  assert.equal(printMeta.width, 1181);
  assert.equal(printMeta.height, 1748);
  assert.equal(printMeta.format, "jpeg");

  // Inspect the corners (which were transparent in the PNG source)
  // In JPEG they must have been flattened to pure WHITE (r > 240, g > 240, b > 240), NOT black (r < 50)
  const rawPrintPixels = await sharp(printJpeg).raw().toBuffer();
  const channels = printMeta.channels || 3;
  const getJpegPixel = (x, y) => {
    const idx = (y * 1181 + x) * channels;
    return {
      r: rawPrintPixels[idx],
      g: rawPrintPixels[idx + 1],
      b: rawPrintPixels[idx + 2],
    };
  };

  const cornerTopLeft = getJpegPixel(50, 50);
  assert.ok(
    cornerTopLeft.r > 240 && cornerTopLeft.g > 240 && cornerTopLeft.b > 240,
    `Corner must be white (flattened), got: ${JSON.stringify(cornerTopLeft)}`
  );
  console.log(`✓ Transparent PNG properly flattened against white for JPEG print: corner RGB=(${cornerTopLeft.r}, ${cornerTopLeft.g}, ${cornerTopLeft.b})`);

  // Center (x=590, y=874) must remain RED
  const centerPixel = getJpegPixel(590, 874);
  assert.ok(
    centerPixel.r > 200 && centerPixel.g < 50 && centerPixel.b < 50,
    `Center must remain red, got: ${JSON.stringify(centerPixel)}`
  );
  console.log(`✓ Subject colors preserved accurately: center RGB=(${centerPixel.r}, ${centerPixel.g}, ${centerPixel.b})`);

  // Verify CSS in globals.css has background: #fff for .result-preview-card
  const globalsCss = await fs.readFile(path.join(projectRoot, "src", "app", "globals.css"), "utf-8");
  assert.ok(
    globalsCss.includes(".result-preview-card") && globalsCss.includes("background: #fff;"),
    "globals.css must set .result-preview-card background to #fff"
  );
  console.log("✓ Verified .result-preview-card background is #fff in globals.css");

  console.log("\n==================================================");
  console.log("ALL PACKAGE CONTRACT & MULTI-PRINT TESTS PASSED!");
  console.log("==================================================");
}

runPackageContractTests().catch((err) => {
  console.error("Package contract test failed:", err);
  process.exit(1);
});
