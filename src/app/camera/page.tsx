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

    setIsCapturing(true);
    setMessage("");

    // Stop live view before hardware capture to prevent driver conflicts
    liveViewRef.current?.stopLiveView();

    try {
      const response = await fetch("/api/camera/capture", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: session.sessionId,
        }),
      });
      const payload = (await response.json()) as CaptureResponse;

      if (!response.ok || !payload.ok || !payload.imageUrl) {
        setMessage(payload.error || "CAMERA CAPTURE GAGAL");
        return;
      }

      addCapturedPhoto(payload.imageUrl);
      router.push("/preview");
    } catch {
      setMessage("CAMERA CAPTURE GAGAL");
    } finally {
      setIsCapturing(false);
    }
  }

  return (
    <KioskStage>
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
