"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FrameGridScroller,
  KioskButton,
  KioskStage,
  RoundedPanel,
} from "@/components/kiosk";
import { frames } from "@/lib/phobo-data";
import { useSessionStore } from "@/lib/session/session-store";

export default function Frames() {
  const router = useRouter();
  const { session, hasHydrated, selectFrame } = useSessionStore();
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (session?.paymentStatus !== "confirmed") {
      router.replace("/payment");
    }
  }, [hasHydrated, router, session?.paymentStatus]);

  function goNext() {
    if (!session?.selectedFrameId) {
      setMessage("PILIH FRAME DULU");
      return;
    }

    router.push("/camera");
  }

  return (
    <KioskStage>
      <h1 className="frames-title">FRAME</h1>
      <RoundedPanel className="frame-panel" />
      <FrameGridScroller
        frames={frames.map((frame) => frame.id)}
        selectedFrameId={session?.selectedFrameId}
        onSelectFrame={(frameId) => {
          selectFrame(frameId);
          setMessage("");
        }}
      />
      <KioskButton
        onClick={goNext}
        className={`frame-next ${!session?.selectedFrameId ? "is-disabled" : ""}`}
      >
        NEXT
      </KioskButton>
      {message && <p className="kiosk-message">{message}</p>}
    </KioskStage>
  );
}
