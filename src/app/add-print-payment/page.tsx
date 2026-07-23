"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { KioskStage, QrScreen } from "@/components/kiosk";
import { ResultQrCode } from "@/components/kiosk/ResultQrCode";
import { useSessionStore } from "@/lib/session/session-store";

export default function AddPrintPayment() {
  const router = useRouter(); 
  const { session, hasHydrated, setAddPrintPaymentStatus, setAddPrintPaymentData, setAdditionalPrintImageUrl } = useSessionStore(); 
  const [midtransEnabled, setMidtransEnabled] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const paymentUrl = session?.addPrintPaymentRedirectUrl || process.env.NEXT_PUBLIC_PHOTOBO_PAYMENT_URL || "https://payment.invalid/phobo-demo";

  useEffect(() => { 
    if (hasHydrated && !session?.additionalFrameId) router.replace("/additional-frame"); 
  }, [hasHydrated, session?.additionalFrameId, router]);

  useEffect(() => {
    if (!hasHydrated || !session?.sessionId) return;
    if (session.addPrintPaymentOrderId && session.addPrintPaymentRedirectUrl) {
      setMidtransEnabled(true);
      setIsInitializing(false);
      return;
    }

    const initPayment = async () => {
      try {
        const res = await fetch("/api/payment/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.sessionId,
            packageId: "add-print",
            packageName: "Additional Print",
            amount: 20000,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          setMidtransEnabled(true);
          setAddPrintPaymentData({
            addPrintPaymentOrderId: data.orderId,
            addPrintPaymentRedirectUrl: data.redirectUrl
          });
        } else {
          setMidtransEnabled(false);
        }
      } catch (e) {
        console.error("Failed to init Midtrans", e);
        setMidtransEnabled(false);
      } finally {
        setIsInitializing(false);
      }
    };

    initPayment();
  }, [hasHydrated, session?.sessionId, session?.addPrintPaymentOrderId, session?.addPrintPaymentRedirectUrl, setAddPrintPaymentData]);

  // Polling for Midtrans payment status
  useEffect(() => {
    if (!midtransEnabled || !session?.addPrintPaymentOrderId) return;
    if (session?.addPrintPaymentStatus === "paid") return; // Stop polling if paid

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/payment/status?orderId=${session.addPrintPaymentOrderId}`);
        const data = await res.json();
        if (data.ok && data.status) {
          if (data.status === "confirmed") {
            setAddPrintPaymentStatus("paid");
          } else if (data.status === "failed" || data.status === "timeout") {
            setAddPrintPaymentStatus("failed");
          }
        }
      } catch (e) {
        console.error("Failed to poll status", e);
      }
    };

    pollIntervalRef.current = setInterval(checkStatus, 2000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [midtransEnabled, session?.addPrintPaymentOrderId, session?.addPrintPaymentStatus, setAddPrintPaymentStatus]);

  // Once paid, trigger compose
  useEffect(() => {
    if (session?.addPrintPaymentStatus === "paid" && !session?.additionalPrintImageUrl && !busy && msg !== "COMPOSING ADDITIONAL PRINT...") {
      setBusy(true);
      setMsg("COMPOSING ADDITIONAL PRINT...");
      
      const composePrint = async () => {
        try {
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
          setMsg(e instanceof Error ? e.message : "FAILED TO COMPOSE");
        } finally {
          setBusy(false);
        }
      };

      composePrint();
    }
  }, [session?.addPrintPaymentStatus, session?.additionalPrintImageUrl, session?.sessionId, session?.capturedPhotos, session?.additionalFrameId, session?.selectedBackgroundId, session?.stickers, session?.greenScreenTuning, busy, msg, setAdditionalPrintImageUrl]);


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

  return (
    <KioskStage>
      <QrScreen 
        title={midtransEnabled ? "SCAN UNTUK BAYAR" : "SCAN FOR PAYMENT"} 
        initialSeconds={120} 
        completionText="PAYMENT TIMEOUT" 
        onComplete={() => {
          setAddPrintPaymentStatus("failed");
          router.push("/result");
        }} 
        qrContent={!isInitializing ? <ResultQrCode value={paymentUrl} /> : <div className="qr-image" style={{display: "grid", placeItems: "center", background: "#fff", width:"100%", height:"100%"}}>...</div>} 
      />
      
      <div className="payment-summary">
        Additional Print - Rp 20.000,00
        {!midtransEnabled && !isInitializing && (
          <div style={{fontSize: 16, opacity: 0.7, marginTop: 10}}>
            {process.env.NEXT_PUBLIC_PAYMENT_DEBUG === "true" 
              ? "(Manual payment mode)" 
              : "Payment gateway is disabled. Enable Midtrans or debug fallback to continue."}
          </div>
        )}
        {session?.addPrintPaymentStatus === "paid" && !session?.additionalPrintImageUrl && (
          <div style={{marginTop: 10, fontSize: "1.2rem"}}>{busy ? "COMPOSING..." : "READY TO COMPOSE..."}</div>
        )}
        {msg && <div style={{marginTop: 10, fontSize: "1.2rem", whiteSpace: "pre-wrap"}}>{msg}</div>}
      </div>

      {session?.additionalPrintImageUrl && (
        <div style={{ position: "absolute", bottom: "15%", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "20px", justifyContent: "center", alignItems: "center", zIndex: 10 }}>
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

      {process.env.NEXT_PUBLIC_PAYMENT_DEBUG === "true" && session?.addPrintPaymentStatus !== "paid" && (
        <button 
          className="operator-confirm" 
          onClick={() => setAddPrintPaymentStatus("paid")}
        >
          SIMULATE PAYMENT
        </button>
      )}
    </KioskStage>
  );
}
