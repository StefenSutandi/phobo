"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KioskStage } from "@/components/kiosk";
import { CountdownTimer } from "@/components/kiosk/CountdownTimer";
import { ResultQrCode } from "@/components/kiosk/ResultQrCode";
import { useSessionStore } from "@/lib/session/session-store";

export default function Result() {
  const router = useRouter();
  const { session, setPrintStatus } = useSessionStore();
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (session?.driveUrl) {
      setUrl(session.driveUrl);
      setMsg("Uploaded to Google Drive");
    } else if (session?.finalImageUrl) {
      setUrl(new URL(session.finalImageUrl, window.location.origin).toString());
      setMsg("Using local result link");
    }
  }, [session?.finalImageUrl, session?.driveUrl]);

  async function print() {
    const printTargetUrl = session?.printImageUrl || session?.finalImageUrl;
    if (!printTargetUrl) return;

    setPrintStatus("queued");
    setBusy(true);
    setMsg("MENGIRIM KE PRINTER...");

    try {
      const r = await fetch("/api/printer/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          printUrl: printTargetUrl,
        }),
      });
      const d = await r.json();
      setPrintStatus(r.ok && d.ok ? "printed" : "failed");
      setMsg(d.message || d.error || (r.ok && d.ok ? "PRINT SUCCESS" : "PRINT FAILED"));
    } catch (e) {
      setPrintStatus("failed");
      setMsg(e instanceof Error ? e.message : "PRINT ERROR");
    } finally {
      setBusy(false);
    }
  }

  const finalImageUrl = session?.finalImageUrl;

  return (
    <KioskStage>
      <div className="result-layout">
        {/* Left: Visual Kiosk Preview of the Final Composed Image */}
        <div className="result-preview-panel">
          {finalImageUrl ? (
            imageError ? (
              <div
                className="result-preview-card"
                style={{
                  flexDirection: "column",
                  backgroundColor: "#16161a",
                  border: "2px dashed #555",
                  color: "#ff6b6b",
                  padding: "16px",
                  textAlign: "center",
                }}
              >
                <span style={{ fontSize: "32px", marginBottom: "6px" }}>⚠️</span>
                <span style={{ fontSize: "13px", fontWeight: "bold" }}>
                  FOTO HASIL GAGAL DIMUAT
                </span>
                <span style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>
                  File tetap tersimpan di server
                </span>
              </div>
            ) : (
              <div className="result-preview-card">
                <img
                  src={finalImageUrl}
                  alt="Final Result Preview"
                  onError={() => {
                    console.error("[Result Page] Failed to load local final image:", finalImageUrl);
                    setImageError(true);
                  }}
                />
              </div>
            )
          ) : (
            <div
              className="result-preview-card"
              style={{
                flexDirection: "column",
                backgroundColor: "#16161a",
                color: "#888",
              }}
            >
              <span style={{ fontSize: "30px" }}>⏳</span>
              <span style={{ marginTop: "6px", fontSize: "13px" }}>Memuat hasil foto...</span>
            </div>
          )}
        </div>

        {/* Right: Title, QR Code & Session Countdown Timer */}
        <div className="result-qr-panel">
          <h1 className="result-title">SCAN THE RESULT !!!</h1>

          <div className="result-qr-box">
            {url ? (
              <ResultQrCode value={url} />
            ) : (
              <div style={{ color: "#333", fontSize: "13px" }}>Generating QR...</div>
            )}
          </div>

          <p className="result-qr-timer">
            <CountdownTimer
              initialSeconds={300}
              onComplete={() => {
                router.push("/closing");
              }}
            />
          </p>

          {msg && (
            <p
              className="result-status-msg"
              style={{
                color: msg.includes("FAIL") || msg.includes("ERROR") ? "#ff6b6b" : "#2ecc71",
              }}
            >
              {msg}
            </p>
          )}
        </div>
      </div>

      {/* Bottom Kiosk Action Buttons */}
      <footer className="result-actions">
        {finalImageUrl && (
          <>
            <a href={finalImageUrl} target="_blank" rel="noreferrer">
              OPEN RESULT
            </a>
            <a href={finalImageUrl} download={`phobo-${session?.sessionId || "photo"}.png`}>
              DOWNLOAD
            </a>
            <button
              onClick={print}
              disabled={busy || (!session?.printImageUrl && !session?.finalImageUrl)}
            >
              {busy ? "PRINTING..." : "PRINT / MOCK PRINT"}
            </button>
          </>
        )}
        <button className="add-print" onClick={() => router.push("/additional-frame")}>
          ADD PRINT · +20.000,00
        </button>
        <button onClick={() => router.push("/closing")}>FINISH</button>
      </footer>
    </KioskStage>
  );
}
