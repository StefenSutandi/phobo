"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/lib/session/session-store";

export type SessionTimerHudProps = {
  isCriticalOperation?: boolean;
  onExpire?: () => void;
  className?: string;
  style?: React.CSSProperties;
  compact?: boolean;
};

export function SessionTimerHud({
  isCriticalOperation = false,
  onExpire,
  className,
  style,
  compact = false,
}: SessionTimerHudProps) {
  const router = useRouter();
  const { session, hasHydrated } = useSessionStore();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const expiredHandledRef = useRef(false);

  useEffect(() => {
    if (!hasHydrated || !session?.sessionDeadlineAt) {
      return;
    }

    const calculateRemaining = () => {
      const deadline = new Date(session.sessionDeadlineAt!).getTime();
      const now = Date.now();
      return Math.max(0, Math.floor((deadline - now) / 1000));
    };

    const initial = calculateRemaining();
    setSecondsLeft(initial);

    const interval = window.setInterval(() => {
      const remaining = calculateRemaining();
      setSecondsLeft(remaining);
    }, 500);

    return () => window.clearInterval(interval);
  }, [hasHydrated, session?.sessionDeadlineAt]);

  useEffect(() => {
    if (secondsLeft !== null && secondsLeft <= 0 && !isCriticalOperation && !expiredHandledRef.current) {
      expiredHandledRef.current = true;
      if (onExpire) {
        onExpire();
      } else {
        router.replace("/closing");
      }
    }
  }, [secondsLeft, isCriticalOperation, onExpire, router]);

  if (!hasHydrated || !session?.sessionDeadlineAt) {
    return null;
  }

  const remaining = secondsLeft ?? 480;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeFormatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const isUrgent = remaining <= 60 && remaining > 0;
  const isExpired = remaining <= 0;

  return (
    <div
      className={`session-timer-hud ${className || ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? "6px" : "8px",
        background: isExpired ? "#c0392b" : isUrgent ? "#d35400" : "var(--purple, #5E3BEE)",
        color: "#ffffff",
        padding: compact ? "6px 14px" : "8px 18px",
        borderRadius: "20px",
        fontWeight: "bold",
        fontSize: compact ? "16px" : "20px",
        lineHeight: 1,
        boxShadow: isUrgent || isExpired ? "0 0 15px rgba(231, 76, 60, 0.6)" : "0 4px 12px rgba(0,0,0,0.2)",
        transition: "background-color 0.3s ease",
        zIndex: 95,
        userSelect: "none",
        ...style,
      }}
    >
      <span style={{ fontSize: compact ? "16px" : "18px" }}>⏱</span>
      <span>SESSION {timeFormatted}</span>
      {isExpired && <span style={{ fontSize: "11px", opacity: 0.9, marginLeft: "4px" }}>HABIS</span>}
    </div>
  );
}
