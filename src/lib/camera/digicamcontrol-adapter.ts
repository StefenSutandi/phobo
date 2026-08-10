import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
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

const ALLOWED_LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function parseLoopbackEndpoint(): { host: string; port: number } {
  const env = getPhoboEnv();
  const rawUrl = env.digicamBaseUrl || "http://127.0.0.1:5513";

  try {
    const url = new URL(rawUrl.startsWith("http") ? rawUrl : `http://${rawUrl}`);
    const host = url.hostname.toLowerCase();
    const port = Number.parseInt(url.port || "5513", 10);

    if (!ALLOWED_LOOPBACK_HOSTS.has(host)) {
      throw new Error(`Security restriction: digiCamControl host '${host}' is not a permitted loopback address.`);
    }

    return { host, port: Number.isFinite(port) ? port : 5513 };
  } catch (err) {
    if (err instanceof Error && err.message.includes("Security restriction")) {
      throw err;
    }
    return { host: "127.0.0.1", port: 5513 };
  }
}

/**
 * Raw TCP HTTP client tailored specifically for digiCamControl's webserver.
 * 
 * WHY RAW TCP IS REQUIRED:
 * digiCamControl v2.1.7's HTTP server sends malformed HTTP responses:
 * - Duplicate 'Content-Length' headers (causes Node http parser HPE_UNEXPECTED_CONTENT_LENGTH error)
 * - Response content length mismatch (causes Node fetch UND_ERR_RES_CONTENT_LENGTH_MISMATCH error)
 * 
 * This raw TCP client reads socket bytes directly, ignores duplicate Content-Length headers completely,
 * splits headers from body at \r\n\r\n, and returns the received body.
 */
export async function dccRawRequest(pathAndQuery: string, timeoutMs = 5000): Promise<string> {
  const { host, port } = parseLoopbackEndpoint();
  const env = getPhoboEnv();
  const startTime = Date.now();

  if (env.debugLogs) {
    console.log(`[DCC RAW] connecting ${host}:${port} | command=${pathAndQuery}`);
  }

  return new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const chunks: Buffer[] = [];
    let isSettled = false;

    const cleanup = () => {
      if (!socket.destroyed) {
        socket.destroy();
      }
    };

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      const httpRequest =
        `GET ${pathAndQuery} HTTP/1.1\r\n` +
        `Host: ${host}:${port}\r\n` +
        `Connection: close\r\n` +
        `Accept: */*\r\n` +
        `User-Agent: Phobo-DccRawClient/1.0\r\n\r\n`;

      socket.write(httpRequest);
    });

    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    socket.on("timeout", () => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      const elapsed = Date.now() - startTime;
      if (env.debugLogs) {
        console.error(`[DCC RAW] timeout after ${elapsed}ms | command=${pathAndQuery}`);
      }
      reject(new Error(`DCC socket timeout after ${timeoutMs}ms`));
    });

    socket.on("error", (err: Error) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      const elapsed = Date.now() - startTime;
      if (env.debugLogs) {
        console.error(`[DCC RAW] socket error after ${elapsed}ms:`, err.message);
      }
      reject(err);
    });

    const processResponse = () => {
      if (isSettled) return;
      isSettled = true;
      cleanup();

      const elapsed = Date.now() - startTime;
      const rawBuffer = Buffer.concat(chunks);

      if (rawBuffer.length === 0) {
        reject(new Error("DCC returned empty socket response"));
        return;
      }

      // Find header separator \r\n\r\n or \n\n
      let sepIndex = rawBuffer.indexOf("\r\n\r\n");
      let headerSepLen = 4;

      if (sepIndex === -1) {
        sepIndex = rawBuffer.indexOf("\n\n");
        headerSepLen = 2;
      }

      if (sepIndex === -1) {
        // Body without clear headers, fallback to full buffer string
        const fallbackBody = rawBuffer.toString("utf8").trim();
        if (env.debugLogs) {
          console.log(`[DCC RAW] no header sep | bytes=${rawBuffer.length} | elapsed=${elapsed}ms | body=${fallbackBody.slice(0, 100)}`);
        }
        resolve(fallbackBody);
        return;
      }

      const headersStr = rawBuffer.subarray(0, sepIndex).toString("utf8");
      const bodyBuffer = rawBuffer.subarray(sepIndex + headerSepLen);
      const bodyStr = bodyBuffer.toString("utf8").trim();

      // Check HTTP status line (e.g. HTTP/1.1 200 OK)
      const firstLine = headersStr.split(/\r?\n/)[0] || "";
      const statusMatch = firstLine.match(/HTTP\/\d\.\d\s+(\d{3})/i);
      const statusCode = statusMatch ? Number.parseInt(statusMatch[1], 10) : 200;

      if (statusCode < 200 || statusCode >= 300) {
        if (env.debugLogs) {
          console.error(`[DCC RAW] HTTP status ${statusCode} | headers=${firstLine} | elapsed=${elapsed}ms`);
        }
        reject(new Error(`DCC HTTP ${statusCode} response: ${firstLine}`));
        return;
      }

      if (env.debugLogs) {
        console.log(`[DCC RAW] bytes=${rawBuffer.length} | status=${statusCode} | elapsed=${elapsed}ms | body=${bodyStr.slice(0, 100)}`);
      }

      resolve(bodyStr);
    };

    socket.on("end", processResponse);
    socket.on("close", () => {
      if (!isSettled) {
        processResponse();
      }
    });
  });
}

