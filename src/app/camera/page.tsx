"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CameraLiveView, type CameraLiveViewHandle } from "@/components/camera-live-view";
import { BackgroundPicker, KioskButton, KioskStage, SessionTimerHud } from "@/components/kiosk";
import { backgrounds } from "@/lib/phobo-data";
import { useSessionStore } from "@/lib/session/session-store";

export type CameraCaptureState =
  | "idle"
  | "countdown"
  | "capturing"
  | "recovering"
  | "recovered"
  | "recovery-warning";

type CaptureResponse = {
  ok: boolean;
  imageUrl?: string;
  capturedPhotoUrl?: string;
  displayPhotoUrl?: string;
  raw?: string;
  display?: string;
  backgroundId?: string;
  width?: number;
  height?: number;
  error?: string;
};

// Named constants for HDMI preview recovery during Canon DSLR shutter capture
const HDMI_RECOVERY_POST_DCC_WAIT_MS = 600;
const HDMI_RECOVERY_POLL_TIMEOUT_MS = 2500;
const HDMI_RECOVERY_RETRY_POLL_TIMEOUT_MS = 2000;
const HDMI_RECOVERY_SETTLE_WINDOW_MS = 900;

async function recoverDccPreview(liveRef: React.RefObject<CameraLiveViewHandle | null>): Promise<boolean> {
  if (!liveRef.current) return true;

  const activeProvider = liveRef.current.getActiveProvider ? liveRef.current.getActiveProvider() : "digicamcontrol";
  if (process.env.PHOBO_DEBUG_LOGS === "true" || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
    console.log(`[Camera Preview] ActiveProvider=${activeProvider} State=recovering`);
  }

  // 1. Initial wait for physical shutter cycle to complete
  await new Promise((r) => setTimeout(r, HDMI_RECOVERY_POST_DCC_WAIT_MS));

  // 2. First restart attempt of active preview provider while freeze overlay remains visible on top
  try {
    if (process.env.PHOBO_DEBUG_LOGS === "true" || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
      console.log(`[Camera Preview] ActiveProvider=${activeProvider} State=recovering Attempt=1`);
    }
    await liveRef.current.restartLiveView();
  } catch (err) {
    console.warn("[Camera Preview] restartLiveView error (attempt 1):", err);
  }

  // 3. Poll until active provider reports ready (requires advancing stable frames)
  const pollStart = Date.now();
  let streamActive = false;
  while (Date.now() - pollStart < HDMI_RECOVERY_POLL_TIMEOUT_MS) {
    if (liveRef.current.isReady()) {
      streamActive = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  // 4. If first attempt failed, perform one additional controlled restart attempt
  if (!streamActive) {
    if (process.env.PHOBO_DEBUG_LOGS === "true" || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
      console.log(`[Camera Preview] ActiveProvider=${activeProvider} State=recovering Attempt=2`);
    }
    try {
      await liveRef.current.restartLiveView();
    } catch (err) {
      console.warn("[Camera Preview] restartLiveView error (attempt 2):", err);
    }
    const retryStart = Date.now();
    while (Date.now() - retryStart < HDMI_RECOVERY_RETRY_POLL_TIMEOUT_MS) {
      if (liveRef.current.isReady()) {
        streamActive = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  if (streamActive) {
    // 5. Additional settle window to allow video frames to stabilize and clear any residual buffer
    if (process.env.PHOBO_DEBUG_LOGS === "true" || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
      console.log(`[Camera Preview] ActiveProvider=${activeProvider} Stream active; waiting ${HDMI_RECOVERY_SETTLE_WINDOW_MS}ms settle window before clearing freeze`);
    }
    await new Promise((r) => setTimeout(r, HDMI_RECOVERY_SETTLE_WINDOW_MS));
    return true;
  }

  return false;
}

export default function Camera() {
  const router = useRouter();
  const { session, hasHydrated, selectBackground, addCapturedPhoto, initCameraTimer } = useSessionStore();
  const live = useRef<CameraLiveViewHandle>(null);
  const captureLock = useRef(false);
  const shotCount = useRef(0);
  
  // Authoritative shutter-time background ref to prevent async race conditions
  const selectedBackgroundIdRef = useRef<string>(session?.selectedBackgroundId || backgrounds[0].id);

  const [message, setMessage] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureState, setCaptureState] = useState<CameraCaptureState>("idle");
  const [mode, setMode] = useState("mock");
  const [captureMode, setCaptureMode] = useState("fallback");
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [countdown, setCountdown] = useState<number | string | null>(null);
  const [freezeFrameUrl, setFreezeFrameUrl] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const bgRecoveryIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (bgRecoveryIntervalRef.current) {
        clearInterval(bgRecoveryIntervalRef.current);
        bgRecoveryIntervalRef.current = null;
      }
    };
  }, []);

  // Persistent Camera Session Countdown Timer metadata preservation
  useEffect(() => {
    if (!hasHydrated || !session) return;
    if (!session.cameraDeadlineAt) {
      initCameraTimer(session.durationMinutes);
    }
  }, [hasHydrated, session, initCameraTimer]);

  const startBackgroundRecovery = useCallback(() => {
    if (bgRecoveryIntervalRef.current) {
      clearInterval(bgRecoveryIntervalRef.current);
    }

    const bgStartTime = Date.now();
    const BG_TIMEOUT_MS = 20000;
    let restartTimer = 0;

    bgRecoveryIntervalRef.current = setInterval(async () => {
      if (!isMountedRef.current) {
        if (bgRecoveryIntervalRef.current) clearInterval(bgRecoveryIntervalRef.current);
        return;
      }

      const elapsed = Date.now() - bgStartTime;
      if (elapsed >= BG_TIMEOUT_MS) {
        if (bgRecoveryIntervalRef.current) clearInterval(bgRecoveryIntervalRef.current);
        bgRecoveryIntervalRef.current = null;
        if (process.env.PHOBO_DEBUG_LOGS === "true" || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
          console.log("[Camera Preview] Bounded background recovery reached 20s timeout; photo safely preserved");
        }
        return;
      }

      // Periodically attempt controlled stream restart every 5 seconds
      restartTimer += 500;
      if (restartTimer >= 5000) {
        restartTimer = 0;
        try {
          if (process.env.PHOBO_DEBUG_LOGS === "true" || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
            console.log("[Camera Preview] Background recovery: periodic restartLiveView attempt");
          }
          await live.current?.restartLiveView();
        } catch (e) {
          console.warn("[Camera Preview] Background restartLiveView error:", e);
        }
      }

      if (live.current?.isReady()) {
        if (bgRecoveryIntervalRef.current) clearInterval(bgRecoveryIntervalRef.current);
        bgRecoveryIntervalRef.current = null;

        // Settle window to prevent HDMI rainbow/color bars
        await new Promise((r) => setTimeout(r, HDMI_RECOVERY_SETTLE_WINDOW_MS));

        if (isMountedRef.current && live.current?.isReady()) {
          setFreezeFrameUrl(null);
          setCaptureState("recovered");
          setMessage(`FOTO ${shotCount.current} TERSIMPAN`);
          if (process.env.PHOBO_DEBUG_LOGS === "true" || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
            console.log("[Camera Preview] Background recovery successfully stabilized live view");
          }
        }
      }
    }, 500);
  }, []);

  useEffect(() => {
    fetch("/api/diagnostics")
      .then((response) => response.json())
      .then((data) => {
        setMode(data.env?.cameraMode || "mock");
        setCaptureMode(data.env?.cameraCaptureMode || "fallback");
        setPreviewEnabled(data.env?.cameraPreviewEnabled !== false);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!session?.selectedFrameId) {
      router.replace("/frames");
    } else if (!session.selectedBackgroundId) {
      const defaultBg = backgrounds[0].id;
      selectedBackgroundIdRef.current = defaultBg;
      selectBackground(defaultBg);
    } else {
      selectedBackgroundIdRef.current = session.selectedBackgroundId;
    }
  }, [hasHydrated, session?.selectedFrameId, session?.selectedBackgroundId, router, selectBackground]);

  const handleSelectBackground = useCallback((bgId: string) => {
    if (isCapturing || captureLock.current) return;
    selectedBackgroundIdRef.current = bgId;
    selectBackground(bgId);
  }, [isCapturing, selectBackground]);

  const count = session?.capturedPhotos.length ?? 0;
  const max = session?.requiredShotCount ?? session?.maxShots ?? 8;
  const required = max; // require full package shot count
  const maxReached = count >= max;
  shotCount.current = count;

  async function handleShoot() {
    if (!session || isCapturing || captureLock.current || maxReached) return;

    captureLock.current = true;
    setIsCapturing(true);
    setCaptureState("countdown");

    for (let i = 3; i > 0; i--) {
      setCountdown(i);
      await new Promise(res => setTimeout(res, 1000));
    }
    setCountdown("SMILE!");
    await new Promise(res => setTimeout(res, 500));
    setCountdown(null);

    // Exact shutter-time resolution: resolved immediately at shutter trigger after countdown
    const backgroundIdAtShutter = selectedBackgroundIdRef.current || session.selectedBackgroundId || backgrounds[0].id;

    // 1. Freeze last good browser-video frame if preview is active BEFORE shutter
    if (previewEnabled) {
      const snapshot = live.current?.freezeFrame() || null;
      if (snapshot) {
        if (process.env.PHOBO_DEBUG_LOGS === "true" || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
          console.log("[Camera Preview] freeze frame created");
        }
        setFreezeFrameUrl(snapshot);
      }
    }

    setCaptureState("capturing");
    setMessage("MENGAMBIL FOTO...");

    try {
      let response: Response;

      if (captureMode === "digicamcontrol") {
        if (process.env.PHOBO_DEBUG_LOGS === "true" || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
          console.log(`[Camera Preview] DSLR shutter started | backgroundAtShutter=${backgroundIdAtShutter}`);
        }

        // Real Canon DSLR capture via digiCamControl
        response = await fetch("/api/camera/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.sessionId,
            shotIndex: count + 1,
            backgroundId: backgroundIdAtShutter,
            selectedBackgroundId: backgroundIdAtShutter,
            greenScreenTuning: session.greenScreenTuning,
          }),
        });
      } else if (mode === "browser-video" && previewEnabled) {
        if (live.current?.getStatus() !== "active") throw new Error("START LIVE VIEW DULU");
        const frame = live.current.captureFrame();
        response = await fetch("/api/camera/browser-frame", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.sessionId,
            imageDataUrl: frame.rawImageDataUrl,
            displayImageDataUrl: frame.displayImageDataUrl,
          }),
        });
      } else {
        live.current?.stopLiveView();
        response = await fetch("/api/camera/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.sessionId,
            backgroundId: backgroundIdAtShutter,
          }),
        });
      }

      const data = (await response.json()) as CaptureResponse;
      const rawUrl = data.raw || data.capturedPhotoUrl || data.imageUrl;
      const displayUrl = data.display || data.displayPhotoUrl || rawUrl;

      if (!response.ok || !data.ok || !rawUrl) {
        throw new Error(data.error || "CAMERA CAPTURE GAGAL");
      }

      if (shotCount.current >= max) return;
      shotCount.current += 1;

      // 2. Save authoritative captured photo immediately (committed BEFORE recovery logic)
      addCapturedPhoto({
        raw: rawUrl,
        display: displayUrl as string,
        backgroundId: data.backgroundId || backgroundIdAtShutter,
        width: data.width,
        height: data.height,
      });

      // 3. Robust HDMI recovery if DSLR capture mode with preview is active
      if (captureMode === "digicamcontrol" && previewEnabled) {
        setCaptureState("recovering");
        setMessage("KAMERA SEDANG MEMULIHKAN PREVIEW...");
        const recovered = await recoverDccPreview(live);
        if (recovered) {
          setFreezeFrameUrl(null);
          setCaptureState("recovered");
          setMessage(`FOTO ${shotCount.current} TERSIMPAN`);
        } else {
          setCaptureState("recovery-warning");
          setMessage("PREVIEW KAMERA BELUM PULIH — FOTO TETAP TERSIMPAN");
          startBackgroundRecovery();
        }
      } else {
        setFreezeFrameUrl(null);
        setCaptureState("recovered");
        setMessage(`FOTO ${shotCount.current} TERSIMPAN`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Foto gagal diambil. Silakan coba lagi.");
      setFreezeFrameUrl(null);
      setCaptureState("idle");
    } finally {
      captureLock.current = false;
      setIsCapturing(false);
    }
  }

  const selectedBgObj = backgrounds.find(bg => bg.id === (selectedBackgroundIdRef.current || session?.selectedBackgroundId));

  const cameraCriticalOperation =
    isCapturing ||
    captureState === "countdown" ||
    captureState === "capturing" ||
    captureState === "recovering" ||
    captureState === "recovery-warning";

  return (
    <KioskStage>
      <div
        className="camera-session-hud"
        style={{
          position: "absolute",
          left: "36px",
          top: "22px",
          zIndex: 95,
          display: "flex",
          alignItems: "center",
          gap: "14px",
        }}
      >
        <SessionTimerHud isCriticalOperation={cameraCriticalOperation} />

        <div className="shot-counter" style={{ position: "static" }}>
          Shoot {maxReached ? max : count + 1} / {max}
        </div>
      </div>

      {previewEnabled ? (
        <CameraLiveView 
          ref={live} 
          compact 
          autoStart
          preferredProvider={captureMode === "digicamcontrol" ? "digicamcontrol" : "browser-video"}
          captureMode={captureMode}
          selectedBackgroundUrl={selectedBgObj?.imageUrl}
          tuning={session?.greenScreenTuning}
        />
      ) : (
        <div
          className="camera-live-placeholder"
          style={{
            position: "absolute",
            top: "7.73%",
            left: "3.47%",
            width: "72%",
            height: "70%",
            borderRadius: "16px",
            backgroundColor: "#111827",
            backgroundImage: selectedBgObj?.imageUrl ? `url('${selectedBgObj.imageUrl}')` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            border: "2px solid rgba(255,255,255,0.15)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            zIndex: 10,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              backgroundColor: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(8px)",
              padding: "28px 40px",
              borderRadius: "16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
              textAlign: "center",
              border: "1px solid rgba(255,255,255,0.2)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            }}
          >
            <span style={{ fontSize: "4.5rem", lineHeight: 1 }}>📷</span>
            <span style={{ fontSize: "1.75rem", fontWeight: "800", letterSpacing: "1.5px" }}>
              MOHON LIHAT KE LENSA KAMERA
            </span>
          </div>
        </div>
      )}

      {freezeFrameUrl && previewEnabled && (
        <div
          style={{
            position: "absolute",
            top: "7.73%",
            left: "3.47%",
            width: "72%",
            height: "70%",
            zIndex: 85,
            borderRadius: "16px",
            overflow: "hidden",
            boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
            background: "#000",
          }}
        >
          <img
            src={freezeFrameUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.35)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontSize: "2.2rem",
              fontWeight: "bold",
              textAlign: "center",
              lineHeight: 1.3,
              textShadow: "0 4px 12px rgba(0,0,0,0.8)",
            }}
          >
            {captureState === "recovery-warning" ? (
              <>
                <div>FOTO TERSIMPAN</div>
                <div style={{ fontSize: "1.5rem", marginTop: "8px", fontWeight: "normal", opacity: 0.9 }}>
                  MENUNGGU PREVIEW KAMERA...
                </div>
              </>
            ) : captureState === "recovering" ? (
              <div>MEMULIHKAN KAMERA...</div>
            ) : (
              <div>MENGAMBIL FOTO...</div>
            )}
          </div>
        </div>
      )}

      {countdown !== null && (
        <div style={{
          position: "absolute",
          top: "7.73%", left: "3.47%", width: "72%", height: "70%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: typeof countdown === "number" ? "16rem" : "10rem",
          fontWeight: "900",
          color: "#ffffff",
          textShadow: "0 8px 30px rgba(0,0,0,0.8)",
          zIndex: 100,
          pointerEvents: "none"
        }}>
          {countdown}
        </div>
      )}

      <BackgroundPicker
        backgrounds={backgrounds}
        selectedBackgroundId={session?.selectedBackgroundId || backgrounds[0].id}
        onSelectBackground={handleSelectBackground}
        disabled={isCapturing}
      />

      <footer className="camera-actions">
        <div className="camera-status" aria-live="polite">
          {maxReached ? (
            <>
              <strong>FOTO MAKSIMAL TERCAPAI</strong>
              <span>LANJUT PILIH FOTO</span>
            </>
          ) : (
            message && <span>{message}</span>
          )}
        </div>
        <div className="camera-action-buttons">
          {!maxReached && (
            <KioskButton onClick={handleShoot} disabled={isCapturing} className="camera-shoot">
              {isCapturing ? "MENGAMBIL FOTO..." : "SHOOT"}
            </KioskButton>
          )}
          {count >= 1 && (
            <KioskButton
              onClick={() => { if (count >= required) router.push("/preview"); }}
              disabled={count < required || isCapturing}
              className={`camera-next ${maxReached ? "camera-next--primary" : ""}`}
            >
              {maxReached ? "NEXT" : `NEXT (${count}/${required})`}
            </KioskButton>
          )}
        </div>
      </footer>
    </KioskStage>
  );
}
