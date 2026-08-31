"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { KioskStage, QrScreen } from "@/components/kiosk";
import { ResultQrCode } from "@/components/kiosk/ResultQrCode";
import { useSessionStore } from "@/lib/session/session-store";
import { getPhotoRawUrl } from "@/lib/session/session-types";

export default function AddPrintPayment() {
  const router = useRouter(); 
  const {
    session,
    hasHydrated,
    setAddPrintPaymentStatus,
    setAddPrintPaymentData,
    setAdditionalPrintImageUrl,
    setAdditionalPrintStatus,
    setAdditionalPrintCommitted,
  } = useSessionStore(); 
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

  // Once paid, automatically compose and print once, then transition to closing
  useEffect(() => {
    if (
      session?.addPrintPaymentStatus === "paid" &&
      !session?.additionalPrintCommitted &&
      session?.additionalPrintStatus !== "composing" &&
      session?.additionalPrintStatus !== "queued" &&
      session?.additionalPrintStatus !== "printed" &&
      session?.additionalPrintStatus !== "failed" &&
      !busy
    ) {
      setBusy(true);
      setAdditionalPrintCommitted(true);
      setAdditionalPrintStatus("composing");
      setMsg("PEMBAYARAN DITERIMA — MEMBUAT FILE CETAK...");

      const executeAutoAddPrint = async () => {
        try {
          const slotAssignments = Array.isArray(session.additionalPhotoSlotAssignments)
            ? session.additionalPhotoSlotAssignments.map((photoIdx, slotIdx) => {
                const photoObj = photoIdx !== null && photoIdx !== undefined ? session.capturedPhotos[photoIdx] : null;
                return {
                  slotIndex: slotIdx,
                  photoRaw: getPhotoRawUrl(photoObj),
                  backgroundId:
                    photoObj && typeof photoObj === "object" && photoObj.backgroundId
                      ? photoObj.backgroundId
                      : session.selectedBackgroundId || "background-01",
                };
              })
            : undefined;

          // 1. Compose additional asset
          const composeRes = await fetch("/api/results/compose-additional", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: session.sessionId,
              capturedPhotos: session.capturedPhotos,
              additionalFrameId: session.additionalFrameId,
              selectedBackgroundId: session.selectedBackgroundId,
              slotAssignments,
              stickers: session.additionalStickers || [],
              options: session.greenScreenTuning,
            }),
          });
          const composeData = await composeRes.json();
          if (!composeRes.ok || !composeData.ok || !composeData.printImageUrl) {
            throw new Error(composeData.error || "Gagal membuat gambar cetak tambahan");
          }

          setAdditionalPrintImageUrl(composeData.printImageUrl);
          setAdditionalPrintStatus("queued");
          setMsg("MENGIRIM KE PRINTER...");

          // 2. Queue exactly one physical print job
          const printRes = await fetch("/api/printer/print", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: session.sessionId,
              printUrl: composeData.printImageUrl,
            }),
          });
          const printData = await printRes.json();
          if (!printRes.ok || !printData.ok) {
            throw new Error(printData.error || printData.message || "Gagal mencetak foto tambahan");
          }

          setAdditionalPrintStatus("printed");
          setMsg("PRINT ACCEPTED! SELESAI...");

          // 3. Smooth transition to closing
          setTimeout(() => {
            router.replace("/closing");
          }, 1500);
        } catch (e) {
          setAdditionalPrintStatus("failed");
          setMsg(e instanceof Error ? e.message : "PROSES CETAK GAGAL");
        } finally {
          setBusy(false);
        }
      };

      executeAutoAddPrint();
    }
  }, [
    session?.addPrintPaymentStatus,
    session?.additionalPrintCommitted,
    session?.additionalPrintStatus,
    session?.sessionId,
    session?.capturedPhotos,
    session?.additionalPhotoSlotAssignments,
    session?.additionalFrameId,
    session?.selectedBackgroundId,
    session?.additionalStickers,
    session?.greenScreenTuning,
    busy,
    setAdditionalPrintCommitted,
    setAdditionalPrintStatus,
    setAdditionalPrintImageUrl,
    router,
  ]);

  const basePrice = 20000;
  const isPaid = session?.addPrintPaymentStatus === "paid";

  return (
    <KioskStage>
      {isPaid ? (
        <>
          <h1 className="qr-title">PEMBAYARAN DITERIMA</h1>
          <div className="add-payment-paid-container">
            <span style={{ fontSize: "54px" }}>🖨️</span>
            <div className="add-payment-paid-title">PEMBAYARAN DITERIMA</div>
            <div className="add-payment-paid-subtitle">
              {session?.additionalPrintStatus === "printed" ? "SELESAI!" : "MEMPROSES CETAK..."}
            </div>
            {msg && (
              <div style={{ fontSize: "14px", color: msg.includes("GAGAL") || msg.includes("FAILED") ? "#ff6b6b" : "#2ecc71" }}>
                {msg}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <QrScreen 
            title={paymentActive ? "SCAN UNTUK BAYAR" : "PAYMENT DISABLED"} 
            initialSeconds={120} 
            completionText="PAYMENT TIMEOUT" 
            onComplete={() => {
              const isPaidOrCommitted = Boolean(
                session?.addPrintPaymentStatus === "paid" ||
                session?.additionalPrintCommitted ||
                session?.additionalPrintStatus === "composing" ||
                session?.additionalPrintStatus === "queued" ||
                session?.additionalPrintStatus === "printed"
              );
              if (!isPaidOrCommitted) {
                setAddPrintPaymentStatus("failed");
                router.push("/result");
              }
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

          <div className="add-payment-meta">
            <div className="add-payment-meta-title">ADDITIONAL PRINT</div>
            <div className="add-payment-meta-price">
              TOTAL Rp {basePrice.toLocaleString("id-ID")}
            </div>
          </div>

          {isOperatorMode && (
            <div className="add-payment-status">
              MENUNGGU KONFIRMASI OPERATOR
            </div>
          )}

          {session?.addPrintPaymentOrderId && (
            <div className="add-payment-order-id">
              Order ID: <span>{session.addPrintPaymentOrderId}</span> • Simpan ID ini jika terjadi kendala
            </div>
          )}
        </>
      )}
    </KioskStage>
  );
}
