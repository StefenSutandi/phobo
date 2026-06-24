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
  sourceFilePath?: string;
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

type ComposeResult = {
  ok: boolean;
  finalImageUrl?: string;
  printImageUrl?: string;
  error?: string;
};

type OperatorLogEntry = {
  timestamp: string;
  message: string;
};

export default function Admin() {
  const router = useRouter();
  const {
    session,
    setPaymentStatus,
    resetSession,
    clearCapturedPhotos,
    clearFinalResult,
    setFinalImageUrl,
    setPrintImageUrl,
    setPrintStatus,
    setGreenScreenTuning,
  } = useSessionStore();
  const [cameraMode, setCameraMode] = useState("mock");
  const [cameraCommandConfigured, setCameraCommandConfigured] = useState(false);
  const [printerMode, setPrinterMode] = useState("mock");
  const [printerNameConfigured, setPrinterNameConfigured] = useState(false);
  const [cameraResult, setCameraResult] = useState<CaptureResult | null>(null);
  const [composeResult, setComposeResult] = useState<ComposeResult | null>(null);
  const [printTemplateResult, setPrintTemplateResult] = useState<PrintTemplateResult | null>(null);
  const [printResult, setPrintResult] = useState<PrintResult | null>(null);
  const [isTestingCamera, setIsTestingCamera] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [isGeneratingPrint, setIsGeneratingPrint] = useState(false);
  const [isTestingPrint, setIsTestingPrint] = useState(false);
  const [showResultsFolderInstruction, setShowResultsFolderInstruction] = useState(false);
  const [operatorLog, setOperatorLog] = useState<OperatorLogEntry[]>([
    {
      timestamp: new Date().toLocaleTimeString(),
      message: "Admin dashboard opened",
    },
  ]);

  function addOperatorLog(message: string) {
    setOperatorLog((current) => [
      {
        timestamp: new Date().toLocaleTimeString(),
        message,
      },
      ...current,
    ].slice(0, 8));
  }

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
      addOperatorLog("Print skipped: no print image URL");
      return;
    }

    setPrintStatus("queued");
    addOperatorLog("Print test queued");

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
      addOperatorLog(response.ok && payload.ok ? "Print test succeeded" : "Print test failed");
    } catch {
      setPrintResult({
        ok: false,
        error: "Print request failed",
      });
      setPrintStatus("failed");
      addOperatorLog("Print test failed: request error");
    }
  }

  async function generatePrintFile() {
    if (!session?.sessionId) {
      setPrintTemplateResult({
        ok: false,
        error: "No active session",
      });
      addOperatorLog("Print file generation failed: no active session");
      return;
    }

    setIsGeneratingPrint(true);
    setPrintTemplateResult(null);
    addOperatorLog("Regenerating print file");

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
        addOperatorLog("Print file regenerated");
      } else {
        addOperatorLog("Print file regeneration failed");
      }
    } catch {
      setPrintTemplateResult({
        ok: false,
        error: "Print file request failed",
      });
      addOperatorLog("Print file regeneration failed: request error");
    } finally {
      setIsGeneratingPrint(false);
    }
  }

  async function composeResultFile() {
    if (!session?.sessionId || !session.selectedFrameId || !session.selectedBackgroundId) {
      setComposeResult({
        ok: false,
        error: "Session needs a selected frame and background",
      });
      addOperatorLog("Compose failed: missing frame or background");
      return;
    }

    setIsComposing(true);
    setComposeResult(null);
    addOperatorLog("Regenerating final result");

    try {
      const response = await fetch("/api/results/compose", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: session.sessionId,
          capturedPhotos: session.capturedPhotos,
          selectedFrameId: session.selectedFrameId,
          selectedBackgroundId: session.selectedBackgroundId,
          options: session.greenScreenTuning || {
            applyChromaKey: true,
            greenMin: 90,
            greenTolerance: 35,
            spillReduction: 0,
            edgeSoftness: 0,
          },
        }),
      });
      const payload = (await response.json()) as ComposeResult;

      setComposeResult(payload);

      if (response.ok && payload.ok && payload.finalImageUrl && payload.printImageUrl) {
        setFinalImageUrl(payload.finalImageUrl);
        setPrintImageUrl(payload.printImageUrl);
        addOperatorLog("Final result regenerated");
      } else {
        addOperatorLog("Final result regeneration failed");
      }
    } catch {
      setComposeResult({
        ok: false,
        error: "Compose request failed",
      });
      addOperatorLog("Final result regeneration failed: request error");
    } finally {
      setIsComposing(false);
    }
  }

  async function testCameraCapture() {
    const testSessionId = session?.sessionId || `admin-test-${Date.now()}`;

    setIsTestingCamera(true);
    setCameraResult(null);
    addOperatorLog("Camera capture test started");

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
      addOperatorLog(payload.ok ? "Camera capture test succeeded" : "Camera capture test failed");
    } catch {
      setCameraResult({
        ok: false,
        error: "Camera capture request failed",
      });
      addOperatorLog("Camera capture test failed: request error");
    } finally {
      setIsTestingCamera(false);
    }
  }

  function clearCurrentSession() {
    resetSession();
    setCameraResult(null);
    setComposeResult(null);
    setPrintTemplateResult(null);
    setPrintResult(null);
    addOperatorLog("Current session cleared");
  }

  function clearFinalOutput() {
    clearFinalResult();
    setComposeResult(null);
    setPrintTemplateResult(null);
    setPrintResult(null);
    addOperatorLog("Final result and print image cleared from session");
  }

  const lastCameraError = cameraResult?.ok === false ? cameraResult.error : undefined;
  const lastComposeError = composeResult?.ok === false ? composeResult.error : undefined;
  const lastPrintError =
    printResult?.ok === false
      ? printResult.error
      : printTemplateResult?.ok === false
        ? printTemplateResult.error
        : undefined;
  const resultsFolderInstruction = session?.sessionId
    ? `Open this folder in File Explorer: public\\results\\${session.sessionId.replace(/[^a-zA-Z0-9_-]/g, "")}`
    : "No active session. Results are stored under public\\results\\{sessionId}.";

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
        {session?.capturedPhotos.length ? (
          <div className="admin-result">
            <strong>Captured Photos</strong>
            {session.capturedPhotos.map((photoUrl, index) => (
              <p key={`${photoUrl}-${index}`}>
                {index + 1}: {photoUrl.slice(0, 96)}
                {photoUrl.length > 96 ? "..." : ""}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <section className="admin-card">
        <h2>Operator Status</h2>
        <div className="admin-grid">
          <Field label="Last Camera Capture Error" value={lastCameraError} />
          <Field label="Last Compose Error" value={lastComposeError} />
          <Field label="Last Print Error" value={lastPrintError} />
        </div>
        <div className="admin-result">
          <strong>Status / Error Log</strong>
          {operatorLog.map((entry) => (
            <p key={`${entry.timestamp}-${entry.message}`}>
              {entry.timestamp}: {entry.message}
            </p>
          ))}
        </div>
        {showResultsFolderInstruction && (
          <div className="admin-result">
            <p>{resultsFolderInstruction}</p>
            <p>Windows shortcut: open File Explorer, paste the path, then press Enter.</p>
          </div>
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
            {cameraResult.sourceFilePath && <p>Source file: {cameraResult.sourceFilePath}</p>}
            {cameraResult.error && <p>Last capture error: {cameraResult.error}</p>}
          </div>
        )}
      </section>

      <section className="admin-card">
        <h2>Green Screen Tuning</h2>
        <div className="admin-grid" style={{ marginBottom: "1rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem" }}>
              <input
                type="checkbox"
                checked={session?.greenScreenTuning?.applyChromaKey ?? true}
                onChange={(e) => {
                  if (session) {
                    setGreenScreenTuning({
                      ...session.greenScreenTuning,
                      applyChromaKey: e.target.checked
                    });
                  }
                }}
              /> Apply Chroma Key
            </label>
            <p className="kiosk-message" style={{fontSize: "0.8rem"}}>Toggle whether background removal is applied.</p>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem" }}>
              Green Min (0-255): {session?.greenScreenTuning?.greenMin ?? 90}
            </label>
            <input
              type="range"
              min="0" max="255"
              value={session?.greenScreenTuning?.greenMin ?? 90}
              onChange={(e) => {
                if (session) {
                  setGreenScreenTuning({
                    ...session.greenScreenTuning,
                    greenMin: parseInt(e.target.value)
                  });
                }
              }}
            />
            <p className="kiosk-message" style={{fontSize: "0.8rem"}}>Increase if subject is being erased. Decrease if green background remains.</p>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem" }}>
              Green Tolerance (0-255): {session?.greenScreenTuning?.greenTolerance ?? 35}
            </label>
            <input
              type="range"
              min="0" max="255"
              value={session?.greenScreenTuning?.greenTolerance ?? 35}
              onChange={(e) => {
                if (session) {
                  setGreenScreenTuning({
                    ...session.greenScreenTuning,
                    greenTolerance: parseInt(e.target.value)
                  });
                }
              }}
            />
            <p className="kiosk-message" style={{fontSize: "0.8rem"}}>Increase if too much green remains. Decrease if subject edges are damaged.</p>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem" }}>
              Spill Reduction (0-100) <small>(TODO/Experimental)</small>: {session?.greenScreenTuning?.spillReduction ?? 0}
            </label>
            <input
              type="range"
              min="0" max="100"
              value={session?.greenScreenTuning?.spillReduction ?? 0}
              onChange={(e) => {
                if (session) {
                  setGreenScreenTuning({
                    ...session.greenScreenTuning,
                    spillReduction: parseInt(e.target.value)
                  });
                }
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem" }}>
              Edge Softness (0-20) <small>(TODO/Experimental)</small>: {session?.greenScreenTuning?.edgeSoftness ?? 0}
            </label>
            <input
              type="range"
              min="0" max="20"
              value={session?.greenScreenTuning?.edgeSoftness ?? 0}
              onChange={(e) => {
                if (session) {
                  setGreenScreenTuning({
                    ...session.greenScreenTuning,
                    edgeSoftness: parseInt(e.target.value)
                  });
                }
              }}
            />
          </div>
        </div>
        <button
          type="button"
          className="admin-action"
          onClick={() => {
            if (session) {
              setGreenScreenTuning({
                applyChromaKey: true,
                greenMin: 90,
                greenTolerance: 35,
                spillReduction: 0,
                edgeSoftness: 0,
              });
              addOperatorLog("Reset Green Screen Defaults");
            }
          }}
        >
          Reset Green Screen Defaults
        </button>
      </section>

      <section className="admin-card">
        <h2>Session Controls</h2>
        <div className="admin-action-row">
          <button
            type="button"
            className="admin-action"
            onClick={() => {
              setPaymentStatus("confirmed");
              addOperatorLog("Payment marked confirmed");
            }}
          >
            Confirm Payment
          </button>
          <button
            type="button"
            className="admin-action"
            onClick={() => {
              setPaymentStatus("failed");
              addOperatorLog("Payment marked failed");
            }}
          >
            Fail Payment
          </button>
          <button
            type="button"
            className="admin-action admin-action--muted"
            onClick={clearCurrentSession}
          >
            Clear Current Session
          </button>
          <button
            type="button"
            className="admin-action admin-action--muted"
            onClick={clearFinalOutput}
            disabled={!session?.finalImageUrl && !session?.printImageUrl}
          >
            Clear Final Result
          </button>
          <button
            type="button"
            className="admin-action admin-action--muted"
            onClick={() => {
              clearCapturedPhotos();
              addOperatorLog("Captured photos cleared");
            }}
          >
            Clear Captured Photos
          </button>
          <button
            type="button"
            className="admin-action admin-action--muted"
            onClick={() => {
              setShowResultsFolderInstruction((current) => !current);
              addOperatorLog("Results folder instruction toggled");
            }}
          >
            Open Results Folder Instruction
          </button>
          <button
            type="button"
            className="admin-action"
            onClick={composeResultFile}
            disabled={!session?.sessionId || isComposing}
          >
            {isComposing ? "Regenerating Final..." : "Regenerate Final Result"}
          </button>
          <button
            type="button"
            className="admin-action"
            onClick={generatePrintFile}
            disabled={!session?.sessionId || isGeneratingPrint}
          >
            {isGeneratingPrint ? "Regenerating Print..." : "Regenerate Print File"}
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
            Open Final Result
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
            Open Print Image
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
        </div>
        {composeResult && (
          <div className="admin-result">
            <p>Compose result: {composeResult.ok ? "success" : "failed"}</p>
            {composeResult.finalImageUrl && <p>Final URL: {composeResult.finalImageUrl}</p>}
            {composeResult.printImageUrl && <p>Print URL: {composeResult.printImageUrl}</p>}
            {composeResult.error && <p>Error: {composeResult.error}</p>}
          </div>
        )}
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
