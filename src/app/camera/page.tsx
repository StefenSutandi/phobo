"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BackgroundPicker,
  CameraPanel,
  KioskButton,
  KioskStage,
} from "@/components/kiosk";
import { useSessionStore } from "@/lib/session/session-store";

const backgrounds = Array.from({ length: 16 }, (_, index) => `background-${index + 1}`);

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

export default function Camera() {
  const router = useRouter();
  const {
    session,
    hasHydrated,
    selectBackground,
    addCapturedPhoto,
  } = useSessionStore();
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (!session?.selectedFrameId) {
      router.replace("/frames");
      return;
    }

    if (!session.selectedBackgroundId) {
      selectBackground(backgrounds[0]);
    }
  }, [hasHydrated, router, selectBackground, session?.selectedBackgroundId, session?.selectedFrameId]);

  function shoot() {
    if (!session?.selectedBackgroundId) {
      setMessage("PILIH BACKGROUND DULU");
      return;
    }

    const nextPhotoNumber = (session.capturedPhotos.length ?? 0) + 1;
    addCapturedPhoto(createMockPhotoUrl(nextPhotoNumber));
    router.push("/preview");
  }

  return (
    <KioskStage>
      <CameraPanel />
      <BackgroundPicker
        backgrounds={backgrounds}
        selectedBackgroundId={session?.selectedBackgroundId}
        onSelectBackground={(backgroundId) => {
          selectBackground(backgroundId);
          setMessage("");
        }}
      />
      <KioskButton onClick={shoot} className="camera-shoot">
        SHOOT
      </KioskButton>
      {message && <p className="kiosk-message camera-message">{message}</p>}
    </KioskStage>
  );
}
