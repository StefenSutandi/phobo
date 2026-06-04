"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { KioskStage, QrScreen } from "@/components/kiosk";
import { useSessionStore } from "@/lib/session/session-store";

export default function Payment() {
  const router = useRouter();
  const { session, hasHydrated, setPaymentStatus } = useSessionStore();

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (!session?.selectedPackageId) {
      router.replace("/packages");
      return;
    }

    if (session.paymentStatus === "idle") {
      setPaymentStatus("pending");
    }
  }, [hasHydrated, router, session?.paymentStatus, session?.selectedPackageId, setPaymentStatus]);

  function confirmPayment() {
    setPaymentStatus("confirmed");
    router.push("/frames");
  }

  return (
    <KioskStage>
      <QrScreen
        title="SCAN FOR PAYMENT"
        initialSeconds={120}
        completionText="PAYMENT TIMEOUT"
        onComplete={() => setPaymentStatus("timeout")}
      />
      <button type="button" className="dev-control" onClick={confirmPayment}>
        DEV CONFIRM PAYMENT
      </button>
      {session?.paymentStatus && (
        <p className="dev-note">Payment status: {session.paymentStatus}</p>
      )}
    </KioskStage>
  );
}
