"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSessionStore } from "@/lib/session/session-store";

function Field({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="admin-card">
      <strong>{label}</strong>
      <p>{value || "-"}</p>
    </div>
  );
}

type DiagnosticsResponse = {
  env?: {
    cameraMode?: string;
    cameraCommandConfigured?: boolean;
  };
};

type CaptureResult = {
  ok: boolean;
  mode?: "mock" | "command";
  imageUrl?: string;
  localFilePath?: string;
  error?: string;
};

export default function Admin() {
  const router = useRouter();
  const {
    session,
    setPaymentStatus,
    resetSession,
    clearCapturedPhotos,
    setPrintStatus,
  } = useSessionStore();
  const [cameraMode, setCameraMode] = useState("mock");
  const [cameraCommandConfigured, setCameraCommandConfigured] = useState(false);
  const [cameraResult, setCameraResult] = useState<CaptureResult | null>(null);
  const [isTestingCamera, setIsTestingCamera] = useState(false);

  useEffect(() => {
    async function loadDiagnostics() {
      try {
        const response = await fetch("/api/diagnostics");
        const payload = (await response.json()) as DiagnosticsResponse;

        setCameraMode(payload.env?.cameraMode || "mock");
        setCameraCommandConfigured(Boolean(payload.env?.cameraCommandConfigured));
      } catch {
        setCameraMode("unknown");
      }
    }

    loadDiagnostics();
  }, []);

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

  async function testCameraCapture() {
    const testSessionId = session?.sessionId || `admin-test-${Date.now()}`;

    setIsTestingCamera(true);
    setCameraResult(null);

    try {
      const response = await fetch("/api/camera/capture", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: testSessionId,
        }),
      });
      const payload = (await response.json()) as CaptureResult;

      setCameraResult(payload);
    } catch {
      setCameraResult({
        ok: false,
        error: "Camera capture request failed",
      });
    } finally {
      setIsTestingCamera(false);
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
        <h2>Camera Capture</h2>
        <div className="admin-grid">
          <Field label="Camera Mode" value={cameraMode} />
          <Field
            label="Command Configured"
            value={cameraCommandConfigured ? "yes" : "no"}
          />
        </div>
        <div className="admin-action-row">
          <button
            type="button"
            className="admin-action"
            onClick={testCameraCapture}
            disabled={isTestingCamera}
          >
            {isTestingCamera ? "Testing Camera..." : "Test Camera Capture"}
          </button>
          {cameraResult?.ok && cameraResult.imageUrl && (
            <a
              href={cameraResult.imageUrl}
              target="_blank"
              rel="noreferrer"
              className="admin-action"
            >
              Open Captured Image
            </a>
          )}
        </div>
        {cameraResult && (
          <div className="admin-result">
            <p>Last capture result: {cameraResult.ok ? "success" : "failed"}</p>
            <p>Mode: {cameraResult.mode || cameraMode}</p>
            {cameraResult.imageUrl && <p>Image URL: {cameraResult.imageUrl}</p>}
            {cameraResult.localFilePath && <p>Local file: {cameraResult.localFilePath}</p>}
            {cameraResult.error && <p>Last capture error: {cameraResult.error}</p>}
          </div>
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
