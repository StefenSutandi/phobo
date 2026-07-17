"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CameraLiveView, type CameraLiveViewHandle } from "@/components/camera-live-view";
import { BackgroundPicker, KioskButton, KioskStage } from "@/components/kiosk";
import { backgrounds, getFrameById } from "@/lib/phobo-data";
import { useSessionStore } from "@/lib/session/session-store";

type CaptureResponse = {
  ok: boolean;
  imageUrl?: string;
  capturedPhotoUrl?: string;
  displayPhotoUrl?: string;
  error?: string;
};

export default function Camera() {
  const router = useRouter();
  const { session, hasHydrated, selectBackground, addCapturedPhoto } = useSessionStore();
  const live = useRef<CameraLiveViewHandle>(null);
  const captureLock = useRef(false);
  const shotCount = useRef(0);
  const [message, setMessage] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [mode, setMode] = useState("mock");
  const [countdown, setCountdown] = useState<number | string | null>(null);

  useEffect(() => {
    fetch("/api/diagnostics")
      .then((response) => response.json())
      .then((data) => setMode(data.env?.cameraMode || "mock"))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!session?.selectedFrameId) router.replace("/frames");
    else if (!session.selectedBackgroundId) selectBackground(backgrounds[0].id);
  }, [hasHydrated, session?.selectedFrameId, session?.selectedBackgroundId, router, selectBackground]);

  const count = session?.capturedPhotos.length ?? 0;
  const max = session?.maxShots ?? 8;
  const required = Math.min(getFrameById(session?.selectedFrameId).requiredPhotos, max);
  const maxReached = count >= max;
  shotCount.current = count;

  async function shoot() {
    if (!session || captureLock.current || shotCount.current >= max) return;

    captureLock.current = true;
    setIsCapturing(true);

    for (let i = 3; i > 0; i--) {
      setCountdown(i);
      await new Promise(res => setTimeout(res, 1000));
    }
    setCountdown("SMILE!");
    await new Promise(res => setTimeout(res, 500));
    setCountdown(null);

    setMessage("");

    try {
      let response: Response;

      if (mode === "browser-video") {
        if (live.current?.getStatus() !== "active") throw new Error("START LIVE VIEW DULU");
        const frame = live.current.captureFrame();
        response = await fetch("/api/camera/browser-frame", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.sessionId, imageDataUrl: frame.rawImageDataUrl, displayImageDataUrl: frame.displayImageDataUrl }),
        });
      } else {
        live.current?.stopLiveView();
        response = await fetch("/api/camera/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.sessionId }),
        });
      }

      const data = (await response.json()) as CaptureResponse;
      const url = data.capturedPhotoUrl || data.imageUrl;
      const displayUrl = data.displayPhotoUrl || url;
      if (!response.ok || !data.ok || !url) throw new Error(data.error || "CAMERA CAPTURE GAGAL");

      if (shotCount.current >= max) return;
      shotCount.current += 1;
      addCapturedPhoto({ raw: url, display: displayUrl as string });
      setMessage(`FOTO ${shotCount.current} TERSIMPAN`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "CAMERA CAPTURE GAGAL");
    } finally {
      captureLock.current = false;
      setIsCapturing(false);
    }
  }

  return (
    <KioskStage>
      <div className="shot-counter">
        Shoot {maxReached ? max : count + 1} / {max} {required < max ? `(Butuh Min. ${required})` : ""}
      </div>
      <CameraLiveView 
        ref={live} 
        compact 
        autoStart
        selectedBackgroundUrl={backgrounds.find(bg => bg.id === session?.selectedBackgroundId)?.imageUrl}
        tuning={session?.greenScreenTuning}
      />
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
        selectedBackgroundId={session?.selectedBackgroundId}
        onSelectBackground={selectBackground}
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
            <KioskButton onClick={shoot} disabled={isCapturing} className="camera-shoot">
              {isCapturing ? "..." : "SHOOT"}
            </KioskButton>
          )}
          {count >= 1 && (
            <KioskButton
              onClick={() => { if (count >= required) router.push("/preview"); }}
              disabled={count < required}
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
