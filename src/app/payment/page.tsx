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
            setPaymentStatus("confirmed");
            router.push("/frames");
          } else if (data.status === "failed" || data.status === "timeout") {
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
        title={midtransEnabled ? "SCAN UNTUK BAYAR" : "SCAN FOR PAYMENT"} 
        initialSeconds={120} 
        completionText="PAYMENT TIMEOUT" 
        onComplete={() => setPaymentStatus("timeout")} 
        qrContent={!isInitializing ? <ResultQrCode value={paymentUrl} /> : <div className="qr-image" style={{display: "grid", placeItems: "center", background: "#fff", width:"100%", height:"100%"}}>...</div>} 
      />
      <div className="payment-summary">
        {session?.packageName} - Rp. {(session?.price ?? 0).toLocaleString("id-ID")},00
        {!midtransEnabled && !isInitializing && <div style={{fontSize: 16, opacity: 0.7, marginTop: 10}}>(Manual payment mode)</div>}
      </div>
      
      {(!midtransEnabled || process.env.NEXT_PUBLIC_PAYMENT_DEBUG === "true") && (
        <button 
          className="operator-confirm" 
          onClick={() => {
            setPaymentStatus("confirmed");
            router.push("/frames");
          }}
        >
          CONFIRM PAYMENT
        </button>
      )}
    </KioskStage>
  );
}
