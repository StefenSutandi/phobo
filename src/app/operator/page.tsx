"use client";
import { useEffect, useState } from "react";

export default function OperatorPage() {
  const [pin, setPin] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);

  // Ambil data transaksi yang pending
  const fetchPending = async () => {
    try {
      const res = await fetch("/api/operator/pending");
      const data = await res.json();
      if (data.ok) setPendingPayments(data.data);
    } catch (e) {
      console.error("Gagal mengambil data", e);
    }
  };

  // Polling data transaksi setiap 3 detik jika sudah login
  useEffect(() => {
    if (!isAuthorized) return;
    fetchPending();
    const interval = setInterval(fetchPending, 3000);
    return () => clearInterval(interval);
  }, [isAuthorized]);

  const handleVerify = async (orderId: string) => {
    setIsVerifying(true);
    try {
      const res = await fetch("/api/operator/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, pin }),
      });
      const data = await res.json();
      
      if (data.ok) {
        alert("Pembayaran berhasil diverifikasi!");
        fetchPending(); // Refresh list segera
      } else {
        alert(data.error || "Gagal memverifikasi");
      }
    } catch (e) {
      alert("Terjadi kesalahan sistem");
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div style={{ padding: "50px", textAlign: "center", fontFamily: "sans-serif" }}>
        <h2>Login Operator Photobooth</h2>
        <input 
          type="password" 
          placeholder="Masukkan PIN" 
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          style={{ padding: "10px", fontSize: "16px", marginBottom: "10px" }}
        />
        <br />
        <button 
          onClick={() => setIsAuthorized(true)}
          style={{ padding: "10px 20px", fontSize: "16px", cursor: "pointer" }}
        >
          Masuk
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "30px", fontFamily: "sans-serif", maxWidth: "800px", margin: "0 auto" }}>
      <h2>Daftar Antrean Pembayaran</h2>
      {pendingPayments.length === 0 ? (
        <p>Belum ada pelanggan yang sedang melakukan pembayaran.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          {pendingPayments.map((payment) => (
            <div key={payment.orderId} style={{ border: "1px solid #ccc", padding: "15px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: "bold", fontSize: "18px" }}>{payment.orderId}</div>
                <div style={{ color: "#555" }}>Paket: {payment.packageName}</div>
                <div style={{ fontSize: "20px", color: "#2ecc71", marginTop: "5px" }}>
                  Rp {payment.amount.toLocaleString("id-ID")}
                </div>
              </div>
              <button 
                onClick={() => handleVerify(payment.orderId)}
                disabled={isVerifying}
                style={{ 
                  backgroundColor: "#3498db", 
                  color: "white", 
                  border: "none", 
                  padding: "15px 25px", 
                  borderRadius: "5px", 
                  fontSize: "16px",
                  cursor: isVerifying ? "not-allowed" : "pointer",
                  fontWeight: "bold"
                }}
              >
                {isVerifying ? "Memproses..." : "Pembayaran Berhasil"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}