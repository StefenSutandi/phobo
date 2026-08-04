"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { KioskStage, QrScreen } from "@/components/kiosk";
import { ResultQrCode } from "@/components/kiosk/ResultQrCode";
import { useSessionStore } from "@/lib/session/session-store";

export default function Payment() {
  const router = useRouter(); 
  const { session, hasHydrated, setPaymentStatus, setPaymentData } = useSessionStore(); 
  const [midtransEnabled, setMidtransEnabled] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const paymentUrl = session?.paymentRedirectUrl || process.env.NEXT_PUBLIC_PHOTOBO_PAYMENT_URL || "https://payment.invalid/phobo-demo";

  useEffect(() => { 
    if (hasHydrated && !session?.selectedPackageId) router.replace("/packages"); 
  }, [hasHydrated, session?.selectedPackageId, router]);

  useEffect(() => {
    if (!hasHydrated || !session?.sessionId || !session?.price) return;

    // Only create a transaction once per session
    if (session.paymentOrderId && session.paymentRedirectUrl) {
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
            packageId: session.packageId,
            packageName: session.packageName,
            amount: session.price,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          setMidtransEnabled(true);
          setPaymentData({
            paymentOrderId: data.orderId,
            paymentSnapToken: data.token,
            paymentRedirectUrl: data.redirectUrl,
            paymentAmount: session.price,
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
  }, [hasHydrated, session?.sessionId, session?.price, session?.paymentOrderId, session?.paymentRedirectUrl, setPaymentData]);

  // Polling for Midtrans payment status
  useEffect(() => {
    if (!midtransEnabled || !session?.paymentOrderId) return;

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/payment/status?orderId=${session.paymentOrderId}`);
        const data = await res.json();
        if (data.ok && data.status) {
          if (data.status === "confirmed") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setPaymentStatus("confirmed");
            router.push("/frames");
          } else if (data.status === "failed" || data.status === "timeout") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setPaymentStatus(data.status);
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
  }, [midtransEnabled, session?.paymentOrderId, router, setPaymentStatus]);

  return (
    <KioskStage>
      <QrScreen 
        title={midtransEnabled ? "SCAN UNTUK BAYAR" : "PAYMENT DISABLED"} 
        initialSeconds={120} 
        completionText="PAYMENT TIMEOUT" 
        onComplete={() => setPaymentStatus("timeout")} 
        qrContent={
          !isInitializing 
            ? midtransEnabled 
              ? <ResultQrCode value={paymentUrl} /> 
              : <div style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#222', color: '#aaa', borderRadius: '8px', textAlign: 'center'}}>
                  <span style={{fontSize: '48px'}}>⚙️</span>
                  <span style={{marginTop: '10px', fontSize: '18px'}}>OFFLINE</span>
                </div>
            : <div className="qr-image" style={{display: "grid", placeItems: "center", background: "#fff", width:"100%", height:"100%", borderRadius: "8px"}}>...</div>
        } 
      />
      <div className="payment-summary">
        {session?.packageName} - Rp. {(session?.price ?? 0).toLocaleString("id-ID")},00
        
        {session?.paymentOrderId && (
          <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#222', borderRadius: '8px', border: '1px solid #444' }}>
            <p style={{ fontSize: '14px', color: '#aaa', margin: '0 0 5px 0' }}>Jika terjadi kendala, silakan foto layar ini</p>
            <p style={{ fontSize: '18px', fontFamily: 'monospace', margin: '0', color: '#fff', letterSpacing: '2px' }}>
              ID: {session.paymentOrderId}
            </p>
          </div>
        )}

        {!midtransEnabled && !isInitializing && (
          <div style={{fontSize: 16, opacity: 0.7, marginTop: 10}}>
            {process.env.NEXT_PUBLIC_PAYMENT_DEBUG === "true" 
              ? "(Manual debug mode)" 
              : "Payment gateway is disabled. Enable Midtrans or debug fallback to continue."}
          </div>
        )}
      </div>
      
      {process.env.NEXT_PUBLIC_PAYMENT_DEBUG === "true" && (
        <button 
          className="operator-confirm" 
          onClick={() => {
            setPaymentStatus("confirmed");
            router.push("/frames");
          }}
        >
          SIMULATE PAYMENT
        </button>
      )}
    </KioskStage>
  );
}
