"use client";

import { useEffect, useState } from "react";
import { KioskStage, QrScreen } from "@/components/kiosk";
import { ResultQrCode } from "@/components/kiosk/ResultQrCode";
import { useSessionStore } from "@/lib/session/session-store";

export default function Result() {
  const { session, setPrintImageUrl, setPrintStatus } = useSessionStore();
  const [absoluteResultUrl, setAbsoluteResultUrl] = useState("");
  const [printMessage, setPrintMessage] = useState("");
  const [isGeneratingPrint, setIsGeneratingPrint] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    if (!session?.finalImageUrl) {
      setAbsoluteResultUrl("");
      return;
    }

    setAbsoluteResultUrl(new URL(session.finalImageUrl, window.location.origin).toString());
  }, [session?.finalImageUrl]);

  async function generatePrintFile() {
    if (!session?.sessionId) {
      setPrintMessage("No session to print");
      return;
    }

    setIsGeneratingPrint(true);
    setPrintMessage("Generating print file...");

    try {
      const response = await fetch("/api/results/print-template", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: session.sessionId,
          finalImageUrl: session.finalImageUrl,
          capturedPhotos: session.capturedPhotos,
          selectedFrameId: session.selectedFrameId,
          selectedBackgroundId: session.selectedBackgroundId,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        printUrl?: string;
        error?: string;
      };

      if (!response.ok || !payload.ok || !payload.printUrl) {
        throw new Error(payload.error || "Failed to generate print file");
      }

      setPrintImageUrl(payload.printUrl);
      setPrintMessage("Print file ready");
    } catch (error) {
      setPrintMessage(error instanceof Error ? error.message : "Failed to generate print file");
    } finally {
      setIsGeneratingPrint(false);
    }
  }

  async function printResult() {
    if (!session?.sessionId || !session.printImageUrl) {
      setPrintMessage("No result to print");
      return;
    }

    setPrintStatus("queued");
    setPrintMessage("Print queued...");
    setIsPrinting(true);

    try {
      const response = await fetch("/api/printer/print", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: session.sessionId,
          printUrl: session.printImageUrl,
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
      setPrintMessage(payload.message || "Print command queued");
    } catch (error) {
      setPrintStatus("failed");
      setPrintMessage(error instanceof Error ? error.message : "Print failed");
    } finally {
      setIsPrinting(false);
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
          <button
            type="button"
            className="result-dev-button"
            onClick={generatePrintFile}
            disabled={isGeneratingPrint}
          >
            {isGeneratingPrint ? "GENERATING" : "GENERATE PRINT FILE"}
          </button>
          {session.printImageUrl && (
            <a href={session.printImageUrl} className="result-dev-link" target="_blank" rel="noreferrer">
              OPEN PRINT FILE
            </a>
          )}
          <button
            type="button"
            className="result-dev-button"
            onClick={printResult}
            disabled={!session.printImageUrl || isPrinting}
          >
            {isPrinting ? "PRINTING" : "PRINT / MOCK PRINT"}
          </button>
        </div>
      )}
    </KioskStage>
  );
}
