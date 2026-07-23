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

export default function AdditionalFrame() {
  const router = useRouter();
  const { session, hasHydrated, selectAdditionalFrame, setAddPrintPaymentStatus } = useSessionStore();
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!hasHydrated) return;
    if (!session || !session.capturedPhotos || session.capturedPhotos.length === 0) {
      router.replace("/");
    }
  }, [hasHydrated, router, session]);

  function goNext() {
    if (!session?.additionalFrameId) {
      setMessage("PILIH FRAME TAMBAHAN");
      return;
    }
    
    // Set payment status to unpaid before proceeding
    setAddPrintPaymentStatus("unpaid");
    router.push("/add-print-payment");
  }

  return (
    <KioskStage>
      <h1 className="frames-title">ADDITIONAL FRAME</h1>
      <RoundedPanel className="frame-panel">
        {session?.additionalFrameId && (
          <img
            src={frames.find((f) => f.id === session.additionalFrameId)?.templateUrl}
            alt="Selected additional frame preview"
            className="selected-frame-preview"
          />
        )}
        <FrameGridScroller
          frames={frames}
          selectedFrameId={session?.additionalFrameId}
          onSelectFrame={(frameId) => {
            selectAdditionalFrame(frameId);
            setMessage("");
          }}
        />
      </RoundedPanel>
      <KioskButton
        onClick={goNext}
        className={`frame-next ${!session?.additionalFrameId ? "is-disabled" : ""}`}
      >
        NEXT
      </KioskButton>
      {message && <p className="kiosk-message">{message}</p>}
    </KioskStage>
  );
}
