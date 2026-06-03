"use client";

import { useEffect, useRef, useState } from "react";

type CountdownTimerProps = {
  initialSeconds: number;
  onComplete?: () => void;
  className?: string;
};

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function CountdownTimer({
  initialSeconds,
  onComplete,
  className,
}: CountdownTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const completedRef = useRef(false);

  useEffect(() => {
    completedRef.current = false;
    setSecondsLeft(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (secondsLeft <= 0) {
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete?.();
      }
      return;
    }

    const interval = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [onComplete, secondsLeft]);

  return <span className={className}>{formatTime(secondsLeft)}</span>;
}
