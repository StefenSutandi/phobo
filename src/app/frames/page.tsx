"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FrameGridScroller,
  KioskButton,
  KioskStage,
  RoundedPanel,
  SessionTimerHud,
} from "@/components/kiosk";
import { frames } from "@/lib/phobo-data";
import { useSessionStore } from "@/lib/session/session-store";

export default function Frames() {
  const router = useRouter();
  const { session, hasHydrated, selectFrame, initSessionTimer } = useSessionStore();
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (session?.paymentStatus !== "confirmed") {
      router.replace("/payment");
      return;
    }

    if (!session?.sessionDeadlineAt) {
      initSessionTimer(480);
    }
  }, [hasHydrated, router, session?.paymentStatus, session?.sessionDeadlineAt, initSessionTimer]);

  function goNext() {
    if (!session?.selectedFrameId) {
      setMessage("PILIH FRAME DULU");
      return;
    }

    router.push("/camera");
  }

  return (
    <KioskStage>
      <div
        style={{
          position: "absolute",
          right: "4.4%",
          top: "3.5%",
          zIndex: 95,
        }}
      >
        <SessionTimerHud />
      </div>
      <h1 className="frames-title">FRAME</h1>
      <RoundedPanel className="frame-panel">
        {session?.selectedFrameId && (
          <img
            src={frames.find((f) => f.id === session.selectedFrameId)?.templateUrl}
            alt="Selected frame preview"
            className="selected-frame-preview"
          />
        )}
        <FrameGridScroller
          frames={frames}
          selectedFrameId={session?.selectedFrameId}
          onSelectFrame={(frameId) => {
            selectFrame(frameId);
            setMessage("");
          }}
        />
      </RoundedPanel>
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
