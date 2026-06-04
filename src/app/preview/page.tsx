"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  KioskButton,
  KioskStage,
  PhotoResultStrip,
  PreviewComposer,
  StickerPicker,
} from "@/components/kiosk";
import { useSessionStore } from "@/lib/session/session-store";

function createMockFinalImageUrl(sessionId: string) {
  const safeSession = sessionId.replace(/[^a-zA-Z0-9-]/g, "");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="900" viewBox="0 0 640 900">
      <rect width="640" height="900" fill="#d3974d"/>
      <rect x="80" y="80" width="480" height="560" rx="28" fill="#d9d9d9"/>
      <rect x="120" y="690" width="400" height="80" rx="40" fill="#591f42"/>
      <text x="320" y="743" fill="#ffffff" font-family="Arial" font-size="32" text-anchor="middle">PHOBO MOCK RESULT</text>
      <text x="320" y="820" fill="#404a4b" font-family="Arial" font-size="20" text-anchor="middle">${safeSession.slice(0, 28)}</text>
    </svg>
  `;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default function Preview() {
  const router = useRouter();
  const { session, hasHydrated, setFinalImageUrl } = useSessionStore();

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (!session?.capturedPhotos.length) {
      router.replace("/camera");
    }
  }, [hasHydrated, router, session?.capturedPhotos.length]);

  function finishPreview() {
    if (!session) {
      return;
    }

    setFinalImageUrl(createMockFinalImageUrl(session.sessionId));
    router.push("/result");
  }

  return (
    <KioskStage>
      <PreviewComposer />
      <PhotoResultStrip photos={session?.capturedPhotos ?? []} />
      <StickerPicker />
      <KioskButton href="/result" onClick={finishPreview} className="preview-next">
        NEXT
      </KioskButton>
    </KioskStage>
  );
}
