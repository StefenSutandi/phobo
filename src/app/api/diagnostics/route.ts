import { NextResponse } from "next/server";
import { getPhoboEnv } from "@/lib/config/phobo-env";

export function GET() {
  const env = getPhoboEnv();

  return NextResponse.json({
    ok: true,
    app: "Phobo",
    timestamp: new Date().toISOString(),
    env: {
      cameraMode: env.cameraMode,
      cameraCaptureDir: env.cameraCaptureDir,
      eosWatchDir: env.eosWatchDir,
      eosAllowedExtensions: env.eosAllowedExtensions,
      cameraCommandConfigured: env.cameraCommandConfigured,
      cameraTimeoutMs: env.cameraTimeoutMs,
      printerMode: env.printerMode,
      printerNameConfigured: env.printerNameConfigured,
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
