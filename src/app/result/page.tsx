"use client";

import { useEffect, useState } from "react";
import { KioskStage, QrScreen } from "@/components/kiosk";
import { ResultQrCode } from "@/components/kiosk/ResultQrCode";
import { useSessionStore } from "@/lib/session/session-store";

export default function Result() {
  const { session, setPrintStatus } = useSessionStore();
  const [absoluteResultUrl, setAbsoluteResultUrl] = useState("");
  const [printMessage, setPrintMessage] = useState("");

  useEffect(() => {
    if (!session?.finalImageUrl) {
      setAbsoluteResultUrl("");
      return;
    }

    setAbsoluteResultUrl(new URL(session.finalImageUrl, window.location.origin).toString());
  }, [session?.finalImageUrl]);

  async function mockPrintResult() {
    if (!session?.sessionId || !session.finalImageUrl) {
      setPrintMessage("No result to print");
      return;
    }

    setPrintStatus("queued");
    setPrintMessage("Mock print queued...");

    try {
      const response = await fetch("/api/printer/print", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: session.sessionId,
          resultUrl: session.finalImageUrl,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Mock print failed");
      }

      setPrintStatus("printed");
      setPrintMessage(payload.message || "Mock print queued");
    } catch (error) {
      setPrintStatus("failed");
      setPrintMessage(error instanceof Error ? error.message : "Mock print failed");
    }
  }

  return (
    <KioskStage>
      <QrScreen
        title="SCAN THE RESULT !!!"
        initialSeconds={300}
        completionText="SESSION ENDED"
        qrContent={<ResultQrCode value={absoluteResultUrl} />}
      />
      <p className="dev-note">
        {session?.finalImageUrl
          ? `Final image ready. Print status: ${session.printStatus}. ${printMessage}`
          : "NO RESULT YET"}
      </p>
      {session?.finalImageUrl && (
        <div className="result-dev-actions">
          <a href={session.finalImageUrl} className="result-dev-link" download>
            DOWNLOAD
          </a>
          <button type="button" className="result-dev-button" onClick={mockPrintResult}>
            MOCK PRINT
          </button>
        </div>
      )}
    </KioskStage>
  );
}
