"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KioskStage } from "@/components/kiosk";
import { CountdownTimer } from "@/components/kiosk/CountdownTimer";
import { ResultQrCode } from "@/components/kiosk/ResultQrCode";
import { useSessionStore } from "@/lib/session/session-store";

export default function Result() {
  const router = useRouter();
  const { session, setPrintStatus, setPrintImageUrl } = useSessionStore();
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showPrintAsset, setShowPrintAsset] = useState(false);

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
    if (!session?.sessionId || !session?.finalImageUrl) return;

    setPrintStatus("queued");
    setBusy(true);
    setMsg("MENYIAPKAN FILE CETAK...");

    try {
      // 1. Always regenerate fresh single portrait postcard print asset from authoritative finalImageUrl
      const regenRes = await fetch("/api/results/print-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          finalImageUrl: session.finalImageUrl,
        }),
      });
      const regenData = await regenRes.json();
      if (!regenRes.ok || !regenData.ok || !regenData.printUrl) {
        throw new Error(regenData.error || "Gagal menyiapkan file cetak");
      }

      setPrintImageUrl(regenData.printUrl);

      // 2. Send freshly validated print asset to printer
      setMsg("MENGIRIM KE PRINTER...");
      const r = await fetch("/api/printer/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          printUrl: regenData.printUrl,
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
  const printImageUrl = session?.printImageUrl;

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

          {/* Operator Diagnostic: Expandable Print Asset Preview (Task 7) */}
          {printImageUrl && (
            <div style={{ marginTop: "8px", width: "100%", maxWidth: "360px" }}>
              <button
                type="button"
                onClick={() => setShowPrintAsset((prev) => !prev)}
                style={{
                  background: "transparent",
                  border: "1px solid #444",
                  borderRadius: "6px",
                  color: "#888",
                  fontSize: "11px",
                  padding: "4px 8px",
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "center",
                }}
              >
                {showPrintAsset ? "HIDE PRINT ASSET (DIAGNOSTIC)" : "PREVIEW PRINT ASSET (DIAGNOSTIC)"}
              </button>
              {showPrintAsset && (
                <div
                  style={{
                    marginTop: "6px",
                    padding: "8px",
                    background: "#111",
                    border: "1px solid #333",
                    borderRadius: "6px",
                    textAlign: "center",
                  }}
                >
                  <p style={{ fontSize: "10px", color: "#aaa", margin: "0 0 4px 0", fontWeight: "bold" }}>
                    PRINT ASSET (1181x1748 Portrait Postcard)
                  </p>
                  <img
                    src={printImageUrl}
                    alt="Print Asset"
                    style={{
                      maxHeight: "180px",
                      objectFit: "contain",
                      border: "1px solid #555",
                      borderRadius: "4px",
                      background: "#000",
                    }}
                  />
                </div>
              )}
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
              disabled={busy || !session?.finalImageUrl}
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
