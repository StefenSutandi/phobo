"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { KioskStage, QrScreen } from "@/components/kiosk";
import { ResultQrCode } from "@/components/kiosk/ResultQrCode";
import { useSessionStore } from "@/lib/session/session-store";
import { getPhotoRawUrl } from "@/lib/session/session-types";

export default function AddPrintPayment() {
  const router = useRouter(); 
  const { session, hasHydrated, setAddPrintPaymentStatus, setAddPrintPaymentData, setAdditionalPrintImageUrl } = useSessionStore(); 
  const [paymentActive, setPaymentActive] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [qrisConfigured, setQrisConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const paymentUrl = session?.addPrintPaymentRedirectUrl || process.env.NEXT_PUBLIC_PHOTOBO_PAYMENT_URL || "https://payment.invalid/phobo-demo";
  const isOperatorMode = session?.paymentMode === "operator";

  useEffect(() => { 
    if (hasHydrated && !session?.additionalFrameId) router.replace("/additional-frame"); 
  }, [hasHydrated, session?.additionalFrameId, router]);

  useEffect(() => {
    if (!hasHydrated || !session?.sessionId) return;

    if (session.addPrintPaymentOrderId && (session.addPrintPaymentRedirectUrl || session.paymentMode)) {
      setPaymentActive(true);
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
            paymentPurpose: "add-print",
          }),
        });
        const data = await res.json();
        if (data.ok) {
          setPaymentActive(true);
          if (data.mode === "operator") {
            setQrisConfigured(data.qrisConfigured !== false);
            setAddPrintPaymentData({
              addPrintPaymentOrderId: data.orderId,
              addPrintPaymentRedirectUrl: data.qrisImageUrl || "/assets/payment/qris.png",
              addPrintPayableAmount: data.payableAmount,
              addPrintUniqueCode: data.uniqueCode || 0,
            });
          } else {
            setAddPrintPaymentData({
              addPrintPaymentOrderId: data.orderId,
              addPrintPaymentRedirectUrl: data.redirectUrl
            });
          }
        } else {
          setPaymentActive(false);
        }
      } catch (e) {
        console.error("Failed to init payment", e);
        setPaymentActive(false);
      } finally {
        setIsInitializing(false);
      }
    };

    initPayment();
  }, [hasHydrated, session?.sessionId, session?.addPrintPaymentOrderId, session?.addPrintPaymentRedirectUrl, session?.paymentMode, setAddPrintPaymentData]);

  // Polling for payment status
  useEffect(() => {
    if (!paymentActive || !session?.addPrintPaymentOrderId) return;
    if (session?.addPrintPaymentStatus === "paid") return; // Stop polling if paid

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/payment/status?orderId=${session.addPrintPaymentOrderId}`);
        const data = await res.json();
        if (data.ok && data.status) {
          if (data.status === "confirmed") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setAddPrintPaymentStatus("paid");
          } else if (data.status === "failed" || data.status === "cancelled" || data.status === "expired") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setAddPrintPaymentStatus("failed");
          }
        }
      } catch (e) {
        console.error("Failed to poll status", e);
      }
    };

    pollIntervalRef.current = setInterval(checkStatus, 1500);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [paymentActive, session?.addPrintPaymentOrderId, session?.addPrintPaymentStatus, setAddPrintPaymentStatus]);

  // Once paid, trigger compose
  useEffect(() => {
    if (session?.addPrintPaymentStatus === "paid" && !session?.additionalPrintImageUrl && !busy && msg !== "COMPOSING ADDITIONAL PRINT...") {
      setBusy(true);
      setMsg("COMPOSING ADDITIONAL PRINT...");
      
      const composePrint = async () => {
        try {
          const slotAssignments = Array.isArray(session.additionalPhotoSlotAssignments)
            ? session.additionalPhotoSlotAssignments.map((photoIdx, slotIdx) => {
                const photoObj = photoIdx !== null && photoIdx !== undefined ? session.capturedPhotos[photoIdx] : null;
                return {
                  slotIndex: slotIdx,
                  photoRaw: getPhotoRawUrl(photoObj),
                  backgroundId: (photoObj && typeof photoObj === "object" && photoObj.backgroundId)
                    ? photoObj.backgroundId
                    : (session.selectedBackgroundId || "background-01"),
                };
              })
            : undefined;

          const r = await fetch("/api/results/compose-additional", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: session.sessionId,
              capturedPhotos: session.capturedPhotos,
              additionalFrameId: session.additionalFrameId,
              selectedBackgroundId: session.selectedBackgroundId,
              slotAssignments,
              stickers: session.stickers,
              options: session.greenScreenTuning,
            }),
          });
          const d = await r.json();
          if (!r.ok || !d.ok || !d.printImageUrl) throw new Error(d.error || "Failed to compose additional print");
          setAdditionalPrintImageUrl(d.printImageUrl);
          setMsg("ADDITIONAL PRINT READY!");
        } catch (e) {
          setMsg(e instanceof Error ? e.message : "COMPOSE FAILED");
        } finally {
          setBusy(false);
        }
      };

      composePrint();
    }
  }, [session?.addPrintPaymentStatus, session?.additionalPrintImageUrl, session?.sessionId, session?.capturedPhotos, session?.additionalSelectedPhotoIndices, session?.additionalFrameId, session?.selectedBackgroundId, session?.stickers, session?.greenScreenTuning, busy, msg, setAdditionalPrintImageUrl]);

  const handlePrint = async () => {
    if (!session?.additionalPrintImageUrl || busy) return;
    setBusy(true);
    setMsg("SENDING TO PRINTER...");
    try {
      const r = await fetch("/api/printer/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          printUrl: session.additionalPrintImageUrl,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || d.message || "PRINT FAILED");
      setMsg("PRINT SUCCESS!");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "PRINT FAILED. TRY AGAIN.");
    } finally {
      setBusy(false);
    }
  };

  const basePrice = 20000;

  return (
    <KioskStage>
      <QrScreen 
        title={paymentActive ? "SCAN UNTUK BAYAR" : "PAYMENT DISABLED"} 
        initialSeconds={120} 
        completionText="PAYMENT TIMEOUT" 
        onComplete={() => {
          setAddPrintPaymentStatus("failed");
          router.push("/result");
        }} 
        qrContent={
          !isInitializing 
            ? paymentActive 
              ? isOperatorMode 
                ? !qrisConfigured ? (
                    <div style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#222', color: '#ffaa00', borderRadius: '8px', textAlign: 'center', padding: '15px'}}>
                      <span style={{fontSize: '36px'}}>⚠️</span>
                      <span style={{marginTop: '10px', fontSize: '14px', fontWeight: 'bold'}}>QRIS merchant belum dikonfigurasi.</span>
                    </div>
                  ) : (
                    <img 
                      src={session?.addPrintPaymentRedirectUrl || "/assets/payment/qris.png"} 
                      alt="Merchant QRIS" 
                      style={{width: '100%', height: '100%', objectFit: 'contain', background: '#fff', padding: '10px', borderRadius: '8px'}}
                      onError={() => setQrisConfigured(false)}
                    />
                  )
                : <ResultQrCode value={paymentUrl} /> 
              : <div style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#222', color: '#aaa', borderRadius: '8px', textAlign: 'center'}}>
                  <span style={{fontSize: '48px'}}>⚙️</span>
                  <span style={{marginTop: '10px', fontSize: '18px'}}>OFFLINE</span>
                </div>
            : <div className="qr-image" style={{display: "grid", placeItems: "center", background: "#fff", width:"100%", height:"100%", borderRadius: "8px"}}>...</div>
        } 
      />
      
      <div className="payment-summary">
        {isOperatorMode ? (
          <div>
            <div style={{fontSize: '16px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold'}}>Additional Print</div>
            <div style={{fontSize: '28px', fontWeight: 'bold', color: '#2ecc71', marginTop: '6px'}}>
              TOTAL: Rp {basePrice.toLocaleString("id-ID")}
            </div>
            <div style={{fontSize: '14px', color: '#aaa', marginTop: '6px'}}>
              Silakan masukkan nominal Rp {basePrice.toLocaleString("id-ID")} pada aplikasi pembayaran.
            </div>
          </div>
        ) : (
          <div>Additional Print - Rp 20.000</div>
        )}

        {session?.addPrintPaymentOrderId && (
          <div style={{ marginTop: '12px', padding: '8px 14px', backgroundColor: '#222', borderRadius: '8px', border: '1px solid #444', textAlign: 'center' }}>
            <p style={{ fontSize: '12px', color: '#aaa', margin: '0 0 3px 0' }}>Jika terjadi kendala, silakan foto layar ini</p>
            <p style={{ fontSize: '18px', fontFamily: 'monospace', margin: '0', color: '#fff', letterSpacing: '2px', fontWeight: 'bold' }}>
              Order ID: {session.addPrintPaymentOrderId}
            </p>
            {isOperatorMode && session?.addPrintPaymentStatus !== "paid" && (
              <span style={{fontSize: '12px', color: '#2ecc71', fontWeight: 'bold', display: 'block', marginTop: '4px'}}>
                Status: MENUNGGU KONFIRMASI OPERATOR
              </span>
            )}
          </div>
        )}

        {!paymentActive && !isInitializing && (
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
            {busy ? "..." : msg === "PRINT SUCCESS!" ? "PRINTED" : "PRINT ADDITIONAL"}
          </button>
        </div>
      )}
    </KioskStage>
  );
}
