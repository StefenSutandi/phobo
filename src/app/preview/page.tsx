"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { KioskButton, KioskStage, PhotoResultStrip, PreviewComposer, StickerPicker } from "@/components/kiosk";
import { getFrameById, getBackgroundById } from "@/lib/phobo-data";
import { assignPhotoToSlot } from "@/lib/preview/slot-assignment";
import { classifyPointerGesture } from "@/lib/preview/gesture-arbitration";
import { useSessionStore } from "@/lib/session/session-store";
import { getPhotoDisplayUrl, getPhotoRawUrl } from "@/lib/session/session-types";
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
  
  // Selection / Interaction states for Tap Fallback
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState<number | null>(null);
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number | null>(null);

  // Pointer Drag & Drop states (IR Touch + Mouse)
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

  // Compute representative photo-slot aspect ratio for thumbnails and drag ghost
  const representativeSlot = frame.photoSlots[0];
  const slotRatio = representativeSlot ? representativeSlot.width / representativeSlot.height : 1.5;

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

  const suppressNextClickRef = useRef(false);

  // Pure replace assignment: assign photo P to slot S without modifying or swapping other slots
  const handleAssignPhotoToSlot = useCallback((photoIndex: number, targetSlotIndex: number) => {
    const nextAssignments = assignPhotoToSlot(assignments, photoIndex, targetSlotIndex);
    setPhotoSlotAssignments(nextAssignments);
    setSelectedPhotoIdx(null);
    setSelectedSlotIdx(null);
  }, [assignments, setPhotoSlotAssignments]);

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

        // Detect target slot element under pointer
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

  const ghostWidth = 110;
  const ghostHeight = Math.round(ghostWidth / slotRatio);

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
        aspectRatio={slotRatio}
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
