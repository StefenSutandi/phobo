"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getPackageById } from "@/lib/phobo-data";
import type { KioskSession, PaymentStatus, PrintStatus, GreenScreenTuning, StickerPlacement, CapturedPhoto } from "./session-types";

const KEY = "phobo.activeSession";
const tuning: GreenScreenTuning = { applyChromaKey: true, greenMin: 70, greenTolerance: 35, spillReduction: 30, edgeSoftness: 2 };
const now = () => new Date().toISOString();
function fresh(): KioskSession {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { sessionId: `session-${id}`, paymentStatus: "idle", capturedPhotos: [], selectedPhotoIndices: [], stickers: [], printStatus: "idle", greenScreenTuning: tuning, createdAt: now(), updatedAt: now(), addPrintPaymentStatus: "unpaid" };
}
function update(current: KioskSession | null, patch: Partial<KioskSession>) { return { ...(current ?? fresh()), ...patch, updatedAt: now() }; }
type Store = {
  session: KioskSession | null; hasHydrated: boolean; createNewSession: () => KioskSession; resetSession: () => void;
  selectPackage: (id: string) => void; setPaymentStatus: (s: PaymentStatus) => void; selectFrame: (id: string) => void;
  selectBackground: (id: string) => void; addCapturedPhoto: (photo: CapturedPhoto | string) => void; clearCapturedPhotos: () => void;
  selectPhotos: (indices: number[]) => void; selectSticker: (id: string) => void; clearFinalResult: () => void;
  addSticker: (sticker: Omit<StickerPlacement, "id">) => void;
  updateSticker: (id: string, sticker: Partial<StickerPlacement>) => void;
  removeSticker: (id: string) => void;
  clearStickers: () => void;
  setFinalImageUrl: (url: string) => void; setPrintImageUrl: (url: string) => void; setDriveUrl: (url: string) => void;
  setPrintStatus: (s: PrintStatus) => void; setGreenScreenTuning: (t: GreenScreenTuning) => void;
  setPaymentData: (data: { paymentOrderId?: string; paymentSnapToken?: string; paymentRedirectUrl?: string; paymentAmount?: number; paymentMode?: "midtrans" | "operator" | "mock"; payableAmount?: number; uniqueCode?: number }) => void;
  selectAdditionalFrame: (id: string) => void;
  setAdditionalSelectedPhotoIndices: (indices: number[]) => void;
  setAddPrintPaymentStatus: (s: "unpaid" | "pending" | "paid" | "failed") => void;
  setAddPrintPaymentData: (data: { addPrintPaymentOrderId?: string; addPrintPaymentRedirectUrl?: string; addPrintPayableAmount?: number; addPrintUniqueCode?: number }) => void;
  setAdditionalPrintImageUrl: (url: string) => void;
};
const Context = createContext<Store | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<KioskSession | null>(null); const [hasHydrated, setHydrated] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (saved) try {
      const parsed = JSON.parse(saved) as any;
      const normalizedPhotos: CapturedPhoto[] = Array.isArray(parsed.capturedPhotos)
        ? parsed.capturedPhotos.map((p: any) => typeof p === 'string' ? { raw: p, display: p } : { raw: p?.raw || "", display: p?.display || p?.raw || "" }).filter((p: CapturedPhoto) => p.raw || p.display)
        : [];
      setSession({ ...parsed, capturedPhotos: normalizedPhotos, selectedPhotoIndices: parsed.selectedPhotoIndices ?? [] });
    } catch {
      localStorage.removeItem(KEY);
    }
    setHydrated(true);
  }, []);
  useEffect(() => { if (!hasHydrated) return; if (session) localStorage.setItem(KEY, JSON.stringify(session)); else localStorage.removeItem(KEY); }, [hasHydrated, session]);
  const createNewSession = useCallback(() => { const s = fresh(); setSession(s); return s; }, []);
  const resetSession = useCallback(() => setSession(null), []);
  const selectPackage = useCallback((id: string) => { const p = getPackageById(id); if (!p) return; const s = fresh(); setSession({ ...s, selectedPackageId: id, packageId: id, packageName: p.name, frameCount: p.frameCount, printCount: p.printCount, maxShots: p.maxShots, durationMinutes: p.durationMinutes, price: p.price, paymentStatus: "pending" }); }, []);
  const patch = useCallback((value: Partial<KioskSession>) => setSession(s => update(s, value)), []);
  const setPaymentStatus = useCallback((paymentStatus: PaymentStatus) => patch({ paymentStatus }), [patch]);
  const setPaymentData = useCallback((data: { paymentOrderId?: string; paymentSnapToken?: string; paymentRedirectUrl?: string; paymentAmount?: number }) => patch(data), [patch]);
  const selectFrame = useCallback((selectedFrameId: string) => patch({ selectedFrameId, finalImageUrl: undefined, printImageUrl: undefined }), [patch]);
  const selectBackground = useCallback((selectedBackgroundId: string) => patch({ selectedBackgroundId, finalImageUrl: undefined, printImageUrl: undefined }), [patch]);
  const addCapturedPhoto = useCallback((photo: CapturedPhoto | string) => setSession(s => {
    const active = s ?? fresh();
    const photoObj: CapturedPhoto = typeof photo === 'string' ? { raw: photo, display: photo } : { raw: photo.raw || photo.display, display: photo.display || photo.raw };
    return active.capturedPhotos.length >= (active.maxShots ?? 8) ? active : update(active, { capturedPhotos: [...active.capturedPhotos, photoObj], finalImageUrl: undefined, printImageUrl: undefined });
  }), []);
  const clearCapturedPhotos = useCallback(() => patch({ capturedPhotos: [], selectedPhotoIndices: [], finalImageUrl: undefined, printImageUrl: undefined }), [patch]);
  const selectPhotos = useCallback((selectedPhotoIndices: number[]) => patch({ selectedPhotoIndices, finalImageUrl: undefined, printImageUrl: undefined }), [patch]);
  const selectSticker = useCallback((selectedStickerId: string) => patch({ selectedStickerId, finalImageUrl: undefined, printImageUrl: undefined }), [patch]);
  const clearFinalResult = useCallback(() => patch({ finalImageUrl: undefined, printImageUrl: undefined, printStatus: "idle" }), [patch]);
  const addSticker = useCallback((sticker: Omit<StickerPlacement, "id">) => setSession(s => { const active = s ?? fresh(); return update(active, { stickers: [...active.stickers, { ...sticker, id: `sticker-${Date.now()}-${Math.random().toString(36).slice(2)}` }] }); }), []);
  const updateSticker = useCallback((id: string, stickerPatch: Partial<StickerPlacement>) => setSession(s => { const active = s ?? fresh(); return update(active, { stickers: active.stickers.map(st => st.id === id ? { ...st, ...stickerPatch } : st) }); }), []);
  const removeSticker = useCallback((id: string) => setSession(s => { const active = s ?? fresh(); return update(active, { stickers: active.stickers.filter(st => st.id !== id) }); }), []);
  const clearStickers = useCallback(() => patch({ stickers: [] }), [patch]);
  const setFinalImageUrl = useCallback((finalImageUrl: string) => patch({ finalImageUrl }), [patch]);
  const setPrintImageUrl = useCallback((printImageUrl: string) => patch({ printImageUrl }), [patch]);
  const setDriveUrl = useCallback((driveUrl: string) => patch({ driveUrl }), [patch]);
  const setPrintStatus = useCallback((printStatus: PrintStatus) => patch({ printStatus }), [patch]);
  const setGreenScreenTuning = useCallback((greenScreenTuning: GreenScreenTuning) => patch({ greenScreenTuning }), [patch]);
  
  const selectAdditionalFrame = useCallback((additionalFrameId: string) => patch({ additionalFrameId, additionalPrintImageUrl: undefined, addPrintPaymentOrderId: undefined, addPrintPaymentRedirectUrl: undefined, additionalSelectedPhotoIndices: undefined }), [patch]);
  const setAdditionalSelectedPhotoIndices = useCallback((additionalSelectedPhotoIndices: number[]) => patch({ additionalSelectedPhotoIndices }), [patch]);
  const setAddPrintPaymentStatus = useCallback((addPrintPaymentStatus: "unpaid" | "pending" | "paid" | "failed") => patch({ addPrintPaymentStatus }), [patch]);
  const setAddPrintPaymentData = useCallback((data: { addPrintPaymentOrderId?: string; addPrintPaymentRedirectUrl?: string }) => patch(data), [patch]);
  const setAdditionalPrintImageUrl = useCallback((additionalPrintImageUrl: string) => patch({ additionalPrintImageUrl }), [patch]);

  const value = useMemo(() => ({ session, hasHydrated, createNewSession, resetSession, selectPackage, setPaymentStatus, selectFrame, selectBackground, addCapturedPhoto, clearCapturedPhotos, selectPhotos, selectSticker, clearFinalResult, addSticker, updateSticker, removeSticker, clearStickers, setFinalImageUrl, setPrintImageUrl, setDriveUrl, setPrintStatus, setGreenScreenTuning, setPaymentData, selectAdditionalFrame, setAdditionalSelectedPhotoIndices, setAddPrintPaymentStatus, setAddPrintPaymentData, setAdditionalPrintImageUrl }), [session, hasHydrated, createNewSession, resetSession, selectPackage, setPaymentStatus, setPaymentData, selectFrame, selectBackground, addCapturedPhoto, clearCapturedPhotos, selectPhotos, selectSticker, clearFinalResult, addSticker, updateSticker, removeSticker, clearStickers, setFinalImageUrl, setPrintImageUrl, setDriveUrl, setPrintStatus, setGreenScreenTuning, selectAdditionalFrame, setAdditionalSelectedPhotoIndices, setAddPrintPaymentStatus, setAddPrintPaymentData, setAdditionalPrintImageUrl]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSessionStore() { const value = useContext(Context); if (!value) throw new Error("useSessionStore must be used within SessionProvider"); return value; }
