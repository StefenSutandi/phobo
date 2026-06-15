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
    printerMode?: string;
    printerNameConfigured?: boolean;
  };
};

type CaptureResult = {
  ok: boolean;
  mode?: "mock" | "command";
  imageUrl?: string;
  localFilePath?: string;
  error?: string;
};

type PrintTemplateResult = {
  ok: boolean;
  printUrl?: string;
  localFilePath?: string;
  error?: string;
};

type PrintResult = {
  ok: boolean;
  mode?: "mock" | "windows";
  message?: string;
  jobId?: string;
  error?: string;
};

export default function Admin() {
  const router = useRouter();
  const {
    session,
    setPaymentStatus,
    resetSession,
    clearCapturedPhotos,
    setPrintImageUrl,
    setPrintStatus,
  } = useSessionStore();
  const [cameraMode, setCameraMode] = useState("mock");
  const [cameraCommandConfigured, setCameraCommandConfigured] = useState(false);
  const [printerMode, setPrinterMode] = useState("mock");
  const [printerNameConfigured, setPrinterNameConfigured] = useState(false);
  const [cameraResult, setCameraResult] = useState<CaptureResult | null>(null);
  const [printTemplateResult, setPrintTemplateResult] = useState<PrintTemplateResult | null>(null);
  const [printResult, setPrintResult] = useState<PrintResult | null>(null);
  const [isTestingCamera, setIsTestingCamera] = useState(false);
  const [isGeneratingPrint, setIsGeneratingPrint] = useState(false);
  const [isTestingPrint, setIsTestingPrint] = useState(false);

  useEffect(() => {
    async function loadDiagnostics() {
      try {
        const response = await fetch("/api/diagnostics");
        const payload = (await response.json()) as DiagnosticsResponse;

        setCameraMode(payload.env?.cameraMode || "mock");
        setCameraCommandConfigured(Boolean(payload.env?.cameraCommandConfigured));
        setPrinterMode(payload.env?.printerMode || "mock");
        setPrinterNameConfigured(Boolean(payload.env?.printerNameConfigured));
      } catch {
        setCameraMode("unknown");
        setPrinterMode("unknown");
      }
    }

    loadDiagnostics();
  }, []);

  async function mockPrintResult() {
    if (!session?.sessionId || !session.printImageUrl) {
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
          printUrl: session.printImageUrl,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean };

      setPrintResult(payload as PrintResult);
      setPrintStatus(response.ok && payload.ok ? "printed" : "failed");
    } catch {
      setPrintResult({
        ok: false,
        error: "Print request failed",
      });
      setPrintStatus("failed");
    }
  }

  async function generatePrintFile() {
    if (!session?.sessionId) {
      setPrintTemplateResult({
        ok: false,
        error: "No active session",
      });
      return;
    }

    setIsGeneratingPrint(true);
    setPrintTemplateResult(null);

    try {
      const response = await fetch("/api/results/print-template", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: session.sessionId,
          finalImageUrl: session.finalImageUrl,
          capturedPhotos: session.capturedPhotos,
          selectedFrameId: session.selectedFrameId,
          selectedBackgroundId: session.selectedBackgroundId,
        }),
      });
      const payload = (await response.json()) as PrintTemplateResult;

      setPrintTemplateResult(payload);

      if (response.ok && payload.ok && payload.printUrl) {
        setPrintImageUrl(payload.printUrl);
      }
    } catch {
      setPrintTemplateResult({
        ok: false,
        error: "Print file request failed",
      });
    } finally {
      setIsGeneratingPrint(false);
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
          <Field label="Print Image URL" value={session?.printImageUrl} />
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
          <Field label="Printer Mode" value={printerMode} />
          <Field
            label="Printer Configured"
            value={printerNameConfigured ? "yes" : "no"}
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
            onClick={generatePrintFile}
            disabled={!session?.sessionId || isGeneratingPrint}
          >
            {isGeneratingPrint ? "Generating Print File..." : "Generate Print File"}
          </button>
          <button
            type="button"
            className="admin-action"
            onClick={() => {
              if (session?.printImageUrl) {
                window.open(session.printImageUrl, "_blank", "noopener,noreferrer");
              }
            }}
            disabled={!session?.printImageUrl}
          >
            Open Print File
          </button>
          <button
            type="button"
            className="admin-action"
            onClick={async () => {
              setIsTestingPrint(true);
              setPrintResult(null);
              await mockPrintResult();
              setIsTestingPrint(false);
            }}
            disabled={!session?.printImageUrl || isTestingPrint}
          >
            {isTestingPrint ? "Testing Print..." : "Test Print"}
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
        {printTemplateResult && (
          <div className="admin-result">
            <p>Print file result: {printTemplateResult.ok ? "success" : "failed"}</p>
            {printTemplateResult.printUrl && <p>Print URL: {printTemplateResult.printUrl}</p>}
            {printTemplateResult.localFilePath && <p>Local file: {printTemplateResult.localFilePath}</p>}
            {printTemplateResult.error && <p>Error: {printTemplateResult.error}</p>}
          </div>
        )}
        {printResult && (
          <div className="admin-result">
            <p>Print result: {printResult.ok ? "success" : "failed"}</p>
            <p>Mode: {printResult.mode || printerMode}</p>
            {printResult.message && <p>Message: {printResult.message}</p>}
            {printResult.jobId && <p>Job ID: {printResult.jobId}</p>}
            {printResult.error && <p>Error: {printResult.error}</p>}
          </div>
        )}
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
