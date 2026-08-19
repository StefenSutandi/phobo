import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type PrinterMode = "mock" | "windows";

export interface PrinterStatus {
  connected: boolean;
  model: string;
  paperCount?: number;
  inkLevel?: string;
  lastError?: string;
}

export type PrintJobRequest = {
  sessionId: string;
  printUrl: string;
};

export type PrintJobResult = {
  ok: boolean;
  mode: PrinterMode;
  message?: string;
  jobId?: string;
  localFilePath?: string;
  error?: string;
  rawOutput?: string;
  command?: string;
  filePath?: string;
  printerName?: string;
  stdout?: string;
  stderr?: string;
};

function getPrinterMode(): PrinterMode {
  return process.env.PHOBO_PRINTER_MODE === "windows" ? "windows" : "mock";
}

async function fileExists(filePath: string) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function rawOutput(stdout?: string | Buffer, stderr?: string | Buffer) {
  return [stdout?.toString(), stderr?.toString()].filter(Boolean).join("\n").trim();
}

function extractFriendlyError(rawError: string): string {
  if (!rawError) return "Windows print command failed";

  // If rawError contains XML from PowerShell CLIXML stream, extract text inside <S S="Error">...</S>
  if (rawError.includes("<S S=\"Error\">") || rawError.includes("#< CLIXML")) {
    const matches = rawError.match(/<S S="Error">([^<]+)<\/S>/g);
    if (matches && matches.length > 0) {
      const extracted = matches
        .map((m) => m.replace(/<\/?S[^>]*>/g, "").replace(/_x000D__x000A_/g, "\n").trim())
        .filter(Boolean)
        .join("\n");
      if (extracted) {
        const firstLine = extracted.split("\n")[0]?.trim();
        return firstLine || extracted;
      }
    }
  }

  return rawError.replace(/^#<\s*CLIXML[\s\S]*/, "").trim() || rawError;
}

async function resolvePrintUrlToLocalFilePath(printUrl: string) {
  const pathname = printUrl.startsWith("http://") || printUrl.startsWith("https://")
    ? new URL(printUrl).pathname
    : printUrl;

  if (!pathname.startsWith("/")) {
    throw new Error("printUrl must be an app-local public URL");
  }

  const publicRoot = path.join(process.cwd(), "public");
  const resolvedPath = path.resolve(publicRoot, `.${pathname}`);
  const relativePath = path.relative(publicRoot, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("printUrl resolved outside the public directory");
  }

  if (!(await fileExists(resolvedPath))) {
    throw new Error(`Print file does not exist: ${resolvedPath}`);
  }

  return resolvedPath;
}

function buildDirectPrintScript({
  filePath,
  printerName,
  dryRun,
}: {
  filePath: string;
  printerName: string;
  dryRun: boolean;
}): string {
  const escapedFilePath = filePath.replace(/'/g, "''");
  const escapedPrinterName = printerName.replace(/'/g, "''");

  return [
    `$ErrorActionPreference = 'Stop'`,
    `Add-Type -AssemblyName System.Drawing`,
    `$filePath = '${escapedFilePath}'`,
    `$targetPrinter = '${escapedPrinterName}'`,
    `$isDryRun = $${dryRun ? "True" : "False"}`,
    ``,
    `# 1. Validate file exists on disk`,
    `if (-not (Test-Path -LiteralPath $filePath)) {`,
    `    throw "Image file not found: $filePath"`,
    `}`,
    ``,
    `# 2. Validate printer exists among installed Windows printers`,
    `$installed = [System.Drawing.Printing.PrinterSettings]::InstalledPrinters`,
    `$matchedPrinter = $null`,
    `foreach ($p in $installed) {`,
    `    if ($p -eq $targetPrinter) {`,
    `        $matchedPrinter = $p`,
    `        break`,
    `    }`,
    `}`,
    `if (-not $matchedPrinter) {`,
    `    foreach ($p in $installed) {`,
    `        if ($p.ToLower() -eq $targetPrinter.ToLower()) {`,
    `            $matchedPrinter = $p`,
    `            break`,
    `        }`,
    `    }`,
    `}`,
    `if (-not $matchedPrinter) {`,
    `    $availableList = ($installed | Out-String).Trim()`,
    `    throw "Printer '$targetPrinter' not found among installed printers. Available: $availableList"`,
    `}`,
    ``,
    `# 3. Load image directly from disk without Windows shell associations`,
    `$img = [System.Drawing.Image]::FromFile($filePath)`,
    `$doc = New-Object System.Drawing.Printing.PrintDocument`,
    ``,
    `try {`,
    `    $doc.PrinterSettings.PrinterName = $matchedPrinter`,
    `    if (-not $doc.PrinterSettings.IsValid) {`,
    `        throw "Printer '$matchedPrinter' is not valid or unavailable/offline"`,
    `    }`,
    ``,
    `    # Suppress all GUI dialogs/progress popups`,
    `    $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController`,
    ``,
    `    # Automatically set orientation based on image dimensions`,
    `    $isLandscape = $img.Width -gt $img.Height`,
    `    $doc.DefaultPageSettings.Landscape = $isLandscape`,
    ``,
    `    $doc.add_PrintPage({`,
    `        param($sender, $e)`,
    `        $bounds = $e.MarginBounds`,
    `        if ($bounds.Width -le 0 -or $bounds.Height -le 0) {`,
    `            $bounds = $e.PageBounds`,
    `        }`,
    ``,
    `        $imgW = $img.Width`,
    `        $imgH = $img.Height`,
    `        $scale = [Math]::Min($bounds.Width / $imgW, $bounds.Height / $imgH)`,
    ``,
    `        $destW = [int]($imgW * $scale)`,
    `        $destH = [int]($imgH * $scale)`,
    `        $destX = $bounds.X + [int](($bounds.Width - $destW) / 2)`,
    `        $destY = $bounds.Y + [int](($bounds.Height - $destH) / 2)`,
    ``,
    `        # Render image with high-quality bicubic interpolation`,
    `        $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic`,
    `        $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality`,
    `        $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality`,
    ``,
    `        $destRect = New-Object System.Drawing.Rectangle($destX, $destY, $destW, $destH)`,
    `        $e.Graphics.DrawImage($img, $destRect)`,
    `        $e.HasMorePages = $false`,
    `    })`,
    ``,
    `    $w = $img.Width`,
    `    $h = $img.Height`,
    `    if ($isDryRun) {`,
    `        Write-Output "DRY_RUN_OK: Image=$($w)x$($h), Landscape=$isLandscape, Printer=$matchedPrinter"`,
    `    } else {`,
    `        $doc.Print()`,
    `        Write-Output "PRINT_OK: Image=$($w)x$($h), Landscape=$isLandscape, Printer=$matchedPrinter"`,
    `    }`,
    `} finally {`,
    `    if ($doc) { $doc.Dispose() }`,
    `    if ($img) { $img.Dispose() }`,
    `}`,
  ].join("\r\n");
}

export class PrinterAdapter {
  async getStatus(): Promise<PrinterStatus> {
    const mode = getPrinterMode();

    return {
      connected: mode === "mock" || Boolean(process.env.PHOBO_PRINTER_NAME),
      model: mode === "mock" ? "Mock Canon SELPHY CP1500" : (process.env.PHOBO_PRINTER_NAME || "Windows direct printer"),
      paperCount: mode === "mock" ? 18 : undefined,
      inkLevel: mode === "mock" ? "OK" : undefined,
      lastError:
        mode === "windows" && !process.env.PHOBO_PRINTER_NAME
          ? "PHOBO_PRINTER_NAME is not configured"
          : undefined,
    };
  }

  async printImage({ sessionId, printUrl }: PrintJobRequest): Promise<PrintJobResult> {
    const mode = getPrinterMode();

    if (mode === "mock") {
      return {
        ok: true,
        mode,
        message: "Mock print queued",
        jobId: `mock-${Date.now()}`,
      };
    }

    if (process.platform !== "win32") {
      return {
        ok: false,
        mode,
        error: "PHOBO_PRINTER_MODE=windows requires Windows",
      };
    }

    const printerName = process.env.PHOBO_PRINTER_NAME;

    if (!printerName) {
      return {
        ok: false,
        mode,
        error: "PHOBO_PRINTER_NAME is required when PHOBO_PRINTER_MODE=windows",
      };
    }

    const dryRun = process.env.PHOBO_PRINT_DRY_RUN === "true";

    let localFilePath = "";
    let script = "";

    try {
      localFilePath = await resolvePrintUrlToLocalFilePath(printUrl);
      script = buildDirectPrintScript({
        filePath: localFilePath,
        printerName,
        dryRun,
      });

      console.log(`[Printer] Mode: ${mode} | Printer: ${printerName} | DryRun: ${dryRun}`);
      console.log(`[Printer] File: ${localFilePath}`);

      const base64Script = Buffer.from(script, "utf16le").toString("base64");

      const { stdout, stderr } = await execFileAsync(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", base64Script],
        {
          timeout: 30000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        },
      );

      const outStr = stdout.toString().trim();
      const errStr = stderr.toString().trim();

      console.log(`[Printer] Success. Stdout: ${outStr || "none"}, Stderr: ${errStr || "none"}`);

      return {
        ok: true,
        mode,
        message: dryRun ? "Windows print dry-run verified" : "Windows print document sent directly",
        jobId: `windows-${sessionId}-${Date.now()}`,
        localFilePath,
        rawOutput: rawOutput(stdout, stderr) || undefined,
        command: "System.Drawing.Printing.PrintDocument",
        filePath: localFilePath,
        printerName,
        stdout: outStr,
        stderr: errStr,
      };
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException & {
        stdout?: string | Buffer;
        stderr?: string | Buffer;
        code?: number;
      };

      const outStr = nodeError.stdout?.toString().trim() || "";
      const errStr = nodeError.stderr?.toString().trim() || "";

      // Extract user-friendly error from PowerShell stderr/message
      const friendlyError = extractFriendlyError(errStr || nodeError.message || "Windows print command failed");

      console.error(`[Printer] Error: ${friendlyError}`);
      console.error(`[Printer] Exit code: ${nodeError.code}`);
      if (outStr) console.error(`[Printer] Stdout: ${outStr}`);
      if (errStr) console.error(`[Printer] Stderr: ${errStr}`);

      return {
        ok: false,
        mode,
        error: friendlyError,
        rawOutput: rawOutput(nodeError.stdout, nodeError.stderr) || undefined,
        command: "System.Drawing.Printing.PrintDocument",
        filePath: localFilePath || undefined,
        printerName,
        stdout: outStr,
        stderr: errStr,
      };
    }
  }

  async print(imageUrl: string): Promise<boolean> {
    const result = await this.printImage({
      sessionId: `legacy-${Date.now()}`,
      printUrl: imageUrl,
    });

    return result.ok;
  }
}

export const printer = new PrinterAdapter();
