"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getPackageById } from "@/lib/phobo-data";
import type { KioskSession, PaymentStatus, PrintStatus, GreenScreenTuning } from "./session-types";

const KEY = "phobo.activeSession";
const tuning: GreenScreenTuning = { applyChromaKey: true, greenMin: 90, greenTolerance: 35, spillReduction: 0, edgeSoftness: 0 };
const now = () => new Date().toISOString();
function fresh(): KioskSession {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { sessionId: `session-${id}`, paymentStatus: "idle", capturedPhotos: [], selectedPhotoIndices: [], printStatus: "idle", greenScreenTuning: tuning, createdAt: now(), updatedAt: now() };
}
function update(current: KioskSession | null, patch: Partial<KioskSession>) { return { ...(current ?? fresh()), ...patch, updatedAt: now() }; }
type Store = {
  session: KioskSession | null; hasHydrated: boolean; createNewSession: () => KioskSession; resetSession: () => void;
  selectPackage: (id: string) => void; setPaymentStatus: (s: PaymentStatus) => void; selectFrame: (id: string) => void;
  selectBackground: (id: string) => void; addCapturedPhoto: (url: string) => void; clearCapturedPhotos: () => void;
  selectPhotos: (indices: number[]) => void; selectSticker: (id: string) => void; clearFinalResult: () => void;
  setFinalImageUrl: (url: string) => void; setPrintImageUrl: (url: string) => void; setDriveUrl: (url: string) => void;
  setPrintStatus: (s: PrintStatus) => void; setGreenScreenTuning: (t: GreenScreenTuning) => void;
};
const Context = createContext<Store | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<KioskSession | null>(null); const [hasHydrated, setHydrated] = useState(false);
  useEffect(() => { const saved = localStorage.getItem(KEY); if (saved) try { const parsed = JSON.parse(saved) as KioskSession; setSession({ ...parsed, selectedPhotoIndices: parsed.selectedPhotoIndices ?? [] }); } catch { localStorage.removeItem(KEY); } setHydrated(true); }, []);
  useEffect(() => { if (!hasHydrated) return; if (session) localStorage.setItem(KEY, JSON.stringify(session)); else localStorage.removeItem(KEY); }, [hasHydrated, session]);
  const createNewSession = useCallback(() => { const s = fresh(); setSession(s); return s; }, []);
  const resetSession = useCallback(() => setSession(null), []);
  const selectPackage = useCallback((id: string) => { const p = getPackageById(id); if (!p) return; const s = fresh(); setSession({ ...s, selectedPackageId: id, packageId: id, packageName: p.name, frameCount: p.frameCount, printCount: p.printCount, maxShots: p.maxShots, durationMinutes: p.durationMinutes, price: p.price, paymentStatus: "pending" }); }, []);
  const patch = useCallback((value: Partial<KioskSession>) => setSession(s => update(s, value)), []);
  const setPaymentStatus = useCallback((paymentStatus: PaymentStatus) => patch({ paymentStatus }), [patch]);
  const selectFrame = useCallback((selectedFrameId: string) => patch({ selectedFrameId, finalImageUrl: undefined, printImageUrl: undefined }), [patch]);
  const selectBackground = useCallback((selectedBackgroundId: string) => patch({ selectedBackgroundId, finalImageUrl: undefined, printImageUrl: undefined }), [patch]);
  const addCapturedPhoto = useCallback((url: string) => setSession(s => { const active = s ?? fresh(); return active.capturedPhotos.length >= (active.maxShots ?? 8) ? active : update(active, { capturedPhotos: [...active.capturedPhotos, url], finalImageUrl: undefined, printImageUrl: undefined }); }), []);
  const clearCapturedPhotos = useCallback(() => patch({ capturedPhotos: [], selectedPhotoIndices: [], finalImageUrl: undefined, printImageUrl: undefined }), [patch]);
  const selectPhotos = useCallback((selectedPhotoIndices: number[]) => patch({ selectedPhotoIndices, finalImageUrl: undefined, printImageUrl: undefined }), [patch]);
  const selectSticker = useCallback((selectedStickerId: string) => patch({ selectedStickerId, finalImageUrl: undefined, printImageUrl: undefined }), [patch]);
  const clearFinalResult = useCallback(() => patch({ finalImageUrl: undefined, printImageUrl: undefined, printStatus: "idle" }), [patch]);
  const setFinalImageUrl = useCallback((finalImageUrl: string) => patch({ finalImageUrl }), [patch]);
  const setPrintImageUrl = useCallback((printImageUrl: string) => patch({ printImageUrl }), [patch]);
  const setDriveUrl = useCallback((driveUrl: string) => patch({ driveUrl }), [patch]);
  const setPrintStatus = useCallback((printStatus: PrintStatus) => patch({ printStatus }), [patch]);
  const setGreenScreenTuning = useCallback((greenScreenTuning: GreenScreenTuning) => patch({ greenScreenTuning }), [patch]);
  const value = useMemo(() => ({ session, hasHydrated, createNewSession, resetSession, selectPackage, setPaymentStatus, selectFrame, selectBackground, addCapturedPhoto, clearCapturedPhotos, selectPhotos, selectSticker, clearFinalResult, setFinalImageUrl, setPrintImageUrl, setDriveUrl, setPrintStatus, setGreenScreenTuning }), [session, hasHydrated, createNewSession, resetSession, selectPackage, setPaymentStatus, selectFrame, selectBackground, addCapturedPhoto, clearCapturedPhotos, selectPhotos, selectSticker, clearFinalResult, setFinalImageUrl, setPrintImageUrl, setDriveUrl, setPrintStatus, setGreenScreenTuning]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSessionStore() { const value = useContext(Context); if (!value) throw new Error("useSessionStore must be used within SessionProvider"); return value; }
