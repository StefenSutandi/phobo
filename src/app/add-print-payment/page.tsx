"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KioskStage, QrScreen } from "@/components/kiosk";
import { ResultQrCode } from "@/components/kiosk/ResultQrCode";
import { useSessionStore } from "@/lib/session/session-store";

export default function AddPrintPayment() {
  const router = useRouter(); 
  const { session, hasHydrated, setAddPrintPaymentStatus, setAdditionalPrintImageUrl } = useSessionStore(); 
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { 
    if (hasHydrated && !session?.additionalFrameId) router.replace("/additional-frame"); 
  }, [hasHydrated, session?.additionalFrameId, router]);

  async function handleConfirm() {
    if (!session) return;
    setAddPrintPaymentStatus("manual-confirmed");
    setBusy(true);
    setMsg("COMPOSING ADDITIONAL PRINT...");

    try {
      // 1. Compose Additional Print
      const r = await fetch("/api/results/compose-additional", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          capturedPhotos: session.capturedPhotos,
          additionalFrameId: session.additionalFrameId,
          selectedBackgroundId: session.selectedBackgroundId,
          stickers: session.stickers,
          options: session.greenScreenTuning
        })
      });
      const d = await r.json();
      if (!r.ok || !d.printImageUrl) throw new Error(d.error || "Failed to compose result");
      
      setAdditionalPrintImageUrl(d.printImageUrl);
      setMsg("PRINT READY.");
    } catch(e) {
      setMsg(e instanceof Error ? e.message : "FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function handlePrint() {
    if (!session?.additionalPrintImageUrl) return;
    setBusy(true);
    setMsg("PRINTING...");
    try {
      const pr = await fetch("/api/printer/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          printUrl: session.additionalPrintImageUrl
        })
      });
      const pd = await pr.json();
      if (!pr.ok || !pd.ok) throw new Error(pd.message || pd.error || "Print failed");

      setMsg("PRINT SUCCESS!");
    } catch(e) {
      setMsg(e instanceof Error ? e.message : "PRINT FAILED. TRY AGAIN.");
    } finally {
      setBusy(false);
    }
  }

  const paymentUrl = "https://payment.invalid/phobo-demo";

  return (
    <KioskStage>
      <QrScreen 
        title={"SCAN UNTUK BAYAR"} 
        initialSeconds={120} 
        completionText="PAYMENT TIMEOUT" 
        onComplete={() => {
          setAddPrintPaymentStatus("unpaid");
          router.push("/result");
        }} 
        qrContent={<ResultQrCode value={paymentUrl} />} 
      />
      
      <div className="payment-footer" style={{ position: "absolute", bottom: "10%", left: "50%", transform: "translateX(-50%)", textAlign: "center", width: '100%' }}>
        <p style={{ color: "white", fontSize: "2rem", marginBottom: "20px" }}>Total: Rp 20.000</p>
        
        {session?.addPrintPaymentStatus !== "manual-confirmed" && (
          <button 
            onClick={handleConfirm}
            disabled={busy}
            style={{ padding: "15px 40px", fontSize: "1.5rem", borderRadius: "30px", background: "#8e44ad", color: "white", border: "none", cursor: busy ? "not-allowed" : "pointer" }}
          >
            {busy ? "PROCESSING..." : "CONFIRM PAYMENT (MANUAL)"}
          </button>
        )}

        {session?.addPrintPaymentStatus === "manual-confirmed" && !session?.additionalPrintImageUrl && (
          <p style={{ color: "white", fontSize: "1.5rem" }}>{busy ? "COMPOSING..." : "READY TO COMPOSE..."}</p>
        )}

        {session?.additionalPrintImageUrl && (
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', alignItems: 'center' }}>
            <button 
              onClick={handlePrint}
              disabled={busy || msg === "PRINT SUCCESS!"}
              style={{ padding: "15px 40px", fontSize: "1.5rem", borderRadius: "30px", background: "#2ecc71", color: "white", border: "none", cursor: busy ? "not-allowed" : "pointer" }}
            >
              {busy ? "PRINTING..." : (msg === "PRINT SUCCESS!" ? "PRINTED" : "PRINT ADDITIONAL")}
            </button>
            {msg === "PRINT SUCCESS!" && (
              <button 
                onClick={() => router.push("/closing")}
                style={{ padding: "15px 40px", fontSize: "1.5rem", borderRadius: "30px", background: "#e74c3c", color: "white", border: "none", cursor: "pointer" }}
              >
                FINISH
              </button>
            )}
          </div>
        )}

        {msg && <p style={{ color: "white", fontSize: "1.2rem", marginTop: "15px", whiteSpace: "pre-wrap" }}>{msg}</p>}
      </div>
    </KioskStage>
  );
}
