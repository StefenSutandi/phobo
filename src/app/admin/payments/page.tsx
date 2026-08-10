"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type OperatorPaymentOrder = {
  orderId: string;
  sessionId: string;
  paymentPurpose: "main-package" | "add-print";
  baseAmount: number;
  uniqueCode: number;
  payableAmount: number;
  status: "pending" | "confirmed" | "cancelled" | "expired";
  createdAt: string;
  expiresAt: string;
  confirmedAt?: string;
};

function formatAge(createdAt: string): string {
  const diffMs = new Date().getTime() - new Date(createdAt).getTime();
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);
  if (mins === 0) return `${secs}d lalu`;
  return `${mins}m ${secs}d lalu`;
}

export default function OperatorPaymentsPage() {
  const [pin, setPin] = useState("");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [orders, setOrders] = useState<OperatorPaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/payment/operator/auth");
      const data = await res.json();
      setAuthenticated(data.authenticated === true);
    } catch (err) {
      setAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    try {
      const res = await fetch("/api/payment/operator/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.ok) {
        setAuthenticated(true);
        setPin("");
      } else {
        setErrorMsg(data.error || "PIN Operator salah.");
      }
    } catch (err) {
      setErrorMsg("Gagal menghubungi server auth.");
    }
  };

  const handleLogout = async () => {
    await fetch("/api/payment/operator/auth", { method: "DELETE" });
    setAuthenticated(false);
  };

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/payment/operator/orders");
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      const data = await res.json();
      if (data.ok && Array.isArray(data.orders)) {
        setOrders(data.orders);
      }
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;

    fetchOrders();
    const interval = setInterval(fetchOrders, 2000);
    return () => clearInterval(interval);
  }, [authenticated, fetchOrders]);

  const handleAction = async (orderId: string, action: "confirm" | "cancel") => {
    setActionBusy(orderId);
    try {
      const res = await fetch("/api/payment/operator/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action }),
      });
      const data = await res.json();
      if (data.ok) {
        await fetchOrders();
      } else {
        alert(data.error || "Action failed");
      }
    } catch (err) {
      alert("Network error executing action");
    } finally {
      setActionBusy(null);
    }
  };

  if (authenticated === null) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#0f0f12", color: "#fff", display: "grid", placeItems: "center" }}>
        Memeriksa sesi operator...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#0f0f12", color: "#fff", display: "grid", placeItems: "center", fontFamily: "system-ui, -apple-system, sans-serif", padding: "20px" }}>
        <form onSubmit={handleLogin} style={{ backgroundColor: "#1c1c22", padding: "32px", borderRadius: "16px", border: "1px solid #333340", width: "100%", maxWidth: "380px", textAlign: "center", boxShadow: "0 8px 30px rgba(0,0,0,0.5)" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>🔐</div>
          <h1 style={{ fontSize: "22px", margin: "0 0 8px 0" }}>Phobo Operator</h1>
          <p style={{ color: "#aaa", fontSize: "13px", marginBottom: "20px" }}>Verifikasi PIN Server Operator</p>
          <input
            type="password"
            placeholder="Masukkan PIN Operator"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            style={{ width: "100%", padding: "14px", fontSize: "20px", borderRadius: "10px", border: "1px solid #444", backgroundColor: "#282832", color: "#fff", marginBottom: "15px", textAlign: "center", letterSpacing: "4px" }}
            autoFocus
          />
          {errorMsg && <p style={{ color: "#ff5252", fontSize: "13px", marginBottom: "15px", fontWeight: "bold" }}>{errorMsg}</p>}
          <button
            type="submit"
            style={{ width: "100%", padding: "14px", fontSize: "16px", fontWeight: "bold", borderRadius: "10px", backgroundColor: "#2ecc71", color: "#fff", border: "none", cursor: "pointer" }}
          >
            MASUK PANEL
          </button>
        </form>
      </div>
    );
  }

  const pendingOrders = orders.filter((o) => o.status === "pending");
  const displayedOrders = filter === "pending" ? pendingOrders : orders;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0f0f12", color: "#f1f1f1", fontFamily: "system-ui, -apple-system, sans-serif", padding: "16px", maxWidth: "800px", margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid #222", paddingBottom: "16px" }}>
        <div>
          <h1 style={{ fontSize: "20px", margin: 0, color: "#fff", display: "flex", alignItems: "center", gap: "10px" }}>
            <span>💳 Dashboard Pembayaran Operator</span>
          </h1>
          <p style={{ margin: "4px 0 0 0", color: "#888", fontSize: "13px" }}>Phobo LAN Static QRIS & Unique Amount Verification</p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Link href="/admin" style={{ padding: "8px 12px", background: "#222", color: "#ccc", borderRadius: "8px", textDecoration: "none", fontSize: "12px" }}>
            Admin
          </Link>
          <button
            onClick={handleLogout}
            style={{ padding: "8px 12px", background: "#2c1c1c", color: "#ff6b6b", border: "1px solid #522", borderRadius: "8px", cursor: "pointer", fontSize: "12px" }}
          >
            Keluar
          </button>
        </div>
      </header>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button
          onClick={() => setFilter("pending")}
          style={{
            flex: 1,
            padding: "14px",
            borderRadius: "10px",
            fontWeight: "bold",
            fontSize: "15px",
            border: "none",
            cursor: "pointer",
            background: filter === "pending" ? "#e67e22" : "#1c1c24",
            color: filter === "pending" ? "#fff" : "#aaa",
          }}
        >
          PENDING ({pendingOrders.length})
        </button>
        <button
          onClick={() => setFilter("all")}
          style={{
            flex: 1,
            padding: "14px",
            borderRadius: "10px",
            fontWeight: "bold",
            fontSize: "15px",
            border: "none",
            cursor: "pointer",
            background: filter === "all" ? "#3498db" : "#1c1c24",
            color: filter === "all" ? "#fff" : "#aaa",
          }}
        >
          RIWAYAT SEMUA ({orders.length})
        </button>
      </div>

      {loading && orders.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>Memuat daftar transaksi...</div>
      ) : displayedOrders.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", background: "#16161a", borderRadius: "16px", border: "1px dashed #333" }}>
          <span style={{ fontSize: "40px" }}>✅</span>
          <p style={{ fontSize: "18px", color: "#bbb", margin: "15px 0 5px 0" }}>Tidak ada transaksi pending saat ini</p>
          <p style={{ fontSize: "13px", color: "#666" }}>Layar kiosk akan otomatis muncul di sini saat customer melakukan checkout.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {displayedOrders.map((order) => {
            const isPending = order.status === "pending";
            const isConfirmed = order.status === "confirmed";
            const isCancelled = order.status === "cancelled";
            const isExpired = order.status === "expired";
            const formattedSuffix = order.uniqueCode.toString().padStart(3, "0");

            return (
              <div
                key={order.orderId}
                style={{
                  background: isPending ? "#1a1a24" : "#141418",
                  border: isPending ? "2px solid #e67e22" : "1px solid #282830",
                  borderRadius: "16px",
                  padding: "20px",
                  boxShadow: isPending ? "0 4px 20px rgba(230, 126, 34, 0.15)" : "none",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                  <div>
                    <span style={{ fontSize: "11px", background: order.paymentPurpose === "add-print" ? "#8e44ad" : "#2980b9", color: "#fff", padding: "3px 8px", borderRadius: "6px", fontWeight: "bold", letterSpacing: "1px", textTransform: "uppercase" }}>
                      {order.paymentPurpose === "add-print" ? "ADDITIONAL PRINT" : "MAIN PACKAGE"}
                    </span>
                    <h2 style={{ fontFamily: "monospace", fontSize: "22px", margin: "8px 0 0 0", letterSpacing: "2px", color: "#fff" }}>
                      {order.orderId}
                    </h2>
                  </div>
                  <span
                    style={{
                      padding: "6px 12px",
                      borderRadius: "20px",
                      fontSize: "12px",
                      fontWeight: "bold",
                      textTransform: "uppercase",
                      background: isConfirmed ? "#2ecc71" : isCancelled || isExpired ? "#e74c3c" : "#f39c12",
                      color: isConfirmed || isCancelled || isExpired ? "#fff" : "#111",
                    }}
                  >
                    {order.status}
                  </span>
                </div>

                <div style={{ background: "#101014", padding: "16px", borderRadius: "12px", margin: "14px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: "13px", color: "#aaa" }}>TOTAL HARUS DIBAYAR:</span>
                    <span style={{ fontSize: "13px", color: "#e67e22", fontWeight: "bold" }}>
                      UNIQUE: {formattedSuffix}
                    </span>
                  </div>
                  <div style={{ fontSize: "32px", fontWeight: "900", color: "#2ecc71", margin: "4px 0" }}>
                    Rp {order.payableAmount.toLocaleString("id-ID")}
                  </div>
                  <div style={{ fontSize: "12px", color: "#888" }}>
                    (Harga Dasar: Rp {order.baseAmount.toLocaleString("id-ID")} + Kode {formattedSuffix})
                  </div>
                </div>

                <div style={{ fontSize: "12px", color: "#888", marginBottom: "16px" }}>
                  Dibuat {formatAge(order.createdAt)} • {new Date(order.createdAt).toLocaleTimeString("id-ID")}
                </div>

                {isPending && (
                  <div style={{ display: "flex", gap: "12px" }}>
                    <button
                      onClick={() => handleAction(order.orderId, "confirm")}
                      disabled={actionBusy === order.orderId}
                      style={{
                        flex: 2,
                        padding: "16px",
                        borderRadius: "12px",
                        background: "#2ecc71",
                        color: "#ffffff",
                        border: "none",
                        fontWeight: "bold",
                        fontSize: "18px",
                        cursor: "pointer",
                        boxShadow: "0 4px 14px rgba(46, 204, 113, 0.4)",
                      }}
                    >
                      {actionBusy === order.orderId ? "MEMPROSES..." : "✓ CONFIRM PAID"}
                    </button>
                    <button
                      onClick={() => handleAction(order.orderId, "cancel")}
                      disabled={actionBusy === order.orderId}
                      style={{
                        flex: 1,
                        padding: "16px",
                        borderRadius: "12px",
                        background: "#2a1a1a",
                        color: "#ff6b6b",
                        border: "1px solid #ff6b6b",
                        fontWeight: "bold",
                        fontSize: "16px",
                        cursor: "pointer",
                      }}
                    >
                      CANCEL
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
