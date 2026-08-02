"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KioskButton, KioskStage, PhotoResultStrip, PreviewComposer } from "@/components/kiosk";
import { getFrameById, backgrounds } from "@/lib/phobo-data";
import { useSessionStore } from "@/lib/session/session-store";

export default function AdditionalPreview() {
  const router = useRouter();
  const { session, hasHydrated, setAdditionalSelectedPhotoIndices, setAddPrintPaymentStatus } = useSessionStore();
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    if (hasHydrated && !session?.additionalFrameId) {
      router.replace("/additional-frame");
    }
  }, [hasHydrated, session?.additionalFrameId, router]);

  const frame = getFrameById(session?.additionalFrameId);
  const needed = frame?.requiredPhotos || 0;

  useEffect(() => {
    if (hasHydrated && session?.capturedPhotos && session.capturedPhotos.length > 0) {
      if (selected.length === 0 && (!session.additionalSelectedPhotoIndices || session.additionalSelectedPhotoIndices.length === 0)) {
        // Default to first 'needed' photos
        setSelected(Array.from({ length: Math.min(needed, session.capturedPhotos.length) }, (_, i) => i));
      } else if (selected.length === 0 && session.additionalSelectedPhotoIndices && session.additionalSelectedPhotoIndices.length > 0) {
        setSelected(session.additionalSelectedPhotoIndices);
      }
    }
  }, [hasHydrated, session?.capturedPhotos, session?.additionalSelectedPhotoIndices, needed, selected.length]);

  const chosen = selected.map(i => session?.capturedPhotos?.[i]).filter(Boolean) as { raw: string; display: string }[];
  const chosenDisplayUrls = chosen.map(p => p.display);
  const allDisplayUrls = (session?.capturedPhotos ?? []).map(p => p.display);

  function toggle(i: number) {
    const next = selected.includes(i) 
      ? selected.filter(x => x !== i) 
      : selected.length < needed 
        ? [...selected, i] 
        : [...selected.slice(1), i];
    setSelected(next);
  }

  const isReady = selected.length === needed;
  const background = backgrounds.find(bg => bg.id === session?.selectedBackgroundId) || backgrounds[0];

  function next() {
    if (!isReady) return;
    setAdditionalSelectedPhotoIndices(selected);
    setAddPrintPaymentStatus("unpaid");
    router.push("/add-print-payment");
  }

  if (!frame) return null;

  return (
    <KioskStage>
      <h1 className="preview-heading">PREVIEW ADDITIONAL FRAME</h1>
      <PreviewComposer frame={frame} photoUrls={chosenDisplayUrls} background={background} />
      <PhotoResultStrip photos={allDisplayUrls} selectedIndices={selected} onTogglePhoto={toggle} />
      <KioskButton className="preview-next" onClick={next} disabled={!isReady}>
        NEXT
      </KioskButton>
      {!isReady && (
        <p className="kiosk-message" style={{ color: "#ffaa00", top: "82%" }}>
          Pilih {needed} foto untuk frame ini. (Terpilih {selected.length} / {needed})
        </p>
      )}
    </KioskStage>
  );
}
