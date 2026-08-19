"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KioskStage } from "@/components/kiosk";
import { CountdownTimer } from "@/components/kiosk/CountdownTimer";
import { ResultQrCode } from "@/components/kiosk/ResultQrCode";
import { useSessionStore } from "@/lib/session/session-store";

export default function Result() {
  const router = useRouter();
  const { session, setPrintImageUrl, setPrintStatus } = useSessionStore();
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
      <div
        style={{
          position: "absolute",
          top: "6%",
          left: "4%",
          right: "4%",
          bottom: "16%",
          display: "flex",
          gap: "40px",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10,
        }}
      >
        {/* Left / Center: Visual Kiosk Preview of the Final Composed Image */}
        <div
          style={{
            flex: "1 1 45%",
            height: "100%",
            maxHeight: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {finalImageUrl ? (
            imageError ? (
              <div
                style={{
                  width: "100%",
                  maxWidth: "360px",
                  aspectRatio: "1200 / 1800",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#16161a",
                  borderRadius: "16px",
                  border: "2px dashed #444",
                  color: "#ff6b6b",
                  padding: "20px",
                  textAlign: "center",
                }}
              >
                <span style={{ fontSize: "40px", marginBottom: "8px" }}>⚠️</span>
                <span style={{ fontSize: "15px", fontWeight: "bold" }}>
                  FOTO HASIL GAGAL DIMUAT
                </span>
                <span style={{ fontSize: "12px", color: "#888", marginTop: "6px" }}>
                  File tetap tersimpan di server
                </span>
              </div>
            ) : (
              <div
                style={{
                  height: "100%",
                  maxHeight: "100%",
                  aspectRatio: "1200 / 1800",
                  borderRadius: "16px",
                  overflow: "hidden",
                  boxShadow: "0 12px 36px rgba(0,0,0,0.6)",
                  border: "2px solid rgba(255,255,255,0.15)",
                  backgroundColor: "#000",
                  position: "relative",
                }}
              >
                <img
                  src={finalImageUrl}
                  alt="Final Result Preview"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    display: "block",
                  }}
                  onError={() => {
                    console.error("[Result Page] Failed to load local final image:", finalImageUrl);
                    setImageError(true);
                  }}
                />
              </div>
            )
          ) : (
            <div
              style={{
                width: "100%",
                maxWidth: "360px",
                aspectRatio: "1200 / 1800",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#16161a",
                borderRadius: "16px",
                color: "#888",
              }}
            >
              <span style={{ fontSize: "36px" }}>⏳</span>
              <span style={{ marginTop: "8px", fontSize: "14px" }}>Memuat hasil foto...</span>
            </div>
          )}
        </div>

        {/* Right: QR Code & Session Countdown Timer */}
        <div
          style={{
            flex: "1 1 45%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <h1
            className="qr-title"
            style={{
              fontSize: "2.2rem",
              marginBottom: "16px",
              fontWeight: "900",
              letterSpacing: "1px",
              color: "#fff",
              textShadow: "0 4px 12px rgba(0,0,0,0.6)",
            }}
          >
            SCAN THE RESULT !!!
          </h1>

          <div
            className="qr-box"
            style={{
              width: "240px",
              height: "240px",
              backgroundColor: "#fff",
              padding: "16px",
              borderRadius: "16px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
              display: "grid",
              placeItems: "center",
            }}
          >
            {url ? (
              <ResultQrCode value={url} />
            ) : (
              <div style={{ color: "#333", fontSize: "14px" }}>Generating QR...</div>
            )}
          </div>

          <p className="qr-timer" style={{ marginTop: "16px", fontSize: "1.2rem", color: "#aaa" }}>
            <CountdownTimer
              initialSeconds={300}
              onComplete={() => {
                router.push("/closing");
              }}
            />
          </p>

          {msg && (
            <p
              style={{
                marginTop: "8px",
                fontSize: "13px",
                color: msg.includes("FAIL") || msg.includes("ERROR") ? "#ff6b6b" : "#2ecc71",
                fontWeight: "600",
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
