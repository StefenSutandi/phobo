"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { KioskButton, KioskStage, PhotoResultStrip, PreviewComposer } from "@/components/kiosk";
import { getFrameById, getBackgroundById } from "@/lib/phobo-data";
import { useSessionStore } from "@/lib/session/session-store";
import { getPhotoDisplayUrl } from "@/lib/session/session-types";

export default function AdditionalPreview() {
  const router = useRouter();
  const {
    session,
    hasHydrated,
    setAdditionalPhotoSlotAssignments,
    setAddPrintPaymentStatus,
  } = useSessionStore();

  // Selection / Interaction states for Tap Fallback and Drag & Drop
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState<number | null>(null);
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number | null>(null);

  // Pointer Drag & Drop states
  const [draggingPhotoIdx, setDraggingPhotoIdx] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOverSlotIdx, setDragOverSlotIdx] = useState<number | null>(null);

  useEffect(() => {
    if (hasHydrated && !session?.additionalFrameId) {
      router.replace("/additional-frame");
    }
  }, [hasHydrated, session?.additionalFrameId, router]);

  const frame = getFrameById(session?.additionalFrameId);
  const requiredSlots = frame?.photoSlots.length || 0;
  const captured = session?.capturedPhotos ?? [];

  // Initialize or validate additional slot assignments
  useEffect(() => {
    if (!hasHydrated || !session || captured.length === 0 || requiredSlots === 0) return;

    const currentAssignments = session.additionalPhotoSlotAssignments;
    if (
      !currentAssignments ||
      currentAssignments.length !== requiredSlots
    ) {
      const initial: (number | null)[] = Array.from(
        { length: requiredSlots },
        (_, i) => (i < captured.length ? i : null)
      );
      setAdditionalPhotoSlotAssignments(initial);
    }
  }, [hasHydrated, session, requiredSlots, captured.length, setAdditionalPhotoSlotAssignments]);

  const assignments = session?.additionalPhotoSlotAssignments ?? Array.from({ length: requiredSlots }, (_, i) => (i < captured.length ? i : null));

  // Swap / assign logic
  const handleAssignPhotoToSlot = useCallback((photoIndex: number, targetSlotIndex: number) => {
    const nextAssignments = [...assignments];
    const existingSlotOfPhoto = nextAssignments.findIndex(a => a === photoIndex);
    const occupantInTarget = nextAssignments[targetSlotIndex];

    if (existingSlotOfPhoto >= 0 && existingSlotOfPhoto !== targetSlotIndex) {
      nextAssignments[existingSlotOfPhoto] = occupantInTarget !== undefined ? occupantInTarget : null;
    }

    nextAssignments[targetSlotIndex] = photoIndex;
    setAdditionalPhotoSlotAssignments(nextAssignments);
    setSelectedPhotoIdx(null);
    setSelectedSlotIdx(null);
  }, [assignments, setAdditionalPhotoSlotAssignments]);

  // Tap handlers
  const handleTogglePhoto = (index: number) => {
    if (selectedSlotIdx !== null) {
      handleAssignPhotoToSlot(index, selectedSlotIdx);
    } else {
      setSelectedPhotoIdx(prev => (prev === index ? null : index));
    }
  };

  const handleSlotClick = (slotIndex: number) => {
    if (selectedPhotoIdx !== null) {
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
    requiredSlots > 0 &&
    assignments.length === requiredSlots &&
    assignments.every(idx => idx !== null && idx !== undefined && idx >= 0 && idx < captured.length);

  function next() {
    if (!isReady) return;
    setAddPrintPaymentStatus("unpaid");
    router.push("/add-print-payment");
  }

  if (!frame) return null;

  const draggedPhotoObj = draggingPhotoIdx !== null ? captured[draggingPhotoIdx] : null;
  const draggedBg = draggedPhotoObj && typeof draggedPhotoObj === "object" && draggedPhotoObj.backgroundId
    ? getBackgroundById(draggedPhotoObj.backgroundId)
    : getBackgroundById(session?.selectedBackgroundId || "background-01");

  return (
    <KioskStage>
      <h1 className="preview-heading">PREVIEW ADDITIONAL FRAME</h1>

      <PreviewComposer
        frame={frame}
        photoSlotAssignments={assignments}
        capturedPhotos={captured}
        selectedBackgroundId={session?.selectedBackgroundId}
        onSlotClick={handleSlotClick}
        activeSlotIndex={selectedSlotIdx}
        dragOverSlotIndex={dragOverSlotIdx}
      />

      <PhotoResultStrip
        photos={captured}
        slotAssignments={assignments}
        selectedPhotoIndex={selectedPhotoIdx}
        selectedBackgroundId={session?.selectedBackgroundId}
        onTogglePhoto={handleTogglePhoto}
        onPointerDownPhoto={handlePointerDownPhoto}
      />

      <KioskButton className="preview-next" onClick={next} disabled={!isReady}>
        NEXT
      </KioskButton>

      {!isReady && (
        <p className="kiosk-message" style={{ color: "#ffaa00", top: "82%" }}>
          Isi semua {requiredSlots} slot frame ini untuk melanjutkan.
        </p>
      )}

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
