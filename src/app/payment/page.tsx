"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { KioskStage, QrScreen } from "@/components/kiosk";
import { ResultQrCode } from "@/components/kiosk/ResultQrCode";
import { useSessionStore } from "@/lib/session/session-store";

export default function Payment() {
  const router = useRouter(); 
  const { session, hasHydrated, setPaymentStatus, setPaymentData } = useSessionStore(); 
  const [paymentActive, setPaymentActive] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [qrisConfigured, setQrisConfigured] = useState(true);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const paymentUrl = session?.paymentRedirectUrl || process.env.NEXT_PUBLIC_PHOTOBO_PAYMENT_URL || "https://payment.invalid/phobo-demo";
  const isOperatorMode = session?.paymentMode === "operator";

  useEffect(() => { 
    if (hasHydrated && !session?.selectedPackageId) router.replace("/packages"); 
  }, [hasHydrated, session?.selectedPackageId, router]);

  useEffect(() => {
    if (!hasHydrated || !session?.sessionId || !session?.price) return;

    // Only create a transaction once per session
    if (session.paymentOrderId && session.paymentMode) {
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
            packageId: session.packageId,
            packageName: session.packageName,
            amount: session.price,
            paymentPurpose: "main-package",
          }),
        });
        const data = await res.json();
        if (data.ok) {
          setPaymentActive(true);
          if (data.mode === "operator") {
            setQrisConfigured(data.qrisConfigured !== false);
            setPaymentData({
              paymentOrderId: data.orderId,
              paymentMode: "operator",
              payableAmount: data.payableAmount,
              uniqueCode: data.uniqueCode || 0,
              paymentRedirectUrl: data.qrisImageUrl || "/assets/payment/qris.png",
              paymentAmount: session.price,
            });
          } else {
            setPaymentData({
              paymentOrderId: data.orderId,
              paymentMode: "midtrans",
              paymentSnapToken: data.token,
              paymentRedirectUrl: data.redirectUrl,
              paymentAmount: session.price,
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
  }, [hasHydrated, session?.sessionId, session?.price, session?.paymentOrderId, session?.paymentMode, setPaymentData]);

  // Polling for payment status
  useEffect(() => {
    if (!paymentActive || !session?.paymentOrderId) return;

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/payment/status?orderId=${session.paymentOrderId}`);
        const data = await res.json();
        if (data.ok && data.status) {
          if (data.status === "confirmed") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setPaymentStatus("confirmed");
            router.push("/frames");
          } else if (data.status === "failed" || data.status === "cancelled" || data.status === "expired") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setPaymentStatus(data.status);
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
  }, [paymentActive, session?.paymentOrderId, router, setPaymentStatus]);

  const basePrice = session?.price ?? 0;

  return (
    <KioskStage>
      <QrScreen 
        title={paymentActive ? "SCAN UNTUK BAYAR" : "PAYMENT DISABLED"} 
        initialSeconds={120} 
        completionText="PAYMENT TIMEOUT" 
        onComplete={() => setPaymentStatus("timeout")} 
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
                      src={session?.paymentRedirectUrl || "/assets/payment/qris.png"} 
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
            <div style={{fontSize: '16px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold'}}>{session?.packageName}</div>
            <div style={{fontSize: '28px', fontWeight: 'bold', color: '#2ecc71', marginTop: '6px'}}>
              TOTAL: Rp {basePrice.toLocaleString("id-ID")}
            </div>
          </div>
        ) : (
          <div>{session?.packageName} - Rp {basePrice.toLocaleString("id-ID")}</div>
        )}

        {!paymentActive && !isInitializing && (
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