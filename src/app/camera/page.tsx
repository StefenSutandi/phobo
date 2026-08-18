"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CameraLiveView, type CameraLiveViewHandle } from "@/components/camera-live-view";
import { BackgroundPicker, KioskButton, KioskStage } from "@/components/kiosk";
import { backgrounds } from "@/lib/phobo-data";
import { useSessionStore } from "@/lib/session/session-store";

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

export default function Camera() {
  const router = useRouter();
  const { session, hasHydrated, selectBackground, addCapturedPhoto } = useSessionStore();
  const live = useRef<CameraLiveViewHandle>(null);
  const captureLock = useRef(false);
  const shotCount = useRef(0);
  
  // Authoritative shutter-time background ref to prevent async race conditions
  const selectedBackgroundIdRef = useRef<string>(session?.selectedBackgroundId || backgrounds[0].id);

  const [message, setMessage] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [mode, setMode] = useState("mock");
  const [captureMode, setCaptureMode] = useState("fallback");
  const [countdown, setCountdown] = useState<number | string | null>(null);
  const [freezeFrameUrl, setFreezeFrameUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/diagnostics")
      .then((response) => response.json())
      .then((data) => {
        setMode(data.env?.cameraMode || "mock");
        setCaptureMode(data.env?.cameraCaptureMode || "fallback");
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
  const max = session?.maxShots ?? 8;
  const required = max; // require full package shot count
  const maxReached = count >= max;
  shotCount.current = count;

  async function handleShoot() {
    if (!session || isCapturing || captureLock.current || maxReached) return;

    captureLock.current = true;
    setIsCapturing(true);

    for (let i = 3; i > 0; i--) {
      setCountdown(i);
      await new Promise(res => setTimeout(res, 1000));
    }
    setCountdown("SMILE!");
    await new Promise(res => setTimeout(res, 500));
    setCountdown(null);

    // Exact shutter-time resolution: resolved immediately at shutter trigger after countdown
    const backgroundIdAtShutter = selectedBackgroundIdRef.current || session.selectedBackgroundId || backgrounds[0].id;

    // 1. Freeze last good browser-video frame to hide Canon HDMI shutter interruption
    const snapshot = live.current?.freezeFrame() || null;
    if (snapshot) {
      if (process.env.PHOBO_DEBUG_LOGS === "true" || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
        console.log("[Camera Preview] freeze frame created");
      }
      setFreezeFrameUrl(snapshot);
    }

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
      } else if (mode === "browser-video") {
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

      if (captureMode === "digicamcontrol") {
        if (process.env.PHOBO_DEBUG_LOGS === "true" || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
          console.log("[Camera Preview] DSLR capture completed | waiting for HDMI recovery");
        }

        // 2. Minimum recovery grace period (1200ms) for Canon HDMI stream after shutter release
        const recoveryStartTime = Date.now();
        await new Promise(r => setTimeout(r, 1200));

        // 3. Poll to verify video stream readiness
        let recovered = false;
        const pollStart = Date.now();

        while (Date.now() - pollStart < 2000) {
          if (live.current?.isReady()) {
            recovered = true;
            break;
          }
          await new Promise(r => setTimeout(r, 200));
        }

        if (recovered) {
          const elapsed = Date.now() - recoveryStartTime;
          if (process.env.PHOBO_DEBUG_LOGS === "true" || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
            console.log(`[Camera Preview] video recovered after ${elapsed} ms`);
          }
        } else {
          if (process.env.PHOBO_DEBUG_LOGS === "true" || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
            console.log("[Camera Preview] video did not recover; restarting browser stream");
          }
          await live.current?.restartLiveView();
          await new Promise(r => setTimeout(r, 500));
        }
      }

      if (shotCount.current >= max) return;
      shotCount.current += 1;

      // 4. Save authoritative captured photo with frozen backgroundId and dimensions
      addCapturedPhoto({
        raw: rawUrl,
        display: displayUrl as string,
        backgroundId: data.backgroundId || backgroundIdAtShutter,
        width: data.width,
        height: data.height,
      });

      setMessage(`FOTO ${shotCount.current} TERSIMPAN`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Foto gagal diambil. Silakan coba lagi.");
    } finally {
      captureLock.current = false;
      setIsCapturing(false);
      setFreezeFrameUrl(null);
    }
  }

  return (
    <KioskStage>
      <div className="shot-counter">
        Shoot {maxReached ? max : count + 1} / {max}
      </div>

      <CameraLiveView 
        ref={live} 
        compact 
        autoStart
        selectedBackgroundUrl={backgrounds.find(bg => bg.id === (selectedBackgroundIdRef.current || session?.selectedBackgroundId))?.imageUrl}
        tuning={session?.greenScreenTuning}
      />

      {freezeFrameUrl && (
        <div
          style={{
            position: "absolute",
            top: "7.73%",
            left: "3.47%",
            width: "72%",
            height: "70%",
            zIndex: 90,
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
              backgroundColor: "rgba(0,0,0,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontSize: "2.2rem",
              fontWeight: "bold",
              textShadow: "0 4px 12px rgba(0,0,0,0.8)",
            }}
          >
            MENGAMBIL FOTO...
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
