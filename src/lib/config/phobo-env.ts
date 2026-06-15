export function getPhoboEnv() {
  const cameraTimeoutMs = Number.parseInt(
    process.env.PHOBO_CAMERA_CAPTURE_TIMEOUT_MS || "15000",
    10,
  );

  return {
    cameraMode: process.env.PHOBO_CAMERA_MODE || "mock",
    cameraCaptureDir: process.env.PHOBO_CAMERA_CAPTURE_DIR || "C:\\PhoboCameraCaptures",
    cameraCommandConfigured: Boolean(process.env.PHOBO_CAMERA_COMMAND_PATH),
    cameraTimeoutMs: Number.isFinite(cameraTimeoutMs) ? cameraTimeoutMs : 15000,
    printerMode: process.env.PHOBO_PRINTER_MODE || "mock",
    storageMode: process.env.PHOBO_STORAGE_MODE || "local",
    driveEnabled: process.env.PHOBO_DRIVE_ENABLED === "true",
    resultsDir: process.env.PHOBO_RESULTS_DIR || "public/results",
    publicBaseUrl: process.env.PHOBO_PUBLIC_BASE_URL || "http://localhost:3000",
  };
}
