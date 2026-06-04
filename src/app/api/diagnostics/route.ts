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
      printerMode: env.printerMode,
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
