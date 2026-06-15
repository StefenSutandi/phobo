import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sanitizeSessionId } from "@/lib/results/result-storage";

const execFileAsync = promisify(execFile);

export type CameraMode = "mock" | "command";

export interface CameraStatus {
  connected: boolean;
  model: string;
  batteryLevel?: number;
  lastError?: string;
}

export type CapturePhotoRequest = {
  sessionId: string;
  fileName?: string;
};

export type CapturePhotoResult = {
  ok: boolean;
  mode: CameraMode;
  imageUrl?: string;
  localFilePath?: string;
  error?: string;
  rawOutput?: string;
};

function getCameraMode(): CameraMode {
  return process.env.PHOBO_CAMERA_MODE === "command" ? "command" : "mock";
}

function createMockPhotoUrl(photoNumber: number) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="420" viewBox="0 0 320 420">
      <rect width="320" height="420" fill="#d9d9d9"/>
      <rect x="28" y="28" width="264" height="264" rx="18" fill="#535a64"/>
      <circle cx="160" cy="138" r="54" fill="#ffffff"/>
      <rect x="86" y="214" width="148" height="50" rx="25" fill="#ffffff"/>
      <text x="160" y="350" fill="#404a4b" font-family="Arial" font-size="28" text-anchor="middle">MOCK ${photoNumber}</text>
    </svg>
  `;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function sanitizeFileName(fileName?: string) {
  const baseName = fileName?.replace(/\.[^.]+$/, "") || `capture-${Date.now()}`;
  const safeName = baseName.replace(/[^a-zA-Z0-9_-]/g, "");

  return safeName || `capture-${Date.now()}`;
}

function splitArgsTemplate(template: string, outputPath: string) {
  const replaced = template.replaceAll("{output}", outputPath);
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < replaced.length; index += 1) {
    const character = replaced[index];

    if ((character === '"' || character === "'") && !quote) {
      quote = character;
      continue;
    }

    if (character === quote) {
      quote = null;
      continue;
    }

    if (/\s/.test(character) && !quote) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += character;
  }

  if (current) {
    args.push(current);
  }

  return args;
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

export async function capturePhoto({
  sessionId,
  fileName,
}: CapturePhotoRequest): Promise<CapturePhotoResult> {
  const mode = getCameraMode();
  const safeSessionId = sanitizeSessionId(sessionId);

  if (!safeSessionId) {
    return {
      ok: false,
      mode,
      error: "sessionId must contain at least one safe character",
    };
  }

  if (mode === "mock") {
    return {
      ok: true,
      mode,
      imageUrl: createMockPhotoUrl(Date.now()),
    };
  }

  const captureDir = process.env.PHOBO_CAMERA_CAPTURE_DIR;
  const commandPath = process.env.PHOBO_CAMERA_COMMAND_PATH;
  const argsTemplate =
    process.env.PHOBO_CAMERA_COMMAND_ARGS_TEMPLATE || '/filename "{output}" /capture';
  const timeoutMs = Number.parseInt(
    process.env.PHOBO_CAMERA_CAPTURE_TIMEOUT_MS || "15000",
    10,
  );

  if (!captureDir) {
    return {
      ok: false,
      mode,
      error: "PHOBO_CAMERA_CAPTURE_DIR is required when PHOBO_CAMERA_MODE=command",
    };
  }

  if (!commandPath) {
    return {
      ok: false,
      mode,
      error: "PHOBO_CAMERA_COMMAND_PATH is required when PHOBO_CAMERA_MODE=command",
    };
  }

  const safeFileName = sanitizeFileName(fileName);
  const commandOutputDir = path.join(captureDir, safeSessionId);
  const commandOutputPath = path.join(commandOutputDir, `${safeFileName}.jpg`);
  const publicOutputDir = path.join(
    process.cwd(),
    "public",
    "results",
    safeSessionId,
    "captures",
  );
  const publicOutputPath = path.join(publicOutputDir, `${safeFileName}.jpg`);

  try {
    await mkdir(commandOutputDir, { recursive: true });
    await mkdir(publicOutputDir, { recursive: true });

    const args = splitArgsTemplate(argsTemplate, commandOutputPath);
    const { stdout, stderr } = await execFileAsync(commandPath, args, {
      timeout: Number.isFinite(timeoutMs) ? timeoutMs : 15000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    const output = rawOutput(stdout, stderr);

    if (!(await fileExists(commandOutputPath))) {
      return {
        ok: false,
        mode,
        error: `Camera command completed but output file was not created: ${commandOutputPath}`,
        rawOutput: output,
      };
    }

    await copyFile(commandOutputPath, publicOutputPath);

    return {
      ok: true,
      mode,
      imageUrl: `/results/${safeSessionId}/captures/${safeFileName}.jpg`,
      localFilePath: publicOutputPath,
      rawOutput: output || undefined,
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException & {
      killed?: boolean;
      signal?: NodeJS.Signals;
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };
    const output = rawOutput(nodeError.stdout, nodeError.stderr);
    const timedOut = nodeError.killed || nodeError.signal === "SIGTERM";
    const errorMessage = timedOut
      ? `Camera command timed out after ${Number.isFinite(timeoutMs) ? timeoutMs : 15000}ms`
      : nodeError.message || "Camera command failed";

    return {
      ok: false,
      mode,
      error: errorMessage,
      rawOutput: output || undefined,
    };
  }
}

export class CameraAdapter {
  async getStatus(): Promise<CameraStatus> {
    const mode = getCameraMode();

    return {
      connected: mode === "mock" || Boolean(process.env.PHOBO_CAMERA_COMMAND_PATH),
      model: mode === "mock" ? "Mock Canon 700D" : "Canon command adapter",
      batteryLevel: mode === "mock" ? 100 : undefined,
      lastError:
        mode === "command" && !process.env.PHOBO_CAMERA_COMMAND_PATH
          ? "PHOBO_CAMERA_COMMAND_PATH is not configured"
          : undefined,
    };
  }

  async captureImage(): Promise<string> {
    const result = await capturePhoto({ sessionId: `legacy-${Date.now()}` });

    if (!result.ok || !result.imageUrl) {
      throw new Error(result.error || "Camera capture failed");
    }

    return result.imageUrl;
  }
}

export const camera = new CameraAdapter();
