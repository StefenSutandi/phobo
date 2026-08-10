"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { KioskButton, KioskStage, PhotoResultStrip, PreviewComposer, StickerPicker } from "@/components/kiosk";
import { getFrameById, getBackgroundById, backgrounds } from "@/lib/phobo-data";
import { useSessionStore } from "@/lib/session/session-store";
import { getPhotoDisplayUrl, getPhotoRawUrl, type CapturedPhoto } from "@/lib/session/session-types";
import { getStickers } from "./actions";

export default function Preview() {
  const router = useRouter();
  const {
    session,
    hasHydrated,
    setPhotoSlotAssignments,
    setFinalImageUrl,
    setPrintImageUrl,
    setDriveUrl,
  } = useSessionStore();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [stickersList, setStickersList] = useState<string[]>([]);
  
  // Selection / Interaction states for Tap Fallback and Drag & Drop
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState<number | null>(null);
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number | null>(null);

  // Pointer Drag & Drop states
  const [draggingPhotoIdx, setDraggingPhotoIdx] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOverSlotIdx, setDragOverSlotIdx] = useState<number | null>(null);

  useEffect(() => {
    if (hasHydrated && !session?.capturedPhotos.length) router.replace("/camera");
  }, [hasHydrated, session?.capturedPhotos.length, router]);

  useEffect(() => {
    getStickers().then(setStickersList);
  }, []);

  const frame = getFrameById(session?.selectedFrameId);
  const requiredSlots = frame.photoSlots.length;
  const captured = session?.capturedPhotos ?? [];

  // Initialize or validate slot assignments
  useEffect(() => {
    if (!hasHydrated || !session || captured.length === 0) return;

    const currentAssignments = session.photoSlotAssignments;
    if (
      !currentAssignments ||
      currentAssignments.length !== requiredSlots
    ) {
      // Auto-assign first requiredSlots photos
      const initial: (number | null)[] = Array.from(
        { length: requiredSlots },
        (_, i) => (i < captured.length ? i : null)
      );
      setPhotoSlotAssignments(initial);
    }
  }, [hasHydrated, session, requiredSlots, captured.length, setPhotoSlotAssignments]);

  const assignments = session?.photoSlotAssignments ?? Array.from({ length: requiredSlots }, (_, i) => (i < captured.length ? i : null));

  // Swap / assign logic
  const handleAssignPhotoToSlot = useCallback((photoIndex: number, targetSlotIndex: number) => {
    const nextAssignments = [...assignments];
    const existingSlotOfPhoto = nextAssignments.findIndex(a => a === photoIndex);
    const occupantInTarget = nextAssignments[targetSlotIndex];

    if (existingSlotOfPhoto >= 0 && existingSlotOfPhoto !== targetSlotIndex) {
      // Swap! Place target occupant into photo's old slot
      nextAssignments[existingSlotOfPhoto] = occupantInTarget !== undefined ? occupantInTarget : null;
    }

    nextAssignments[targetSlotIndex] = photoIndex;
    setPhotoSlotAssignments(nextAssignments);
    setSelectedPhotoIdx(null);
    setSelectedSlotIdx(null);
  }, [assignments, setPhotoSlotAssignments]);

  // Tap handlers
  const handleTogglePhoto = (index: number) => {
    if (selectedSlotIdx !== null) {
      // Slot was already selected, assign photo to it
      handleAssignPhotoToSlot(index, selectedSlotIdx);
    } else {
      setSelectedPhotoIdx(prev => (prev === index ? null : index));
    }
  };

  const handleSlotClick = (slotIndex: number) => {
    if (selectedPhotoIdx !== null) {
      // Photo was already selected, assign to this slot
      handleAssignPhotoToSlot(selectedPhotoIdx, slotIndex);
    } else {
      setSelectedSlotIdx(prev => (prev === slotIndex ? null : slotIndex));
    }
  };

  // Pointer drag & drop handlers for IR Touch + Mouse
  const handlePointerDownPhoto = (e: React.PointerEvent, photoIndex: number) => {
    setDraggingPhotoIdx(photoIndex);
    setDragPos({ x: e.clientX, y: e.clientY });

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setDragPos({ x: moveEvent.clientX, y: moveEvent.clientY });

      // Detect slot element under cursor
      const el = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const slotEl = el?.closest("[data-slot-index]");
      if (slotEl) {
        const slotIdxStr = slotEl.getAttribute("data-slot-index");
        if (slotIdxStr !== null) {
          setDragOverSlotIdx(parseInt(slotIdxStr, 10));
          return;
        }
      }
      setDragOverSlotIdx(null);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);

      const el = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
      const slotEl = el?.closest("[data-slot-index]");
      if (slotEl) {
        const slotIdxStr = slotEl.getAttribute("data-slot-index");
        if (slotIdxStr !== null) {
          const targetIdx = parseInt(slotIdxStr, 10);
          handleAssignPhotoToSlot(photoIndex, targetIdx);
        }
      }

      setDraggingPhotoIdx(null);
      setDragPos(null);
      setDragOverSlotIdx(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const isReady =
    assignments.length === requiredSlots &&
    assignments.every(idx => idx !== null && idx !== undefined && idx >= 0 && idx < captured.length);

  async function next() {
    if (!isReady || !session || saving) return;
    setSaving(true);
    setError("");

    try {
      const stickersEnabled = process.env.NEXT_PUBLIC_PHOBO_STICKERS_ENABLED !== "false";

      // Prepare explicit slot assignments payload
      const slotAssignmentsPayload = assignments.map((photoIdx, slotIdx) => {
        const photoObj = photoIdx !== null ? captured[photoIdx] : null;
        return {
          slotIndex: slotIdx,
          photoRaw: getPhotoRawUrl(photoObj),
          backgroundId: (photoObj && typeof photoObj === "object" && photoObj.backgroundId)
            ? photoObj.backgroundId
            : (session.selectedBackgroundId || "background-01"),
        };
      });

      const r = await fetch("/api/results/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          capturedPhotos: captured,
          selectedFrameId: session.selectedFrameId,
          selectedBackgroundId: session.selectedBackgroundId,
          slotAssignments: slotAssignmentsPayload,
          packageId: session.packageId,
          stickers: stickersEnabled ? session.stickers : [],
          options: session.greenScreenTuning,
        }),
      });

      const text = await r.text();
      let d;
      try {
        d = JSON.parse(text);
      } catch (err) {
        throw new Error(`API returned non-JSON response: ${text.substring(0, 200)}`);
      }

      if (!r.ok || !d.ok || !d.finalImageUrl || !d.printImageUrl) {
        throw new Error(d.error || "Failed to compose result");
      }

      setFinalImageUrl(d.finalImageUrl);
      setPrintImageUrl(d.printImageUrl);
      if (d.driveUrl) setDriveUrl(d.driveUrl);
      router.push("/result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to compose result");
    } finally {
      setSaving(false);
    }
  }

  const draggedPhotoObj = draggingPhotoIdx !== null ? captured[draggingPhotoIdx] : null;
  const draggedBg = draggedPhotoObj && typeof draggedPhotoObj === "object" && draggedPhotoObj.backgroundId
    ? getBackgroundById(draggedPhotoObj.backgroundId)
    : getBackgroundById(session?.selectedBackgroundId || "background-01");

  return (
    <KioskStage>
      <h1 className="preview-heading">PREVIEW FRAME</h1>

      <PreviewComposer
        frame={frame}
        photoSlotAssignments={assignments}
        capturedPhotos={captured}
        selectedBackgroundId={session?.selectedBackgroundId}
        onSlotClick={handleSlotClick}
        activeSlotIndex={selectedSlotIdx}
        dragOverSlotIndex={dragOverSlotIdx}
      />

      <StickerPicker stickers={stickersList} />

      <PhotoResultStrip
        photos={captured}
        slotAssignments={assignments}
        selectedPhotoIndex={selectedPhotoIdx}
        selectedBackgroundId={session?.selectedBackgroundId}
        onTogglePhoto={handleTogglePhoto}
        onPointerDownPhoto={handlePointerDownPhoto}
      />

      <KioskButton
        className="preview-next"
        onClick={next}
        disabled={!isReady || saving}
      >
        {saving ? "PROCESSING..." : "NEXT"}
      </KioskButton>

      {!isReady && (
        <p className="kiosk-message" style={{ color: "#ffaa00", top: "82%" }}>
          Isi semua {requiredSlots} slot frame ini untuk melanjutkan.
        </p>
      )}

      {error && <p className="kiosk-message">{error}</p>}

      {/* Floating Drag Avatar */}
      {draggingPhotoIdx !== null && dragPos && (
        <div
          style={{
            position: "fixed",
            left: dragPos.x - 40,
            top: dragPos.y - 40,
            width: 80,
            height: 100,
            pointerEvents: "none",
            zIndex: 9999,
            borderRadius: "8px",
            overflow: "hidden",
            border: "3px solid #ffd700",
            boxShadow: "0 10px 25px rgba(0,0,0,0.7)",
            transform: "scale(1.1)",
            background: "#222"
          }}
        >
          {draggedBg && (draggedBg.imageUrl ? (
            <img src={draggedBg.imageUrl} alt="" style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", zIndex: 0 }} />
          ) : (
            <div style={{ position: "absolute", width: "100%", height: "100%", backgroundColor: draggedBg.color || "#d9d9d9", zIndex: 0 }} />
          ))}
          <img
            src={getPhotoDisplayUrl(draggedPhotoObj)}
            alt=""
            style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>
      )}
    </KioskStage>
  );
}