export async function checkDccHealth(): Promise<{
  reachable: boolean;
  baseUrl: string;
  lastCaptured?: string;
  error?: string;
}> {
  const env = getPhoboEnv();
  const baseUrl = env.digicamBaseUrl.replace(/\/+$/, "");

  try {
    // Check session.folder via raw TCP transport (2000ms timeout)
    const result = await dccRawRequest("/?slc=get&param1=session.folder&param2=", 2000);
    return { reachable: true, baseUrl, lastCaptured: result };
  } catch (err) {
    return {
      reachable: false,
      baseUrl,
      error: err instanceof Error ? err.message : "Network error reaching DCC via raw TCP",
    };
  }
}

export async function setSessionFolder(folderPath: string): Promise<boolean> {
  try {
    const url = `/?slc=set&param1=session.folder&param2=${encodeURIComponent(folderPath)}`;
    await dccRawRequest(url, 5000);
    return true;
  } catch (err) {
    console.error("[DCC Adapter] setSessionFolder failed:", err);
    return false;
  }
}

export async function setFilenameTemplate(template: string): Promise<boolean> {
  try {
    const url = `/?slc=set&param1=session.filenametemplate&param2=${encodeURIComponent(template)}`;
    await dccRawRequest(url, 5000);
    return true;
  } catch (err) {
    console.error("[DCC Adapter] setFilenameTemplate failed:", err);
    return false;
  }
}

export async function triggerCapture(): Promise<boolean> {
  try {
    const url = "/?slc=capture&param1=&param2=";
    await dccRawRequest(url, 5000);
    return true;
  } catch (err) {
    console.error("[DCC Adapter] triggerCapture failed:", err);
    return false;
  }
}

export async function getLastCaptured(): Promise<string> {
  try {
    const url = "/?slc=get&param1=lastcaptured&param2=";
    const body = await dccRawRequest(url, 3000);
    return body;
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
    // 1. Health check DCC server first via raw TCP transport
    const health = await checkDccHealth();
    if (!health.reachable) {
      console.error("[DCC Adapter] DCC server unreachable via raw TCP at:", health.baseUrl, health.error);
      return { ok: false, error: "Kamera belum siap. Webserver digiCamControl tidak terjangkau." };
    }

    // 2. Resolve destination directory
    const targetFolder = path.join(process.cwd(), "public", "results", safeSessionId, "captures");
    await fs.mkdir(targetFolder, { recursive: true });

    // 3. Generate filename template base
    const timestamp = Date.now();
    const filenameTemplate = typeof shotIndex === "number" ? `capture-${shotIndex}-raw` : `capture-${timestamp}-raw`;

    // 4. Configure DCC session folder and filename template via raw TCP
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

    // 6. Trigger DSLR capture via raw TCP
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
    console.log(`[DCC Adapter] Raw TCP capture success! Saved: ${diskFilePath} -> ${relativeUrl}`);

    return {
      ok: true,
      relativeUrl,
      localFilePath: diskFilePath,
      fileName: newFilename,
    };
  } catch (err) {
    console.error("[DCC Adapter] Unexpected error during raw TCP capture:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Foto gagal diambil. Silakan coba lagi." };
  } finally {
    unlock();
  }
}
