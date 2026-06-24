export function getPhoboEnv() {
  const cameraTimeoutMs = Number.parseInt(
    process.env.PHOBO_CAMERA_CAPTURE_TIMEOUT_MS || "15000",
    10,
  );
  const printWidthPx = Number.parseInt(process.env.PHOBO_PRINT_WIDTH_PX || "1748", 10);
  const printHeightPx = Number.parseInt(process.env.PHOBO_PRINT_HEIGHT_PX || "1181", 10);

  return {
    cameraMode: (process.env.PHOBO_CAMERA_MODE === "command" || process.env.PHOBO_CAMERA_MODE === "eos-watch")
      ? process.env.PHOBO_CAMERA_MODE
      : "mock",
    cameraCaptureDir: process.env.PHOBO_CAMERA_CAPTURE_DIR || "C:\\PhoboCameraCaptures",
    eosWatchDir: process.env.PHOBO_EOS_WATCH_DIR || "C:\\PhoboCameraIncoming",
    eosAllowedExtensions: (process.env.PHOBO_EOS_ALLOWED_EXTENSIONS || ".jpg,.jpeg,.png").split(",").map(ext => ext.trim().toLowerCase()),
    cameraCommandConfigured: Boolean(process.env.PHOBO_CAMERA_COMMAND_PATH),
    cameraTimeoutMs: Number.isFinite(cameraTimeoutMs) ? cameraTimeoutMs : 20000,
    printerMode: process.env.PHOBO_PRINTER_MODE || "mock",
    printerNameConfigured: Boolean(process.env.PHOBO_PRINTER_NAME),
    printCommandMode: process.env.PHOBO_PRINT_COMMAND_MODE || "powershell-printto",
    printPaper: process.env.PHOBO_PRINT_PAPER || "4R",
    printWidthPx: Number.isFinite(printWidthPx) ? printWidthPx : 1748,
    printHeightPx: Number.isFinite(printHeightPx) ? printHeightPx : 1181,
    storageMode: process.env.PHOBO_STORAGE_MODE || "local",
    driveEnabled: process.env.PHOBO_DRIVE_ENABLED === "true",
    resultsDir: process.env.PHOBO_RESULTS_DIR || "public/results",
    publicBaseUrl: process.env.PHOBO_PUBLIC_BASE_URL || "http://localhost:3000",
  };
}
