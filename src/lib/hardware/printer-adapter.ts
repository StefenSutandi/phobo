import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { computePrintDestination, type PrintFitMode } from "./print-layout";

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

function getPrintFitMode(): PrintFitMode {
  return process.env.PHOBO_PRINT_FIT === "contain" ? "contain" : "fill";
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

export function buildDirectPrintScript({
  filePath,
  printerName,
  dryRun,
  fitMode = "fill",
}: {
  filePath: string;
  printerName: string;
  dryRun: boolean;
  fitMode?: PrintFitMode;
}): string {
  const escapedFilePath = filePath.replace(/'/g, "''");
  const escapedPrinterName = printerName.replace(/'/g, "''");

  return [
    `$ErrorActionPreference = 'Stop'`,
    `Add-Type -AssemblyName System.Drawing`,
    `$filePath = '${escapedFilePath}'`,
    `$targetPrinter = '${escapedPrinterName}'`,
    `$isDryRun = $${dryRun ? "True" : "False"}`,
    `$fitMode = '${fitMode}'`,
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
    `    # 4. Zero software margins & disable origin offset at margins (print full-bleed/physical page)`,
    `    $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)`,
    `    $doc.OriginAtMargins = $false`,
    ``,
    `    # 5. Search driver paper sizes preferring exact Canon SELPHY "Japanese Postcard" (100x148mm)`,
    `    $paperNamesList = @()`,
    `    try {`,
    `        $paperSizes = $doc.PrinterSettings.PaperSizes`,
    `        foreach ($ps in $paperSizes) {`,
    `            $paperNamesList += $ps.PaperName`,
    `        }`,
    `        $selectedPaper = $null`,
    ``,
    `        # Priority 1: Exact case-sensitive "Japanese Postcard"`,
    `        foreach ($ps in $paperSizes) {`,
    `            if ($ps.PaperName -ceq "Japanese Postcard") {`,
    `                $selectedPaper = $ps`,
    `                break`,
    `            }`,
    `        }`,
    ``,
    `        # Priority 2: Exact case-insensitive "Japanese Postcard"`,
    `        if (-not $selectedPaper) {`,
    `            foreach ($ps in $paperSizes) {`,
    `                if ($ps.PaperName.Trim().ToLower() -eq "japanese postcard") {`,
    `                    $selectedPaper = $ps`,
    `                    break`,
    `                }`,
    `            }`,
    `        }`,
    ``,
    `        # Priority 3: Keyword Postcard / Hagaki / KP / 4R / 100x148 / 4x6`,
    `        if (-not $selectedPaper) {`,
    `            foreach ($ps in $paperSizes) {`,
    `                $name = $ps.PaperName.ToLower()`,
    `                if ($name -like "*postcard*" -or $name -like "*hagaki*" -or $name -like "*4x6*" -or $name -like "*4 x 6*" -or $name -like "*4r*" -or $name -like "*kp*" -or $name -like "*100x148*" -or $name -like "*100 x 148*" -or $name -like "*148x100*" -or $name -like "*148 x 100*") {`,
    `                    $selectedPaper = $ps`,
    `                    break`,
    `                }`,
    `            }`,
    `        }`,
    ``,
    `        # Priority 4: Dimensional fallback approximately 394 x 583 hundredths inch (100x148mm)`,
    `        if (-not $selectedPaper) {`,
    `            foreach ($ps in $paperSizes) {`,
    `                $w = $ps.Width`,
    `                $h = $ps.Height`,
    `                if (($w -ge 370 -and $w -le 430 -and $h -ge 560 -and $h -le 630) -or ($w -ge 560 -and $w -le 630 -and $h -ge 370 -and $h -le 430)) {`,
    `                    $selectedPaper = $ps`,
    `                    break`,
    `                }`,
    `            }`,
    `        }`,
    ``,
    `        if ($selectedPaper) {`,
    `            $doc.DefaultPageSettings.PaperSize = $selectedPaper`,
    `        }`,
    `    } catch {`,
    `        # Keep driver default paper size if paper search fails`,
    `    }`,
    ``,
    `    # 6. Automatically set orientation based on image dimensions (Landscape=False for 1181x1748 portrait)`,
    `    $isLandscape = $img.Width -gt $img.Height`,
    `    $doc.DefaultPageSettings.Landscape = $isLandscape`,
    ``,
    `    # 7. Single physical copy per print invocation (One image = One physical postcard)`,
    `    $doc.PrinterSettings.Copies = 1`,
    ``,
    `    $doc.add_PrintPage({`,
    `        param($sender, $e)`,
    `        # Use physical PageBounds (0 software margins)`,
    `        $bounds = $e.PageBounds`,
    ``,
    `        $imgW = $img.Width`,
    `        $imgH = $img.Height`,
    ``,
    `        $scaleX = [double]$bounds.Width / [double]$imgW`,
    `        $scaleY = [double]$bounds.Height / [double]$imgH`,
    ``,
    `        if ($fitMode -eq 'contain') {`,
    `            $scale = [Math]::Min($scaleX, $scaleY)`,
    `        } else {`,
    `            # Default: fill / cover`,
    `            $scale = [Math]::Max($scaleX, $scaleY)`,
    `        }`,
    ``,
    `        $destW = [int][Math]::Round($imgW * $scale)`,
    `        $destH = [int][Math]::Round($imgH * $scale)`,
    `        $destX = [int][Math]::Round($bounds.X + ($bounds.Width - $destW) / 2.0)`,
    `        $destY = [int][Math]::Round($bounds.Y + ($bounds.Height - $destH) / 2.0)`,
    ``,
    `        # Real driver event diagnostics`,
    `        $ePageBounds = "X=$($e.PageBounds.X),Y=$($e.PageBounds.Y),W=$($e.PageBounds.Width),H=$($e.PageBounds.Height)"`,
    `        $eMarginBounds = "X=$($e.MarginBounds.X),Y=$($e.MarginBounds.Y),W=$($e.MarginBounds.Width),H=$($e.MarginBounds.Height)"`,
    `        $ePrintArea = "X=$($e.PageSettings.PrintableArea.X),Y=$($e.PageSettings.PrintableArea.Y),W=$($e.PageSettings.PrintableArea.Width),H=$($e.PageSettings.PrintableArea.Height)"`,
    `        $eHardMargin = "X=$($e.PageSettings.HardMarginX),Y=$($e.PageSettings.HardMarginY)"`,
    `        $eDestRect = "X=$destX,Y=$destY,W=$destW,H=$destH"`,
    ``,
    `        Write-Output "[Printer Physical Layout]"`,
    `        Write-Output "e.PageBounds=$ePageBounds"`,
    `        Write-Output "e.MarginBounds=$eMarginBounds"`,
    `        Write-Output "e.PrintableArea=$ePrintArea"`,
    `        Write-Output "e.HardMargin=$eHardMargin"`,
    `        Write-Output "DestinationRect=$eDestRect"`,
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
    `    # Calculate layout diagnostics from in-memory DefaultPageSettings`,
    `    $paperSize = $doc.DefaultPageSettings.PaperSize`,
    `    $paperName = if ($paperSize) { $paperSize.PaperName } else { "Default" }`,
    `    $paperW = if ($paperSize) { $paperSize.Width } else { 394 }`,
    `    $paperH = if ($paperSize) { $paperSize.Height } else { 583 }`,
    `    $isColor = $doc.DefaultPageSettings.Color`,
    `    $availStr = if ($paperNamesList.Count -gt 0) { $paperNamesList -join ", " } else { "None" }`,
    ``,
    `    $calcPageW = if ($isLandscape) { [Math]::Max($paperW, $paperH) } else { [Math]::Min($paperW, $paperH) }`,
    `    $calcPageH = if ($isLandscape) { [Math]::Min($paperW, $paperH) } else { [Math]::Max($paperW, $paperH) }`,
    `    $calcScaleX = [double]$calcPageW / [double]$img.Width`,
    `    $calcScaleY = [double]$calcPageH / [double]$img.Height`,
    `    $calcScale = if ($fitMode -eq 'contain') { [Math]::Min($calcScaleX, $calcScaleY) } else { [Math]::Max($calcScaleX, $calcScaleY) }`,
    `    $calcDestW = [int][Math]::Round($img.Width * $calcScale)`,
    `    $calcDestH = [int][Math]::Round($img.Height * $calcScale)`,
    `    $calcDestX = [int][Math]::Round(($calcPageW - $calcDestW) / 2.0)`,
    `    $calcDestY = [int][Math]::Round(($calcPageH - $calcDestH) / 2.0)`,
    ``,
    `    Write-Output "[Printer Driver Selection]"`,
    `    Write-Output "Printer=$matchedPrinter"`,
    `    Write-Output "AvailablePaperSizes=$availStr"`,
    `    Write-Output "SelectedPaperName=$paperName"`,
    `    Write-Output "SelectedPaperSize=$($paperW)x$($paperH)"`,
    `    Write-Output "ImagePx=$($img.Width)x$($img.Height)"`,
    `    Write-Output "Landscape=$isLandscape"`,
    `    Write-Output "Copies=$($doc.PrinterSettings.Copies)"`,
    `    Write-Output "Fit=$fitMode"`,
    ``,
    `    Write-Output "[Printer Layout]"`,
    `    Write-Output "Printer=$matchedPrinter"`,
    `    Write-Output "ImagePx=$($img.Width)x$($img.Height)"`,
    `    Write-Output "PaperName=$paperName"`,
    `    Write-Output "PaperSize=$($paperW)x$($paperH)"`,
    `    Write-Output "Landscape=$isLandscape"`,
    `    Write-Output "Margins=0,0,0,0"`,
    `    Write-Output "Color=$isColor"`,
    `    Write-Output "Copies=$($doc.PrinterSettings.Copies)"`,
    `    Write-Output "EffectivePageBounds=$calcPageW x $calcPageH"`,
    `    Write-Output "DestinationRect=X=$calcDestX,Y=$calcDestY,W=$calcDestW,H=$calcDestH"`,
    ``,
    `    if ($isDryRun) {`,
    `        Write-Output "DRY_RUN_OK: ImagePx=$($img.Width)x$($img.Height), Landscape=$isLandscape, Printer=$matchedPrinter, Paper=$paperName ($($paperW)x$($paperH)), Copies=1, Dest=[$calcDestX,$calcDestY,$calcDestW,$calcDestH]"`,
    `    } else {`,
    `        $doc.Print()`,
    `        Write-Output "PRINT_OK: ImagePx=$($img.Width)x$($img.Height), Landscape=$isLandscape, Printer=$matchedPrinter, Paper=$paperName ($($paperW)x$($paperH)), Copies=1, Dest=[$calcDestX,$calcDestY,$calcDestW,$calcDestH]"`,
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
    const fitMode = getPrintFitMode();

    let localFilePath = "";
    let script = "";

    try {
      localFilePath = await resolvePrintUrlToLocalFilePath(printUrl);

      // Server-side validation: inspect print asset with Sharp
      const metadata = await sharp(localFilePath).metadata();
      const assetWidth = metadata.width || 0;
      const assetHeight = metadata.height || 0;
      const isPortrait = assetHeight > assetWidth;

      console.log(`[Printer Asset] Path=${localFilePath} | Width=${assetWidth} | Height=${assetHeight} | Orientation=${isPortrait ? "Portrait" : "Landscape"}`);

      if (assetWidth !== 1181 || assetHeight !== 1748 || !isPortrait) {
        throw new Error(
          `Legacy or invalid print asset: expected 1181x1748 portrait postcard (got ${assetWidth}x${assetHeight} ${isPortrait ? "portrait" : "landscape"})`
        );
      }

      script = buildDirectPrintScript({
        filePath: localFilePath,
        printerName,
        dryRun,
        fitMode,
      });

      console.log(`[Printer] Mode: ${mode} | Printer: ${printerName} | DryRun: ${dryRun} | FitMode: ${fitMode}`);
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

      console.log(`[Printer] Success. Stdout:\n${outStr || "none"}\nStderr: ${errStr || "none"}`);

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

export type SequentialPrintJobResult = {
  ok: boolean;
  totalJobs: number;
  completedJobs: number;
  results: PrintJobResult[];
  error?: string;
  message?: string;
};

export async function executeSequentialPrintJobs({
  sessionId,
  printUrl,
  count = 1,
  printerAdapter = printer,
}: {
  sessionId: string;
  printUrl: string;
  count?: number;
  printerAdapter?: { printImage: (req: PrintJobRequest) => Promise<PrintJobResult> };
}): Promise<SequentialPrintJobResult> {
  const totalJobs = Math.max(1, count);
  const results: PrintJobResult[] = [];

  for (let i = 1; i <= totalJobs; i++) {
    const jobRes = await printerAdapter.printImage({
      sessionId,
      printUrl,
    });
    results.push(jobRes);

    if (!jobRes.ok) {
      const errorMsg = totalJobs > 1
        ? `Print ${i - 1}/${totalJobs} succeeded, print ${i}/${totalJobs} failed: ${jobRes.error || "Unknown printer error"}`
        : (jobRes.error || "Print job failed");
      return {
        ok: false,
        totalJobs,
        completedJobs: i - 1,
        results,
        error: errorMsg,
      };
    }
  }

  return {
    ok: true,
    totalJobs,
    completedJobs: totalJobs,
    results,
    message: totalJobs > 1 ? `Print ${totalJobs}/${totalJobs} completed successfully` : "Print completed successfully",
  };
}

