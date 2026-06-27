"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { KioskStage, QrScreen } from "@/components/kiosk";
import { ResultQrCode } from "@/components/kiosk/ResultQrCode";
import { useSessionStore } from "@/lib/session/session-store";

export default function Payment() {
  const router = useRouter(); 
  const { session, hasHydrated, setPaymentStatus } = useSessionStore(); 
  const paymentUrl = process.env.NEXT_PUBLIC_PHOTOBO_PAYMENT_URL || "https://payment.invalid/phobo-demo";

  useEffect(() => { 
    if (hasHydrated && !session?.selectedPackageId) router.replace("/packages"); 
  }, [hasHydrated, session?.selectedPackageId, router]);

  return (
    <KioskStage>
      <QrScreen 
        title="SCAN FOR PAYMENT" 
        initialSeconds={120} 
        completionText="PAYMENT TIMEOUT" 
        onComplete={() => setPaymentStatus("timeout")} 
        qrContent={<ResultQrCode value={paymentUrl} />} 
      />
      <div className="payment-summary">
        {session?.packageName} - Rp. {(session?.price ?? 0).toLocaleString("id-ID")},00
      </div>
      <button 
        className="operator-confirm" 
        onClick={() => {
          setPaymentStatus("confirmed");
          router.push("/frames");
        }}
      >
        CONFIRM PAYMENT
      </button>
    </KioskStage>
  );
}
