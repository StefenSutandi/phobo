"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { KioskButton, KioskStage, PhotoResultStrip, PreviewComposer, StickerPicker } from "@/components/kiosk";
import { getFrameById, getBackgroundById } from "@/lib/phobo-data";
import { assignPhotoToSlot } from "@/lib/preview/slot-assignment";
import { classifyPointerGesture } from "@/lib/preview/gesture-arbitration";
import { useSessionStore } from "@/lib/session/session-store";
import { getPhotoDisplayUrl } from "@/lib/session/session-types";
import { getStickers } from "../preview/actions";

export default function AdditionalPreview() {
  const router = useRouter();
  const {
    session,
    hasHydrated,
    setAdditionalPhotoSlotAssignments,
    setAddPrintPaymentStatus,
    addAdditionalSticker,
    updateAdditionalSticker,
    removeAdditionalSticker,
    initAdditionalPreviewTimer,
  } = useSessionStore();

  const [stickersList, setStickersList] = useState<string[]>([]);

  // Selection / Interaction states for Tap Fallback
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState<number | null>(null);
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number | null>(null);

  // Pointer Drag & Drop states (IR Touch + Mouse)
  const [draggingPhotoIdx, setDraggingPhotoIdx] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOverSlotIdx, setDragOverSlotIdx] = useState<number | null>(null);

  // Persistent 2-minute Additional Preview Timer
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    if (session?.additionalPreviewDeadlineAt) {
      return Math.max(0, Math.floor((new Date(session.additionalPreviewDeadlineAt).getTime() - Date.now()) / 1000));
    }
    return 120;
  });

  const hasAutoContinuedRef = useRef(false);

  useEffect(() => {
    if (!hasHydrated || !session) return;
    if (!session.additionalPreviewDeadlineAt) {
      initAdditionalPreviewTimer(120);
    }
  }, [hasHydrated, session, initAdditionalPreviewTimer]);

  useEffect(() => {
    if (!session?.additionalPreviewDeadlineAt) return;
    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((new Date(session.additionalPreviewDeadlineAt!).getTime() - Date.now()) / 1000));
      setRemainingSeconds(diff);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [session?.additionalPreviewDeadlineAt]);

  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  const formattedTimer = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const isUrgent = remainingSeconds <= 30 && remainingSeconds > 0;
  const isExpired = remainingSeconds === 0;

  useEffect(() => {
    getStickers().then(setStickersList);
  }, []);

  const frameId = session?.additionalFrameId;
  const frame = frameId ? getFrameById(frameId) : null;
  const requiredSlots = frame ? frame.photoSlots.length : 0;
  const captured = session?.capturedPhotos ?? [];

  // 1. Navigation guard when hydrated
  useEffect(() => {
    if (hasHydrated && !session?.additionalFrameId) {
      router.replace("/additional-frame");
    }
  }, [hasHydrated, session?.additionalFrameId, router]);

  // 2. Persist initial slot assignments so pressing NEXT without touching slots works seamlessly
  useEffect(() => {
    if (!hasHydrated || !session || !frame || captured.length === 0) return;

    const currentAssignments = session.additionalPhotoSlotAssignments;
    if (!currentAssignments || currentAssignments.length !== requiredSlots) {
      const initial = Array.from(
        { length: requiredSlots },
        (_, i) => (i < captured.length ? i : null)
      );
      setAdditionalPhotoSlotAssignments(initial);
    }
  }, [hasHydrated, session, frame, requiredSlots, captured.length, setAdditionalPhotoSlotAssignments]);

  const representativeSlot = frame?.photoSlots[0];
  const slotRatio = representativeSlot ? representativeSlot.width / representativeSlot.height : 1.5;

  const assignments = session?.additionalPhotoSlotAssignments ?? Array.from({ length: requiredSlots }, (_, i) => (i < captured.length ? i : null));

  const suppressNextClickRef = useRef(false);

  // Pure replace assignment: assign photo P to slot S without modifying or swapping other slots
  const handleAssignPhotoToSlot = useCallback((photoIndex: number, targetSlotIndex: number) => {
    const nextAssignments = assignPhotoToSlot(assignments, photoIndex, targetSlotIndex);
    setAdditionalPhotoSlotAssignments(nextAssignments);
    setSelectedPhotoIdx(null);
    setSelectedSlotIdx(null);
  }, [assignments, setAdditionalPhotoSlotAssignments]);

  // Click handler (supports keyboard/accessibility clicks, suppresses trailing click after pointer gestures)
  const handleTogglePhoto = useCallback((index: number) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (selectedSlotIdx !== null) {
      handleAssignPhotoToSlot(index, selectedSlotIdx);
    } else {
      setSelectedPhotoIdx(prev => (prev === index ? null : index));
    }
  }, [selectedSlotIdx, handleAssignPhotoToSlot]);

  const handleSlotClick = (slotIndex: number) => {
    if (selectedPhotoIdx !== null) {
      handleAssignPhotoToSlot(selectedPhotoIdx, slotIndex);
    } else {
      setSelectedSlotIdx(prev => (prev === slotIndex ? null : slotIndex));
    }
  };

  // Robust Pointer Events Drag & Drop with Gesture Arbitration for IR Touch + Mouse
  const handlePointerDownPhoto = (e: React.PointerEvent, photoIndex: number) => {
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const startTime = Date.now();
    let gestureState: "pending" | "scrolling" | "dragging" = "pending";

    const targetEl = e.currentTarget as HTMLElement;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;

      if (gestureState === "scrolling") {
        // Natural vertical scrolling - do not interfere
        return;
      }

      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      if (gestureState === "pending") {
        const gesture = classifyPointerGesture(dx, dy);
        if (gesture === "scroll") {
          gestureState = "scrolling";
          return;
        } else if (gesture === "drag") {
          gestureState = "dragging";
          try {
            targetEl.setPointerCapture?.(pointerId);
          } catch {
            // Ignore
          }
          setDraggingPhotoIdx(photoIndex);
        }
      }

      if (gestureState === "dragging") {
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

      if (gestureState === "dragging") {
        suppressNextClickRef.current = true;
        const el = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
        const slotEl = el?.closest("[data-slot-index]");
        if (slotEl) {
          const slotIdxStr = slotEl.getAttribute("data-slot-index");
          if (slotIdxStr !== null) {
            const targetIdx = parseInt(slotIdxStr, 10);
            handleAssignPhotoToSlot(photoIndex, targetIdx);
          }
        }
      } else if (gestureState === "scrolling") {
        suppressNextClickRef.current = true;
      } else if (gestureState === "pending") {
        const elapsed = Date.now() - startTime;
        const dx = upEvent.clientX - startX;
        const dy = upEvent.clientY - startY;
        const gesture = classifyPointerGesture(dx, dy);
        if (gesture === "tap" && elapsed < 500) {
          suppressNextClickRef.current = true;
          if (selectedSlotIdx !== null) {
            handleAssignPhotoToSlot(photoIndex, selectedSlotIdx);
          } else {
            setSelectedPhotoIdx(prev => (prev === photoIndex ? null : photoIndex));
          }
        } else if (gesture === "scroll") {
          suppressNextClickRef.current = true;
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

  // Safe auto-continue at 00:00 expiry when ready
  useEffect(() => {
    if (isExpired && isReady && !hasAutoContinuedRef.current) {
      hasAutoContinuedRef.current = true;
      next();
    }
  }, [isExpired, isReady]);

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

      <div
        className="preview-timer-badge"
        style={{
          position: "absolute",
          right: "36px",
          top: "22px",
          zIndex: 25,
          background: isExpired ? "#c0392b" : isUrgent ? "#d35400" : "var(--purple)",
          borderRadius: "20px",
          padding: "7px 18px",
          fontSize: "20px",
          fontWeight: "bold",
          color: "#ffffff",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          boxShadow: isUrgent || isExpired ? "0 0 15px rgba(231, 76, 60, 0.6)" : "none",
          transition: "background-color 0.3s ease",
        }}
      >
        <span>⏱</span>
        <span>{formattedTimer}</span>
        {isExpired && <span style={{ fontSize: "12px", marginLeft: "4px" }}>WAKTU HABIS</span>}
      </div>

      <PreviewComposer
        frame={frame}
        photoSlotAssignments={assignments}
        capturedPhotos={captured}
        selectedBackgroundId={session?.selectedBackgroundId}
        onSlotClick={handleSlotClick}
        activeSlotIndex={selectedSlotIdx}
        dragOverSlotIndex={dragOverSlotIdx}
        stickers={session?.additionalStickers || []}
        onUpdateSticker={updateAdditionalSticker}
        onRemoveSticker={removeAdditionalSticker}
      />

      <StickerPicker
        stickers={stickersList}
        onAddSticker={(src) =>
          addAdditionalSticker({
            src,
            x: 600,
            y: 900,
            width: 300,
            height: 300,
            rotation: 0,
            zIndex: (session?.additionalStickers?.length || 0) + 1,
          })
        }
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
