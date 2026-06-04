"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { KioskSession, PaymentStatus, PrintStatus } from "./session-types";

const SESSION_STORAGE_KEY = "phobo.activeSession";

type SessionContextValue = {
  session: KioskSession | null;
  hasHydrated: boolean;
  createNewSession: () => KioskSession;
  resetSession: () => void;
  selectPackage: (packageId: string) => void;
  setPaymentStatus: (status: PaymentStatus) => void;
  selectFrame: (frameId: string) => void;
  selectBackground: (backgroundId: string) => void;
  addCapturedPhoto: (photoUrl: string) => void;
  clearCapturedPhotos: () => void;
  setFinalImageUrl: (url: string) => void;
  setDriveUrl: (url: string) => void;
  setPrintStatus: (status: PrintStatus) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function nowIso() {
  return new Date().toISOString();
}

function createSession(): KioskSession {
  const timestamp = nowIso();
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    sessionId: `session-${randomId}`,
    paymentStatus: "idle",
    capturedPhotos: [],
    printStatus: "idle",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function updateSession(
  current: KioskSession | null,
  updater: (session: KioskSession) => KioskSession,
) {
  const baseSession = current ?? createSession();
  return updater({ ...baseSession, updatedAt: nowIso() });
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<KioskSession | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    const savedSession = window.localStorage.getItem(SESSION_STORAGE_KEY);

    if (savedSession) {
      try {
        setSession(JSON.parse(savedSession) as KioskSession);
      } catch {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }

    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (!session) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }, [hasHydrated, session]);

  const createNewSession = useCallback(() => {
    const nextSession = createSession();
    setSession(nextSession);
    return nextSession;
  }, []);

  const resetSession = useCallback(() => {
    setSession(null);
  }, []);

  const selectPackage = useCallback((packageId: string) => {
    setSession((current) =>
      updateSession(current, (activeSession) => ({
        ...activeSession,
        selectedPackageId: packageId,
        paymentStatus: "pending",
        selectedFrameId: undefined,
        selectedBackgroundId: undefined,
        capturedPhotos: [],
        finalImageUrl: undefined,
        driveUrl: undefined,
        printStatus: "idle",
      })),
    );
  }, []);

  const setPaymentStatus = useCallback((status: PaymentStatus) => {
    setSession((current) =>
      updateSession(current, (activeSession) => ({
        ...activeSession,
        paymentStatus: status,
      })),
    );
  }, []);

  const selectFrame = useCallback((frameId: string) => {
    setSession((current) =>
      updateSession(current, (activeSession) => ({
        ...activeSession,
        selectedFrameId: frameId,
      })),
    );
  }, []);

  const selectBackground = useCallback((backgroundId: string) => {
    setSession((current) =>
      updateSession(current, (activeSession) => ({
        ...activeSession,
        selectedBackgroundId: backgroundId,
      })),
    );
  }, []);

  const addCapturedPhoto = useCallback((photoUrl: string) => {
    setSession((current) =>
      updateSession(current, (activeSession) => ({
        ...activeSession,
        capturedPhotos: [...activeSession.capturedPhotos, photoUrl],
      })),
    );
  }, []);

  const clearCapturedPhotos = useCallback(() => {
    setSession((current) =>
      updateSession(current, (activeSession) => ({
        ...activeSession,
        capturedPhotos: [],
        finalImageUrl: undefined,
      })),
    );
  }, []);

  const setFinalImageUrl = useCallback((url: string) => {
    setSession((current) =>
      updateSession(current, (activeSession) => ({
        ...activeSession,
        finalImageUrl: url,
      })),
    );
  }, []);

  const setDriveUrl = useCallback((url: string) => {
    setSession((current) =>
      updateSession(current, (activeSession) => ({
        ...activeSession,
        driveUrl: url,
      })),
    );
  }, []);

  const setPrintStatus = useCallback((status: PrintStatus) => {
    setSession((current) =>
      updateSession(current, (activeSession) => ({
        ...activeSession,
        printStatus: status,
      })),
    );
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
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
      setFinalImageUrl,
      setDriveUrl,
      setPrintStatus,
    }),
    [
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
      setFinalImageUrl,
      setDriveUrl,
      setPrintStatus,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionStore() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error("useSessionStore must be used within SessionProvider");
  }

  return context;
}
