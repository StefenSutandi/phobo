import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { getPhoboEnv } from "@/lib/config/phobo-env";
import { sanitizeSessionId } from "@/lib/results/result-storage";

// In-process mutex to prevent concurrent Canon DSLR shutter triggers
class Mutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const execute = () => {
        this.locked = true;
        resolve(() => this.release());
      };

      if (!this.locked) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }

  private release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.locked = false;
    }
  }

  isLocked(): boolean {
    return this.locked;
  }
}

const captureMutex = new Mutex();

function getBaseUrl(): string {
  const env = getPhoboEnv();
  return env.digicamBaseUrl.replace(/\/+$/, "");
}

export async function checkDccHealth(): Promise<{
  reachable: boolean;
  baseUrl: string;
  lastCaptured?: string;
  error?: string;
}> {
  const baseUrl = getBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`${baseUrl}/?slc=get&param1=lastcaptured&param2=`, {
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return { reachable: false, baseUrl, error: `DCC HTTP ${res.status}` };
    }

    const text = (await res.text()).trim();
    return { reachable: true, baseUrl, lastCaptured: text };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      reachable: false,
      baseUrl,
      error: err instanceof Error ? err.message : "Network error reaching DCC",
    };
  }
}

export async function setSessionFolder(folderPath: string): Promise<boolean> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/?slc=set&param1=session.folder&param2=${encodeURIComponent(folderPath)}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    return res.ok;
  } catch (err) {
    console.error("[DCC Adapter] setSessionFolder failed:", err);
    return false;
  }
}

export async function setFilenameTemplate(template: string): Promise<boolean> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/?slc=set&param1=session.filenametemplate&param2=${encodeURIComponent(template)}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    return res.ok;
  } catch (err) {
    console.error("[DCC Adapter] setFilenameTemplate failed:", err);
    return false;
  }
}

export async function triggerCapture(): Promise<boolean> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/?slc=capture&param1=&param2=`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    return res.ok;
  } catch (err) {
    console.error("[DCC Adapter] triggerCapture failed:", err);
    return false;
  }
}

export async function getLastCaptured(): Promise<string> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/?slc=get&param1=lastcaptured&param2=`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return "";
    const text = await res.text();
    return text.trim();
  } catch (err) {
    console.error("[DCC Adapter] getLastCaptured failed:", err);
    return "";
  }
}

export type DccCaptureOptions = {
  sessionId: string;
  shotIndex?: number;
};

export type DccCaptureResult = {
  ok: boolean;
  relativeUrl?: string;
  localFilePath?: string;
  fileName?: string;
  error?: string;
};

export async function captureDccPhoto({
  sessionId,
  shotIndex,
}: DccCaptureOptions): Promise<DccCaptureResult> {
  const safeSessionId = sanitizeSessionId(sessionId);
  if (!safeSessionId) {
    return { ok: false, error: "Invalid sessionId" };
  }

  // Prevent double tap / concurrent capture triggers
  const unlock = await captureMutex.acquire();

  try {
    // 1. Health check DCC server first
    const health = await checkDccHealth();
    if (!health.reachable) {
      console.error("[DCC Adapter] DCC server unreachable at:", health.baseUrl, health.error);
      return { ok: false, error: "Kamera belum siap. Webserver digiCamControl tidak terjangkau." };
    }

    // 2. Resolve destination directory
    const targetFolder = path.join(process.cwd(), "public", "results", safeSessionId, "captures");
    await fs.mkdir(targetFolder, { recursive: true });

    // 3. Generate filename template base
    const timestamp = Date.now();
    const filenameTemplate = typeof shotIndex === "number" ? `capture-${shotIndex}-raw` : `capture-${timestamp}-raw`;

    // 4. Configure DCC session folder and filename template via HTTP
    const folderOk = await setSessionFolder(targetFolder);
    if (!folderOk) {
      return { ok: false, error: "Gagal mengatur folder penyimpanan kamera." };
    }

    const templateOk = await setFilenameTemplate(filenameTemplate);
    if (!templateOk) {
      return { ok: false, error: "Gagal mengatur nama file kamera." };
    }

    // 5. Read initial lastcaptured value before trigger
    const initialLastCaptured = await getLastCaptured();

    // 6. Trigger DSLR capture
    const captureOk = await triggerCapture();
    if (!captureOk) {
      return { ok: false, error: "Gagal memicu rana kamera Canon EOS." };
    }

    // 7. Poll for new filename in lastcaptured (up to 15s)
    const timeoutMs = 15000;
    const pollIntervalMs = 500;
    const startTime = Date.now();
    let newFilename = "";

    while (Date.now() - startTime < timeoutMs) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      const current = await getLastCaptured();

      if (current && current.toLowerCase() !== initialLastCaptured.toLowerCase()) {
        newFilename = current;
        break;
      }
    }

    if (!newFilename) {
      console.error("[DCC Adapter] Capture polling timed out waiting for new file from DCC");
      return { ok: false, error: "Waktu tunggu pengambilan foto dari kamera habis." };
    }

    // 8. Verify actual file existence & size on disk
    const diskFilePath = path.join(targetFolder, newFilename);
    
    // Brief wait for write completion
    let attempts = 0;
    let fileValid = false;
    while (attempts < 10) {
      if (existsSync(diskFilePath)) {
        const stats = await fs.stat(diskFilePath);
        if (stats.size > 0) {
          fileValid = true;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 300));
      attempts++;
    }

    if (!fileValid) {
      console.error("[DCC Adapter] File missing or empty on disk:", diskFilePath);
      return { ok: false, error: "File foto dari kamera tidak ditemukan di disk." };
    }

    const relativeUrl = `/results/${safeSessionId}/captures/${newFilename}`;
    console.log(`[DCC Adapter] Capture success! Saved: ${diskFilePath} -> ${relativeUrl}`);

    return {
      ok: true,
      relativeUrl,
      localFilePath: diskFilePath,
      fileName: newFilename,
    };
  } catch (err) {
    console.error("[DCC Adapter] Unexpected error during capture:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Foto gagal diambil. Silakan coba lagi." };
  } finally {
    unlock();
  }
}
