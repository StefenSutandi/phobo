"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getPackageById } from "@/lib/phobo-data";
import type { KioskSession, PaymentStatus, PrintStatus, GreenScreenTuning, StickerPlacement, CapturedPhoto } from "./session-types";

const KEY = "phobo.activeSession";
const tuning: GreenScreenTuning = { applyChromaKey: true, greenMin: 70, greenTolerance: 35, spillReduction: 30, edgeSoftness: 2 };
const now = () => new Date().toISOString();
function fresh(): KioskSession {
  let id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      id = crypto.randomUUID();
    }
  } catch {
    // Insecure HTTP LAN fallback
  }
  return {
    sessionId: `session-${id}`,
    paymentStatus: "idle",
    capturedPhotos: [],
    selectedPhotoIndices: [],
    stickers: [],
    additionalStickers: [],
    printStatus: "idle",
    printCommitted: false,
    additionalPrintStatus: "idle",
    additionalPrintCommitted: false,
    greenScreenTuning: tuning,
    createdAt: now(),
    updatedAt: now(),
    addPrintPaymentStatus: "unpaid",
  };
}
function update(current: KioskSession | null, patch: Partial<KioskSession>) { return { ...(current ?? fresh()), ...patch, updatedAt: now() }; }
type Store = {
  session: KioskSession | null; hasHydrated: boolean; createNewSession: () => KioskSession; resetSession: () => void;
  selectPackage: (id: string) => void; setPaymentStatus: (s: PaymentStatus) => void; selectFrame: (id: string) => void;
  selectBackground: (id: string) => void; addCapturedPhoto: (photo: CapturedPhoto | string) => void; clearCapturedPhotos: () => void;
  selectPhotos: (indices: number[]) => void; setPhotoSlotAssignments: (assignments: (number | null)[]) => void; selectSticker: (id: string) => void; clearFinalResult: () => void;
  addSticker: (sticker: Omit<StickerPlacement, "id">) => void;
  updateSticker: (id: string, sticker: Partial<StickerPlacement>) => void;
  removeSticker: (id: string) => void;
  clearStickers: () => void;
  addAdditionalSticker: (sticker: Omit<StickerPlacement, "id">) => void;
  updateAdditionalSticker: (id: string, sticker: Partial<StickerPlacement>) => void;
  removeAdditionalSticker: (id: string) => void;
  clearAdditionalStickers: () => void;
  setFinalImageUrl: (url: string) => void; setPrintImageUrl: (url: string) => void; setDriveUrl: (url: string) => void;
  setPrintStatus: (s: PrintStatus) => void; setPrintCommitted: (committed: boolean) => void;
  setGreenScreenTuning: (t: GreenScreenTuning) => void;
  setPaymentData: (data: { paymentOrderId?: string; paymentSnapToken?: string; paymentRedirectUrl?: string; paymentAmount?: number; paymentMode?: "midtrans" | "operator" | "mock"; payableAmount?: number; uniqueCode?: number }) => void;
  selectAdditionalFrame: (id: string) => void;
  setAdditionalSelectedPhotoIndices: (indices: number[]) => void;
  setAdditionalPhotoSlotAssignments: (assignments: (number | null)[]) => void;
  setAddPrintPaymentStatus: (s: "unpaid" | "pending" | "paid" | "failed") => void;
  setAddPrintPaymentData: (data: { addPrintPaymentOrderId?: string; addPrintPaymentRedirectUrl?: string; addPrintPayableAmount?: number; addPrintUniqueCode?: number }) => void;
  setAdditionalPrintImageUrl: (url: string) => void;
  setAdditionalPrintStatus: (s: "idle" | "composing" | "queued" | "printed" | "failed") => void;
  setAdditionalPrintCommitted: (committed: boolean) => void;
  initCameraTimer: (durationMinutes?: number) => void;
  initPreviewTimer: (durationSeconds?: number) => void;
  initAdditionalPreviewTimer: (durationSeconds?: number) => void;
};
const Context = createContext<Store | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<KioskSession | null>(null); const [hasHydrated, setHydrated] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (saved) try {
      const parsed = JSON.parse(saved) as any;
      const defaultBg = parsed.selectedBackgroundId || "background-01";
      const normalizedPhotos: CapturedPhoto[] = Array.isArray(parsed.capturedPhotos)
        ? parsed.capturedPhotos.map((p: any) => typeof p === 'string' 
            ? { raw: p, display: p, backgroundId: defaultBg } 
            : { raw: p?.raw || "", display: p?.display || p?.raw || "", backgroundId: p?.backgroundId || defaultBg }
          ).filter((p: CapturedPhoto) => p.raw || p.display)
        : [];
      
      const photoSlotAssignments = parsed.photoSlotAssignments ?? (Array.isArray(parsed.selectedPhotoIndices) ? parsed.selectedPhotoIndices : undefined);
      const additionalPhotoSlotAssignments = parsed.additionalPhotoSlotAssignments ?? (Array.isArray(parsed.additionalSelectedPhotoIndices) ? parsed.additionalSelectedPhotoIndices : undefined);
      
      setSession({
        ...parsed,
        capturedPhotos: normalizedPhotos,
        selectedPhotoIndices: parsed.selectedPhotoIndices ?? [],
        photoSlotAssignments,
        additionalPhotoSlotAssignments,
        stickers: Array.isArray(parsed.stickers) ? parsed.stickers : [],
        additionalStickers: Array.isArray(parsed.additionalStickers) ? parsed.additionalStickers : [],
      });
    } catch {
      localStorage.removeItem(KEY);
    }
    setHydrated(true);
  }, []);
  useEffect(() => { if (!hasHydrated) return; if (session) localStorage.setItem(KEY, JSON.stringify(session)); else localStorage.removeItem(KEY); }, [hasHydrated, session]);
  const createNewSession = useCallback(() => { const s = fresh(); setSession(s); return s; }, []);
  const resetSession = useCallback(() => setSession(null), []);
  const selectPackage = useCallback((id: string) => {
    const p = getPackageById(id);
    if (!p) return;
    const s = fresh();
    setSession({
      ...s,
      selectedPackageId: id,
      packageId: id,
      packageName: p.name,
      requiredFrameCount: p.requiredFrameCount,
      requiredShotCount: p.requiredShotCount,
      includedPrintCount: p.includedPrintCount,
      frameCount: p.requiredFrameCount,
      printCount: p.includedPrintCount,
      maxShots: p.requiredShotCount,
      durationMinutes: p.durationMinutes,
      price: p.price,
      paymentStatus: "pending",
    });
  }, []);
  const patch = useCallback((value: Partial<KioskSession>) => setSession(s => update(s, value)), []);
  const setPaymentStatus = useCallback((paymentStatus: PaymentStatus) => patch({ paymentStatus }), [patch]);
  const setPaymentData = useCallback((data: { paymentOrderId?: string; paymentSnapToken?: string; paymentRedirectUrl?: string; paymentAmount?: number }) => patch(data), [patch]);
  const selectFrame = useCallback((selectedFrameId: string) => patch({ selectedFrameId, finalImageUrl: undefined, printImageUrl: undefined, driveUrl: undefined, photoSlotAssignments: undefined }), [patch]);
  const selectBackground = useCallback((selectedBackgroundId: string) => patch({ selectedBackgroundId, finalImageUrl: undefined, printImageUrl: undefined, driveUrl: undefined }), [patch]);
  const addCapturedPhoto = useCallback((photo: CapturedPhoto | string) => setSession(s => {
    const active = s ?? fresh();
    const activeBg = active.selectedBackgroundId || "background-01";
    const photoObj: CapturedPhoto = typeof photo === 'string' 
      ? { raw: photo, display: photo, backgroundId: activeBg } 
      : { raw: photo.raw || photo.display, display: photo.display || photo.raw, backgroundId: photo.backgroundId || activeBg };
    const maxShots = active.requiredShotCount ?? active.maxShots ?? 8;
    return active.capturedPhotos.length >= maxShots ? active : update(active, { capturedPhotos: [...active.capturedPhotos, photoObj], finalImageUrl: undefined, printImageUrl: undefined, driveUrl: undefined });
  }), []);
  const clearCapturedPhotos = useCallback(() => patch({ capturedPhotos: [], selectedPhotoIndices: [], photoSlotAssignments: undefined, finalImageUrl: undefined, printImageUrl: undefined, driveUrl: undefined }), [patch]);
  const selectPhotos = useCallback((selectedPhotoIndices: number[]) => patch({ selectedPhotoIndices, finalImageUrl: undefined, printImageUrl: undefined, driveUrl: undefined }), [patch]);
  const setPhotoSlotAssignments = useCallback((photoSlotAssignments: (number | null)[]) => patch({ photoSlotAssignments, selectedPhotoIndices: photoSlotAssignments.filter((x): x is number => x !== null && x !== undefined), finalImageUrl: undefined, printImageUrl: undefined, driveUrl: undefined }), [patch]);
  const selectSticker = useCallback((selectedStickerId: string) => patch({ selectedStickerId, finalImageUrl: undefined, printImageUrl: undefined, driveUrl: undefined }), [patch]);
  const clearFinalResult = useCallback(() => patch({ finalImageUrl: undefined, printImageUrl: undefined, driveUrl: undefined, printStatus: "idle", printCommitted: false, printAttemptedAt: undefined }), [patch]);
  const addSticker = useCallback((sticker: Omit<StickerPlacement, "id">) => setSession(s => { const active = s ?? fresh(); return update(active, { stickers: [...active.stickers, { ...sticker, id: `sticker-${Date.now()}-${Math.random().toString(36).slice(2)}` }] }); }), []);
  const updateSticker = useCallback((id: string, stickerPatch: Partial<StickerPlacement>) => setSession(s => { const active = s ?? fresh(); return update(active, { stickers: active.stickers.map(st => st.id === id ? { ...st, ...stickerPatch } : st) }); }), []);
  const removeSticker = useCallback((id: string) => setSession(s => { const active = s ?? fresh(); return update(active, { stickers: active.stickers.filter(st => st.id !== id) }); }), []);
  const clearStickers = useCallback(() => patch({ stickers: [] }), [patch]);
  
  const addAdditionalSticker = useCallback((sticker: Omit<StickerPlacement, "id">) => setSession(s => { const active = s ?? fresh(); const existing = active.additionalStickers || []; return update(active, { additionalStickers: [...existing, { ...sticker, id: `asticker-${Date.now()}-${Math.random().toString(36).slice(2)}` }] }); }), []);
  const updateAdditionalSticker = useCallback((id: string, stickerPatch: Partial<StickerPlacement>) => setSession(s => { const active = s ?? fresh(); const existing = active.additionalStickers || []; return update(active, { additionalStickers: existing.map(st => st.id === id ? { ...st, ...stickerPatch } : st) }); }), []);
  const removeAdditionalSticker = useCallback((id: string) => setSession(s => { const active = s ?? fresh(); const existing = active.additionalStickers || []; return update(active, { additionalStickers: existing.filter(st => st.id !== id) }); }), []);
  const clearAdditionalStickers = useCallback(() => patch({ additionalStickers: [] }), [patch]);

  const setFinalImageUrl = useCallback((finalImageUrl: string) => patch({ finalImageUrl }), [patch]);
  const setPrintImageUrl = useCallback((printImageUrl: string) => patch({ printImageUrl }), [patch]);
  const setDriveUrl = useCallback((driveUrl: string) => patch({ driveUrl }), [patch]);
  const setPrintStatus = useCallback((printStatus: PrintStatus) => patch({ printStatus }), [patch]);
  const setPrintCommitted = useCallback((printCommitted: boolean) => patch({ printCommitted, printAttemptedAt: printCommitted ? now() : undefined }), [patch]);
  const setGreenScreenTuning = useCallback((greenScreenTuning: GreenScreenTuning) => patch({ greenScreenTuning }), [patch]);
  
  const selectAdditionalFrame = useCallback((additionalFrameId: string) => patch({
    additionalFrameId,
    additionalPrintImageUrl: undefined,
    addPrintPaymentOrderId: undefined,
    addPrintPaymentRedirectUrl: undefined,
    additionalSelectedPhotoIndices: undefined,
    additionalPhotoSlotAssignments: undefined,
    additionalStickers: [],
    additionalPrintStatus: "idle",
    additionalPrintCommitted: false,
    additionalPreviewStartedAt: undefined,
    additionalPreviewDeadlineAt: undefined,
  }), [patch]);
  const setAdditionalSelectedPhotoIndices = useCallback((additionalSelectedPhotoIndices: number[]) => patch({ additionalSelectedPhotoIndices }), [patch]);
  const setAdditionalPhotoSlotAssignments = useCallback((additionalPhotoSlotAssignments: (number | null)[]) => patch({ additionalPhotoSlotAssignments, additionalSelectedPhotoIndices: additionalPhotoSlotAssignments.filter((x): x is number => x !== null && x !== undefined) }), [patch]);
  const setAddPrintPaymentStatus = useCallback((addPrintPaymentStatus: "unpaid" | "pending" | "paid" | "failed") => patch({ addPrintPaymentStatus }), [patch]);
  const setAddPrintPaymentData = useCallback((data: { addPrintPaymentOrderId?: string; addPrintPaymentRedirectUrl?: string }) => patch(data), [patch]);
  const setAdditionalPrintImageUrl = useCallback((additionalPrintImageUrl: string) => patch({ additionalPrintImageUrl }), [patch]);
  const setAdditionalPrintStatus = useCallback((additionalPrintStatus: "idle" | "composing" | "queued" | "printed" | "failed") => patch({ additionalPrintStatus }), [patch]);
  const setAdditionalPrintCommitted = useCallback((additionalPrintCommitted: boolean) => patch({ additionalPrintCommitted }), [patch]);

  const initCameraTimer = useCallback((durationMinutes?: number) => {
    setSession(s => {
      const active = s ?? fresh();
      if (active.cameraDeadlineAt) return active;
      const dur = durationMinutes ?? active.durationMinutes ?? 5;
      const startTime = new Date();
      const deadline = new Date(startTime.getTime() + dur * 60 * 1000);
      return update(active, {
        cameraStartedAt: startTime.toISOString(),
        cameraDeadlineAt: deadline.toISOString(),
      });
    });
  }, []);

  const initPreviewTimer = useCallback((durationSeconds: number = 120) => {
    setSession(s => {
      const active = s ?? fresh();
      if (active.previewDeadlineAt) return active;
      const startTime = new Date();
      const deadline = new Date(startTime.getTime() + durationSeconds * 1000);
      return update(active, {
        previewStartedAt: startTime.toISOString(),
        previewDeadlineAt: deadline.toISOString(),
      });
    });
  }, []);

  const initAdditionalPreviewTimer = useCallback((durationSeconds: number = 120) => {
    setSession(s => {
      const active = s ?? fresh();
      if (active.additionalPreviewDeadlineAt) return active;
      const startTime = new Date();
      const deadline = new Date(startTime.getTime() + durationSeconds * 1000);
      return update(active, {
        additionalPreviewStartedAt: startTime.toISOString(),
        additionalPreviewDeadlineAt: deadline.toISOString(),
      });
    });
  }, []);

  const value = useMemo(() => ({
    session,
    hasHydrated,
    createNewSession,
    resetSession,
    selectPackage,
    setPaymentStatus,
    selectFrame,
    selectBackground,
    addCapturedPhoto,
    clearCapturedPhotos,
    selectPhotos,
    setPhotoSlotAssignments,
    selectSticker,
    clearFinalResult,
    addSticker,
    updateSticker,
    removeSticker,
    clearStickers,
    addAdditionalSticker,
    updateAdditionalSticker,
    removeAdditionalSticker,
    clearAdditionalStickers,
    setFinalImageUrl,
    setPrintImageUrl,
    setDriveUrl,
    setPrintStatus,
    setPrintCommitted,
    setGreenScreenTuning,
    setPaymentData,
    selectAdditionalFrame,
    setAdditionalSelectedPhotoIndices,
    setAdditionalPhotoSlotAssignments,
    setAddPrintPaymentStatus,
    setAddPrintPaymentData,
    setAdditionalPrintImageUrl,
    setAdditionalPrintStatus,
    setAdditionalPrintCommitted,
    initCameraTimer,
    initPreviewTimer,
    initAdditionalPreviewTimer,
  }), [session, hasHydrated, createNewSession, resetSession, selectPackage, setPaymentStatus, setPaymentData, selectFrame, selectBackground, addCapturedPhoto, clearCapturedPhotos, selectPhotos, setPhotoSlotAssignments, selectSticker, clearFinalResult, addSticker, updateSticker, removeSticker, clearStickers, addAdditionalSticker, updateAdditionalSticker, removeAdditionalSticker, clearAdditionalStickers, setFinalImageUrl, setPrintImageUrl, setDriveUrl, setPrintStatus, setPrintCommitted, setGreenScreenTuning, selectAdditionalFrame, setAdditionalSelectedPhotoIndices, setAdditionalPhotoSlotAssignments, setAddPrintPaymentStatus, setAddPrintPaymentData, setAdditionalPrintImageUrl, setAdditionalPrintStatus, setAdditionalPrintCommitted, initCameraTimer, initPreviewTimer, initAdditionalPreviewTimer]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSessionStore() { const value = useContext(Context); if (!value) throw new Error("useSessionStore must be used within SessionProvider"); return value; }
