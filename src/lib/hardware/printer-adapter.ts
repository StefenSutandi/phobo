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

export class PrinterAdapter {
  async getStatus(): Promise<PrinterStatus> {
    const mode = getPrinterMode();

    return {
      connected: mode === "mock" || Boolean(process.env.PHOBO_PRINTER_NAME),
      model: mode === "mock" ? "Mock Canon SELPHY CP1500" : "Windows printer adapter",
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

    const commandMode = process.env.PHOBO_PRINT_COMMAND_MODE || "powershell-printto";

    if (commandMode !== "powershell-printto") {
      return {
        ok: false,
        mode,
        error: `Unsupported PHOBO_PRINT_COMMAND_MODE: ${commandMode}`,
      };
    }

    try {
      const localFilePath = await resolvePrintUrlToLocalFilePath(printUrl);
      const command = [
        "$file = $args[0]",
        "$printer = $args[1]",
        "Start-Process -FilePath $file -Verb PrintTo -ArgumentList $printer -WindowStyle Hidden",
      ].join("; ");
      const { stdout, stderr } = await execFileAsync(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command, localFilePath, printerName],
        {
          timeout: 15000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        },
      );

      return {
        ok: true,
        mode,
        message: "Windows print command sent",
        jobId: `windows-${sessionId}-${Date.now()}`,
        localFilePath,
        rawOutput: rawOutput(stdout, stderr) || undefined,
      };
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException & {
        stdout?: string | Buffer;
        stderr?: string | Buffer;
      };

      return {
        ok: false,
        mode,
        error: nodeError.message || "Windows print command failed",
        rawOutput: rawOutput(nodeError.stdout, nodeError.stderr) || undefined,
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
