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
  const [errorMsg, setErrorMsg] = useState("");
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasRoutedRef = useRef(false);
  
  const paymentUrl = session?.paymentRedirectUrl || process.env.NEXT_PUBLIC_PHOTOBO_PAYMENT_URL || "https://payment.invalid/phobo-demo";
  const isOperatorMode = session?.paymentMode === "operator";
  const isMidtransMode = session?.paymentMode === "midtrans";

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
          setErrorMsg("");
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
          } else if (data.mode === "midtrans") {
            setQrisConfigured(true);
            setPaymentData({
              paymentOrderId: data.orderId,
              paymentMode: "midtrans",
              payableAmount: data.payableAmount,
              paymentRedirectUrl: data.qrisImageUrl || `/api/payment/qris?orderId=${encodeURIComponent(data.orderId)}`,
              paymentAmount: session.price,
            });
          } else {
            setPaymentData({
              paymentOrderId: data.orderId,
              paymentMode: "mock",
              payableAmount: data.payableAmount,
              paymentRedirectUrl: data.qrisImageUrl || "/assets/payment/qris.png",
              paymentAmount: session.price,
            });
          }
        } else {
          setPaymentActive(false);
          setErrorMsg(data.error || "PEMBAYARAN SEDANG BERMASALAH. SILAKAN HUBUNGI OPERATOR.");
        }
      } catch (e) {
        console.error("Failed to init payment", e);
        setPaymentActive(false);
        setErrorMsg("PEMBAYARAN SEDANG BERMASALAH. SILAKAN HUBUNGI OPERATOR.");
      } finally {
        setIsInitializing(false);
      }
    };

    initPayment();
  }, [hasHydrated, session?.sessionId, session?.price, session?.packageId, session?.packageName, session?.paymentOrderId, session?.paymentMode, setPaymentData]);

  // Polling for payment status
  useEffect(() => {
    if (!paymentActive || !session?.paymentOrderId) return;

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/payment/status?orderId=${encodeURIComponent(session.paymentOrderId!)}`);
        const data = await res.json();
        if (data.ok && data.status) {
          if (data.status === "confirmed") {
            if (hasRoutedRef.current) return;
            hasRoutedRef.current = true;
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setPaymentStatus("confirmed");
            router.push("/frames");
          } else if (data.status === "failed" || data.status === "cancelled" || data.status === "timeout" || data.status === "expired") {
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

  const handleTimeout = async () => {
    if (session?.paymentOrderId) {
      try {
        const res = await fetch("/api/payment/expire", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: session.paymentOrderId }),
        });
        const data = await res.json();
        if (data.ok && data.status === "confirmed") {
          if (hasRoutedRef.current) return;
          hasRoutedRef.current = true;
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setPaymentStatus("confirmed");
          router.push("/frames");
          return;
        }
      } catch (e) {
        console.error("Failed to expire payment on timeout", e);
      }
    }
    setPaymentStatus("timeout");
  };

  const basePrice = session?.price ?? 0;

  return (
    <KioskStage>
      <QrScreen 
        title={paymentActive ? "SCAN UNTUK BAYAR" : "PAYMENT ERROR"} 
        initialSeconds={120} 
        completionText="PAYMENT TIMEOUT" 
        onComplete={handleTimeout} 
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
                : isMidtransMode
                  ? !qrisConfigured ? (
                    <div style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#222', color: '#ffaa00', borderRadius: '8px', textAlign: 'center', padding: '15px'}}>
                      <span style={{fontSize: '36px'}}>⚠️</span>
                      <span style={{marginTop: '10px', fontSize: '14px', fontWeight: 'bold'}}>Gagal memuat QRIS Midtrans.</span>
                    </div>
                  ) : (
                    <img 
                      src={session?.paymentRedirectUrl || `/api/payment/qris?orderId=${encodeURIComponent(session?.paymentOrderId || "")}`} 
                      alt="Midtrans QRIS" 
                      style={{width: '100%', height: '100%', objectFit: 'contain', background: '#fff', padding: '10px', borderRadius: '8px'}}
                      onError={() => setQrisConfigured(false)}
                    />
                  )
                : <ResultQrCode value={paymentUrl} /> 
              : <div style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#222', color: '#aaa', borderRadius: '8px', textAlign: 'center', padding: '15px'}}>
                  <span style={{fontSize: '48px'}}>⚠️</span>
                  <span style={{marginTop: '10px', fontSize: '14px', color: '#ffaa00', fontWeight: 'bold'}}>
                    {errorMsg || "PEMBAYARAN SEDANG BERMASALAH. SILAKAN HUBUNGI OPERATOR."}
                  </span>
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
        ) : isMidtransMode ? (
          <div>
            <div style={{fontSize: '16px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold'}}>{session?.packageName}</div>
            <div style={{fontSize: '28px', fontWeight: 'bold', color: '#2ecc71', marginTop: '6px'}}>
              TOTAL: Rp {basePrice.toLocaleString("id-ID")}
            </div>
          </div>
        ) : (
          <div>{session?.packageName} - Rp {basePrice.toLocaleString("id-ID")}</div>
        )}

        {!paymentActive && !isInitializing && !errorMsg && (
          <div style={{fontSize: 16, opacity: 0.7, marginTop: 10}}>
            {process.env.NEXT_PUBLIC_PAYMENT_DEBUG === "true" 
              ? "(Manual debug mode)" 
              : "Payment gateway is disabled. Enable Midtrans or debug fallback to continue."}
          </div>
        )}
      </div>

      {isOperatorMode && (
        <div className="payment-operator-status">
          <span
            style={{
              color:
                session?.paymentStatus === 'cancelled' ||
                session?.paymentStatus === 'expired' ||
                session?.paymentStatus === 'timeout' ||
                session?.paymentStatus === 'failed'
                  ? '#e74c3c'
                  : '#2ecc71',
              letterSpacing: '0.5px',
            }}
          >
            {session?.paymentStatus === 'cancelled'
              ? 'TRANSAKSI DIBATALKAN'
              : session?.paymentStatus === 'expired' || session?.paymentStatus === 'timeout'
                ? 'TRANSAKSI KEDALUWARSA'
                : session?.paymentStatus === 'failed'
                  ? 'PEMBAYARAN GAGAL'
                  : 'MENUNGGU KONFIRMASI OPERATOR'}
          </span>
        </div>
      )}

      {isMidtransMode && (
        <div className="payment-operator-status">
          <span
            style={{
              color:
                session?.paymentStatus === 'cancelled' ||
                session?.paymentStatus === 'expired' ||
                session?.paymentStatus === 'timeout' ||
                session?.paymentStatus === 'failed'
                  ? '#e74c3c'
                  : '#2ecc71',
              letterSpacing: '0.5px',
              fontSize: '13px',
            }}
          >
            {session?.paymentStatus === 'cancelled'
              ? 'TRANSAKSI DIBATALKAN'
              : session?.paymentStatus === 'expired' || session?.paymentStatus === 'timeout'
                ? 'TRANSAKSI KEDALUWARSA'
                : session?.paymentStatus === 'failed'
                  ? 'PEMBAYARAN GAGAL'
                  : 'SCAN QRIS DENGAN GOPAY, OVO, DANA, BCA, ATAU MOBILE BANKING'}
          </span>
        </div>
      )}
      
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