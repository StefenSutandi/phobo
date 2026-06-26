"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  KioskButton,
  KioskStage,
  PhotoResultStrip,
  PreviewComposer,
  StickerPicker,
} from "@/components/kiosk";
import { useSessionStore } from "@/lib/session/session-store";

export default function Preview() {
  const router = useRouter();
  const { session, hasHydrated, setFinalImageUrl, setPrintImageUrl } = useSessionStore();
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (!session?.capturedPhotos.length) {
      router.replace("/camera");
    }
  }, [hasHydrated, router, session?.capturedPhotos.length]);

  async function finishPreview() {
    if (!session || isSaving) {
      return;
    }

    if (session.finalImageUrl && session.printImageUrl) {
      router.push("/result");
      return;
    }

    setIsSaving(true);
    setSaveError("");

    try {
      const response = await fetch("/api/results/compose", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: session.sessionId,
          capturedPhotos: session.capturedPhotos,
          selectedFrameId: session.selectedFrameId,
          selectedBackgroundId: session.selectedBackgroundId,
          options: session.greenScreenTuning || {
            applyChromaKey: true,
            greenMin: 90,
            greenTolerance: 35,
            spillReduction: 0,
            edgeSoftness: 0,
          },
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        finalImageUrl?: string;
        printImageUrl?: string;
        error?: string;
      };

      if (!response.ok || !payload.ok || !payload.finalImageUrl || !payload.printImageUrl) {
        throw new Error(payload.error || "Failed to compose result");
      }

      setFinalImageUrl(payload.finalImageUrl);
      setPrintImageUrl(payload.printImageUrl);
      router.push("/result");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to compose result");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <KioskStage>
      <PreviewComposer photoUrl={session?.capturedPhotos?.[0]} />
      <PhotoResultStrip photos={session?.capturedPhotos ?? []} />
      <StickerPicker />
      <KioskButton onClick={finishPreview} className="preview-next" style={{ opacity: isSaving ? 0.7 : 1 }}>
        {isSaving ? "PROCESSING..." : "NEXT"}
      </KioskButton>
      {saveError && <p className="kiosk-message">{saveError}</p>}
    </KioskStage>
  );
}
