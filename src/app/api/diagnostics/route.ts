import { NextResponse } from "next/server";
import { getPhoboEnv } from "@/lib/config/phobo-env";
import { checkDccHealth } from "@/lib/camera/digicamcontrol-adapter";

export const runtime = "nodejs";

export async function GET() {
  const env = getPhoboEnv();
  const dccHealth = await checkDccHealth();

  return NextResponse.json({
    ok: true,
    app: "Phobo",
    timestamp: new Date().toISOString(),
    env: {
      cameraMode: env.cameraMode,
      cameraPreviewEnabled: env.cameraPreviewEnabled,
      cameraCaptureMode: env.cameraCaptureMode,
      digicamBaseUrl: env.digicamBaseUrl,
      dccReachable: dccHealth.reachable,
      dccLastCaptured: dccHealth.lastCaptured,
      dccError: dccHealth.error,
      cameraCaptureDir: env.cameraCaptureDir,
      eosWatchDir: env.eosWatchDir,
      eosAllowedExtensions: env.eosAllowedExtensions,
      cameraCommandConfigured: env.cameraCommandConfigured,
      cameraTimeoutMs: env.cameraTimeoutMs,
      printerMode: env.printerMode,
      printerNameConfigured: env.printerNameConfigured,
      printDryRun: env.printDryRun,
      printCommandMode: env.printCommandMode,
      printPaper: env.printPaper,
      printWidthPx: env.printWidthPx,
      printHeightPx: env.printHeightPx,
      storageMode: env.storageMode,
      driveEnabled: env.driveEnabled,
      resultsDir: env.resultsDir,
    },
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
      cwd: process.cwd(),
    },
  });
}
