"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BackgroundPicker,
  KioskButton,
  KioskStage,
} from "@/components/kiosk";
import { CameraLiveView, type CameraLiveViewHandle } from "@/components/camera-live-view";
import { useRef } from "react";
import { backgrounds } from "@/lib/phobo-data";
import { useSessionStore } from "@/lib/session/session-store";

type CaptureResponse = {
  ok: boolean;
  imageUrl?: string;
  capturedPhotoUrl?: string;
  error?: string;
};

export default function Camera() {
  const router = useRouter();
  const {
    session,
    hasHydrated,
    selectBackground,
    addCapturedPhoto,
  } = useSessionStore();
  const liveViewRef = useRef<CameraLiveViewHandle>(null);
  const [message, setMessage] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraMode, setCameraMode] = useState<string>("mock");

  useEffect(() => {
    async function fetchDiagnostics() {
      try {
        const res = await fetch("/api/diagnostics");
        if (res.ok) {
          const data = await res.json();
          setCameraMode(data.env?.cameraMode || "mock");
        }
      } catch (err) {
        console.error("Failed to fetch camera mode", err);
      }
    }
    fetchDiagnostics();
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (!session?.selectedFrameId) {
      router.replace("/frames");
      return;
    }

    if (!session.selectedBackgroundId) {
      selectBackground(backgrounds[0].id);
    }
  }, [hasHydrated, router, selectBackground, session?.selectedBackgroundId, session?.selectedFrameId]);

  async function shoot() {
    if (!session?.sessionId || !session.selectedBackgroundId) {
      setMessage("PILIH BACKGROUND DULU");
      return;
    }
    
    if (cameraMode === "browser-video") {
      const liveStatus = liveViewRef.current?.getStatus();
      if (liveStatus !== "active") {
        setMessage("Start live view first.");
        return;
      }
    }

    setIsCapturing(true);
    setMessage("");

    try {
      if (cameraMode === "browser-video") {
        // Browser video capture mode
        const frameData = liveViewRef.current?.captureFrame();
        if (!frameData) {
          throw new Error("Could not capture frame from live view");
        }
        
        const response = await fetch("/api/camera/browser-frame", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.sessionId,
            imageDataUrl: frameData.imageDataUrl,
          }),
        });
        const payload = (await response.json()) as CaptureResponse;
        
        if (!response.ok || !payload.ok || !payload.capturedPhotoUrl) {
          setMessage(payload.error || "CAMERA CAPTURE GAGAL");
          return;
        }
        addCapturedPhoto(payload.capturedPhotoUrl);
        router.push("/preview");
      } else {
        // Command / eos-watch / mock hardware capture mode
        liveViewRef.current?.stopLiveView(); // Prevent hardware conflict

        const response = await fetch("/api/camera/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.sessionId }),
        });
        const payload = (await response.json()) as CaptureResponse;

        if (!response.ok || !payload.ok || !payload.imageUrl) {
          setMessage(payload.error || "CAMERA CAPTURE GAGAL");
          return;
        }

        addCapturedPhoto(payload.imageUrl);
        router.push("/preview");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "CAMERA CAPTURE GAGAL");
    } finally {
      setIsCapturing(false);
    }
  }

  return (
    <KioskStage>
      {cameraMode === "browser-video" && (
        <div style={{ position: "absolute", top: "10px", right: "10px", zIndex: 10, background: "rgba(0,0,0,0.7)", padding: "10px", borderRadius: "8px", color: "white", fontSize: "12px", border: "1px solid #555" }}>
          <strong>Capture mode: USB Video</strong>
          <div style={{ marginTop: "4px" }}>SHOOT will save the current live view frame.</div>
        </div>
      )}
      <CameraLiveView ref={liveViewRef} />
      <BackgroundPicker
        backgrounds={backgrounds.map((background) => background.id)}
        selectedBackgroundId={session?.selectedBackgroundId}
        onSelectBackground={(backgroundId) => {
          selectBackground(backgroundId);
          setMessage("");
        }}
      />
      <KioskButton onClick={shoot} className="camera-shoot">
        {isCapturing ? "..." : "SHOOT"}
      </KioskButton>
      {message && <p className="kiosk-message camera-message">{message}</p>}
    </KioskStage>
  );
}
