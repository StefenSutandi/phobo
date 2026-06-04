"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/lib/session/session-store";

function Field({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="admin-card">
      <strong>{label}</strong>
      <p>{value || "-"}</p>
    </div>
  );
}

export default function Admin() {
  const router = useRouter();
  const {
    session,
    setPaymentStatus,
    resetSession,
    clearCapturedPhotos,
    setPrintStatus,
  } = useSessionStore();

  async function mockPrintResult() {
    if (!session?.sessionId || !session.finalImageUrl) {
      return;
    }

    setPrintStatus("queued");

    try {
      const response = await fetch("/api/printer/print", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: session.sessionId,
          resultUrl: session.finalImageUrl,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean };

      setPrintStatus(response.ok && payload.ok ? "printed" : "failed");
    } catch {
      setPrintStatus("failed");
    }
  }

  return (
    <main className="admin-page">
      <div className="admin-header">
        <div>
          <span className="mock-badge">MOCK</span>
          <h1>Admin Dashboard</h1>
        </div>
        <Link href="/" className="admin-button">
          Exit Admin
        </Link>
      </div>

      <section className="admin-card">
        <h2>Current Session</h2>
        <div className="admin-grid">
          <Field label="Session ID" value={session?.sessionId} />
          <Field label="Selected Package" value={session?.selectedPackageId} />
          <Field label="Payment Status" value={session?.paymentStatus} />
          <Field label="Selected Frame" value={session?.selectedFrameId} />
          <Field label="Selected Background" value={session?.selectedBackgroundId} />
          <Field label="Captured Photo Count" value={session?.capturedPhotos.length ?? 0} />
          <Field label="Final Image URL" value={session?.finalImageUrl} />
          <Field label="Drive URL" value={session?.driveUrl} />
          <Field label="Print Status" value={session?.printStatus} />
          <Field label="Created At" value={session?.createdAt} />
          <Field label="Updated At" value={session?.updatedAt} />
        </div>
        {session?.finalImageUrl && (
          <p>
            <a href={session.finalImageUrl} target="_blank" rel="noreferrer">
              Open saved result
            </a>
          </p>
        )}
      </section>

      <section className="admin-card">
        <h2>Session Controls</h2>
        <div className="admin-action-row">
          <button type="button" className="admin-action" onClick={() => setPaymentStatus("confirmed")}>
            Confirm Payment
          </button>
          <button type="button" className="admin-action" onClick={() => setPaymentStatus("failed")}>
            Fail Payment
          </button>
          <button type="button" className="admin-action admin-action--muted" onClick={resetSession}>
            Reset Session
          </button>
          <button type="button" className="admin-action admin-action--muted" onClick={clearCapturedPhotos}>
            Clear Captured Photos
          </button>
          <button
            type="button"
            className="admin-action"
            onClick={mockPrintResult}
            disabled={!session?.finalImageUrl}
          >
            Mock Print Result
          </button>
          <button
            type="button"
            className="admin-action"
            onClick={() => {
              if (session?.finalImageUrl) {
                window.open(session.finalImageUrl, "_blank", "noopener,noreferrer");
              }
            }}
            disabled={!session?.finalImageUrl}
          >
            Open Result
          </button>
        </div>
      </section>

      <section className="admin-card">
        <h2>Navigation</h2>
        <div className="admin-action-row">
          <button type="button" className="admin-action" onClick={() => router.push("/")}>
            Go to Landing
          </button>
          <button type="button" className="admin-action" onClick={() => router.push("/payment")}>
            Go to Payment
          </button>
          <button type="button" className="admin-action" onClick={() => router.push("/camera")}>
            Go to Camera
          </button>
          <button type="button" className="admin-action" onClick={() => router.push("/result")}>
            Go to Result
          </button>
        </div>
      </section>
    </main>
  );
}
