export function getPhoboEnv() {
  return {
    cameraMode: process.env.PHOBO_CAMERA_MODE || "mock",
    printerMode: process.env.PHOBO_PRINTER_MODE || "mock",
    storageMode: process.env.PHOBO_STORAGE_MODE || "local",
    driveEnabled: process.env.PHOBO_DRIVE_ENABLED === "true",
    resultsDir: process.env.PHOBO_RESULTS_DIR || "public/results",
    publicBaseUrl: process.env.PHOBO_PUBLIC_BASE_URL || "http://localhost:3000",
  };
}
