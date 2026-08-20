"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { KioskButton, KioskStage, PhotoResultStrip, PreviewComposer } from "@/components/kiosk";
import { getFrameById, getBackgroundById } from "@/lib/phobo-data";
import { assignPhotoToSlot } from "@/lib/preview/slot-assignment";
import { useSessionStore } from "@/lib/session/session-store";
import { getPhotoDisplayUrl } from "@/lib/session/session-types";

export default function AdditionalPreview() {
  const router = useRouter();
  const {
    session,
    setAdditionalPhotoSlotAssignments,
    setAddPrintPaymentStatus,
  } = useSessionStore();

  // Selection / Interaction states for Tap Fallback
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState<number | null>(null);
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number | null>(null);

  // Pointer Drag & Drop states (IR Touch + Mouse)
  const [draggingPhotoIdx, setDraggingPhotoIdx] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOverSlotIdx, setDragOverSlotIdx] = useState<number | null>(null);

  const frameId = session?.additionalFrameId;
  const frame = frameId ? getFrameById(frameId) : null;
  const requiredSlots = frame ? frame.photoSlots.length : 0;
  const captured = session?.capturedPhotos ?? [];

  const representativeSlot = frame?.photoSlots[0];
  const slotRatio = representativeSlot ? representativeSlot.width / representativeSlot.height : 1.5;

  const assignments = session?.additionalPhotoSlotAssignments ?? Array.from({ length: requiredSlots }, (_, i) => (i < captured.length ? i : null));

  // Pure replace assignment
  const handleAssignPhotoToSlot = useCallback((photoIndex: number, targetSlotIndex: number) => {
    const nextAssignments = assignPhotoToSlot(assignments, photoIndex, targetSlotIndex);
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

  // Robust Pointer Events Drag & Drop for IR Touch + Mouse
  const handlePointerDownPhoto = (e: React.PointerEvent, photoIndex: number) => {
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const startTime = Date.now();
    let isDragging = false;

    const targetEl = e.currentTarget as HTMLElement;
    try {
      targetEl.setPointerCapture?.(pointerId);
    } catch {
      // Ignore
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;

      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const distance = Math.hypot(dx, dy);

      if (!isDragging) {
        if (distance > 8) {
          isDragging = true;
          setDraggingPhotoIdx(photoIndex);
        }
      }

      if (isDragging) {
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
      }
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      try {
        targetEl.releasePointerCapture?.(pointerId);
      } catch {
        // Ignore
      }
      setDraggingPhotoIdx(null);
      setDragPos(null);
      setDragOverSlotIdx(null);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;

      if (isDragging) {
        const el = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
        const slotEl = el?.closest("[data-slot-index]");
        if (slotEl) {
          const slotIdxStr = slotEl.getAttribute("data-slot-index");
          if (slotIdxStr !== null) {
            const targetIdx = parseInt(slotIdxStr, 10);
            handleAssignPhotoToSlot(photoIndex, targetIdx);
          }
        }
      } else {
        const elapsed = Date.now() - startTime;
        if (elapsed < 500) {
          handleTogglePhoto(photoIndex);
        }
      }

      cleanup();
    };

    const handlePointerCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== pointerId) return;
      cleanup();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
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

  const ghostWidth = 110;
  const ghostHeight = Math.round(ghostWidth / slotRatio);

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
        aspectRatio={slotRatio}
        onTogglePhoto={handleTogglePhoto}
        onPointerDownPhoto={handlePointerDownPhoto}
      />

      <KioskButton
        className="preview-next"
        onClick={next}
        disabled={!isReady}
      >
        NEXT
      </KioskButton>

      {!isReady && (
        <p className="kiosk-message" style={{ color: "#ffaa00", top: "82%" }}>
          Isi semua {requiredSlots} slot frame ini untuk melanjutkan.
        </p>
      )}

      {/* Floating Landscape Drag Avatar */}
      {draggingPhotoIdx !== null && dragPos && (
        <div
          style={{
            position: "fixed",
            left: dragPos.x - ghostWidth / 2,
            top: dragPos.y - ghostHeight / 2,
            width: ghostWidth,
            height: ghostHeight,
            pointerEvents: "none",
            zIndex: 9999,
            borderRadius: "8px",
            overflow: "hidden",
            border: "3px solid #ffd700",
            boxShadow: "0 10px 25px rgba(0,0,0,0.7)",
            transform: "scale(1.08)",
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
            style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      )}
    </KioskStage>
  );
}
