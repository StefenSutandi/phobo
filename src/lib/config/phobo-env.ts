export function getPhoboEnv() {
  const cameraTimeoutMs = Number.parseInt(
    process.env.PHOBO_CAMERA_CAPTURE_TIMEOUT_MS || "15000",
    10,
  );
  const printWidthPx = Number.parseInt(process.env.PHOBO_PRINT_WIDTH_PX || "1748", 10);
  const printHeightPx = Number.parseInt(process.env.PHOBO_PRINT_HEIGHT_PX || "1181", 10);

  return {
    cameraMode: (process.env.PHOBO_CAMERA_MODE === "command" || process.env.PHOBO_CAMERA_MODE === "eos-watch" || process.env.PHOBO_CAMERA_MODE === "browser-video" || process.env.PHOBO_CAMERA_MODE === "digicam-live")
      ? process.env.PHOBO_CAMERA_MODE
      : "mock",
    cameraPreviewEnabled: process.env.PHOBO_CAMERA_PREVIEW_ENABLED !== "false",
    cameraCaptureMode: process.env.PHOBO_CAMERA_CAPTURE_MODE === "digicamcontrol" ? "digicamcontrol" : (process.env.PHOBO_CAMERA_CAPTURE_MODE || "fallback"),
    digicamBaseUrl: process.env.PHOBO_DIGICAM_BASE_URL || "http://127.0.0.1:5513",
    cameraCaptureDir: process.env.PHOBO_CAMERA_CAPTURE_DIR || "C:\\PhoboCameraCaptures",
    eosWatchDir: process.env.PHOBO_EOS_WATCH_DIR || "C:\\PhoboCameraIncoming",
    eosAllowedExtensions: (process.env.PHOBO_EOS_ALLOWED_EXTENSIONS || ".jpg,.jpeg,.png").split(",").map(ext => ext.trim().toLowerCase()),
    cameraCommandConfigured: Boolean(process.env.PHOBO_CAMERA_COMMAND_PATH),
    cameraTimeoutMs: Number.isFinite(cameraTimeoutMs) ? cameraTimeoutMs : 20000,
    printerMode: process.env.PHOBO_PRINTER_MODE || "mock",
    printerNameConfigured: Boolean(process.env.PHOBO_PRINTER_NAME),
    printDryRun: process.env.PHOBO_PRINT_DRY_RUN === "true",
    printCommandMode: process.env.PHOBO_PRINT_COMMAND_MODE || "direct-dotnet",
    printPaper: process.env.PHOBO_PRINT_PAPER || "4R",
    printWidthPx: Number.isFinite(printWidthPx) ? printWidthPx : 1748,
    printHeightPx: Number.isFinite(printHeightPx) ? printHeightPx : 1181,
    storageMode: process.env.PHOBO_STORAGE_MODE || "local",
    driveEnabled: process.env.PHOBO_DRIVE_ENABLED === "true",
    resultsDir: process.env.PHOBO_RESULTS_DIR || "public/results",
    publicBaseUrl: process.env.PHOBO_PUBLIC_BASE_URL || "http://localhost:3000",
    debugLogs: process.env.PHOBO_DEBUG_LOGS === "true",
    stickersEnabled: process.env.PHOBO_STICKERS_ENABLED !== "false", // Default to true
    paymentProvider: (process.env.PHOBO_PAYMENT_PROVIDER === "midtrans" || process.env.PHOBO_PAYMENT_PROVIDER === "operator" || process.env.PHOBO_PAYMENT_PROVIDER === "mock")
      ? process.env.PHOBO_PAYMENT_PROVIDER
      : (process.env.MIDTRANS_ENABLED === "true" ? "midtrans" : (process.env.NEXT_PUBLIC_PAYMENT_DEBUG === "true" ? "mock" : "operator")),
    operatorQrisImage: process.env.PHOBO_OPERATOR_QRIS_IMAGE || "/assets/payment/qris.png",
    operatorPaymentEnabled: process.env.PHOBO_OPERATOR_PAYMENT_ENABLED !== "false",
  };
}
